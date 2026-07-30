# Feature: pagination

Cursor-based, not `OFFSET`-based — a deep page on `OFFSET` degrades into a full-table scan
and lets a client cheaply enumerate row counts by binary-searching offsets.

## `src/features/pagination/schema.ts`

```ts
import { z } from 'zod';

// Every list endpoint accepts exactly this shape. `limit` is clamped again server-side
// (see lib.ts) — this schema bound just rejects obviously abusive values early.
export const paginationQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), nextCursor: z.string().nullable(), hasMore: z.boolean() });
}
```

## `src/features/pagination/lib.ts`

```ts
const MAX_LIMIT = 100;

// Cursor is an opaque base64 encoding of the last row's sort key (id/created_at) — never
// a raw client-suppliable OFFSET.
export function encodeCursor(lastSortValue: string): string {
  return btoa(lastSortValue);
}

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  try {
    return atob(cursor);
  } catch {
    return undefined; // malformed cursor — treat as "start from beginning", don't 500
  }
}

// Server-side clamp regardless of what the client requested — the Zod schema already caps
// this at 100, but clamp again here so pagination stays safe even if a route ever skips
// schema validation by mistake.
export function clampLimit(requested: number): number {
  return Math.min(Math.max(1, requested), MAX_LIMIT);
}

export function buildPage<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  sortKey: keyof T,
): { data: T[]; nextCursor: string | null; hasMore: boolean } {
  // Query for `limit + 1` rows upstream so we can tell if there's a next page without a
  // separate COUNT(*) query. Trim the extra row before returning.
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return { data, nextCursor: hasMore && last ? encodeCursor(String(last[sortKey])) : null, hasMore };
}
```
