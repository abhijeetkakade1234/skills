# Feature: files (R2 uploads)

Docs: [R2](https://developers.cloudflare.com/r2/) ·
[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

## `src/features/files/schema.ts`

```ts
import { z } from 'zod';

// Narrow allowlist by design — widen per-project, don't default to "anything the client claims."
export const ALLOWED_UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;

export const uploadMetadataSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024), // 10 MB — tune per project
});
```

## `src/features/files/r2.ts`

We never trust the client-supplied `Content-Type` header alone before writing to R2 —
especially for anything later served back and rendered (an SVG mislabeled as PNG could
carry a script payload). Sniff magic bytes instead.

```ts
import { ALLOWED_UPLOAD_MIME_TYPES } from './schema';
import { Errors } from '../../core/errors';

const SIGNATURES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // 'RIFF' — full WEBP check also needs offset 8 'WEBP'
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // '%PDF'
};

function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

export async function validateUploadOrThrow(file: ArrayBuffer, claimedContentType: string, maxSizeBytes: number) {
  if (file.byteLength === 0 || file.byteLength > maxSizeBytes) {
    throw Errors.validation(`File size must be between 1 byte and ${maxSizeBytes} bytes`);
  }
  const signatures = SIGNATURES[claimedContentType];
  if (!signatures) throw Errors.validation('Unsupported file type');
  const head = new Uint8Array(file.slice(0, 16));
  if (!signatures.some((sig) => matchesSignature(head, sig))) {
    throw Errors.validation('File content does not match its declared type');
  }
}

export function buildObjectKey(userId: string, filename: string): string {
  // Namespace by user id so a path-traversal-style filename can't collide across users.
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-200);
  return `${userId}/${crypto.randomUUID()}-${safeName}`;
}
```

## `src/features/files/routes.ts`

Downloads are streamed through the Worker with an ownership check rather than a presigned R2
URL — keeps "can this user access this file" one server-side decision instead of a
separately-expiring URL that can be shared/leaked.

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { uploadMetadataSchema } from './schema';
import { validateUploadOrThrow, buildObjectKey } from './r2';
import { requireAuth } from '../auth/middleware';
import { writeRateLimit, readRateLimit } from '../rate-limiting/middleware';
import { paginationQuerySchema } from '../pagination/schema';
import { clampLimit, decodeCursor, buildPage } from '../pagination/lib';
import { Errors } from '../../core/errors';
import type { Bindings, Variables } from '../../core/types';

export const fileRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
fileRoutes.use('*', requireAuth);

fileRoutes.post('/', writeRateLimit, async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw Errors.validation('Missing file field');

  const metadata = uploadMetadataSchema.parse({ filename: file.name, contentType: file.type, sizeBytes: file.size });
  const buffer = await file.arrayBuffer();
  await validateUploadOrThrow(buffer, metadata.contentType, metadata.sizeBytes);

  const user = c.get('user');
  const objectKey = buildObjectKey(user.id, metadata.filename);
  await c.env.UPLOADS.put(objectKey, buffer, { httpMetadata: { contentType: metadata.contentType } });

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO files (id, owner_id, object_key, filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, user.id, objectKey, metadata.filename, metadata.contentType, metadata.sizeBytes).run();

  return c.json({ success: true, data: { id, filename: metadata.filename } }, 201);
});

fileRoutes.get('/', readRateLimit, zValidator('query', paginationQuerySchema), async (c) => {
  const { cursor, limit } = c.req.valid('query');
  const clamped = clampLimit(limit);
  const after = decodeCursor(cursor);
  const user = c.get('user');

  const rows = await c.env.DB.prepare(
    `SELECT id, filename, content_type as contentType, size_bytes as sizeBytes, created_at as createdAt
     FROM files WHERE owner_id = ? AND (? IS NULL OR created_at > ?) ORDER BY created_at ASC LIMIT ?`,
  ).bind(user.id, after ?? null, after ?? null, clamped + 1).all();

  return c.json({ success: true, data: buildPage(rows.results as Record<string, unknown>[], clamped, 'createdAt') });
});

fileRoutes.get('/:id', readRateLimit, async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT object_key as objectKey, content_type as contentType, owner_id as ownerId FROM files WHERE id = ?',
  ).bind(c.req.param('id')).first<{ objectKey: string; contentType: string; ownerId: string }>();

  if (!row || (row.ownerId !== user.id && user.role !== 'admin')) throw Errors.notFound();

  const object = await c.env.UPLOADS.get(row.objectKey);
  if (!object) throw Errors.notFound();

  return new Response(object.body, { headers: { 'Content-Type': row.contentType, 'Cache-Control': 'private, max-age=3600' } });
});
```
