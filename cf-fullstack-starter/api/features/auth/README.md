# Feature: auth

Register/login/refresh/logout. Stateless JWT — see
[`../../../reference/architecture.md`](../../../reference/architecture.md#auth-stateless-jwt)
for the access/refresh split rationale.

Docs: [jose](https://github.com/panva/jose) ·
[Zod](https://zod.dev/) ·
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) ·
[Web Crypto `deriveBits`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits)

## `src/features/auth/schema.ts`

```ts
import { z } from 'zod';

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v), 'Contains invalid control characters');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12).max(256);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: safeText(120),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  name: safeText(120),
  role: z.enum(['user', 'editor', 'admin']),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;
```

## `src/features/auth/password.ts`

PBKDF2 via Web Crypto — no extra dependency, and it runs natively in the Workers runtime
(unlike `bcrypt`, which needs a native binding that doesn't work at the edge).
210,000 iterations is the [OWASP 2024 floor for PBKDF2-HMAC-SHA256](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2).

```ts
const ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, keyMaterial, KEY_LENGTH_BITS,
  );
  // Store iterations alongside the hash so a future bump doesn't break verifying old hashes.
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${toHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsStr, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: Number(iterationsStr), hash: 'SHA-256' },
    keyMaterial, KEY_LENGTH_BITS,
  );
  const a = toHex(derived), b = hashHex;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0; // compare full length regardless of early mismatch — smaller timing leak
}
```

## `src/features/auth/jwt.ts`

```ts
import { SignJWT, jwtVerify } from 'jose';
import type { AuthedUser } from '../../core/types';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;      // short-lived, held in memory client-side
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // httpOnly cookie only

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(user: AuthedUser, secret: string) {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(secret));
}

export async function signRefreshToken(userId: string, secret: string) {
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(secret));
}

export async function verifyToken(token: string, secret: string) {
  const { payload } = await jwtVerify(token, secretKey(secret));
  return payload;
}

export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_COOKIE_MAX_AGE = REFRESH_TOKEN_TTL_SECONDS;
```

## `src/features/auth/middleware.ts`

Verifies the bearer token and attaches `user` to context. Every non-public route runs this —
there is no "trust what the frontend claims" path anywhere in the app.

```ts
import { createMiddleware } from 'hono/factory';
import { Errors } from '../../core/errors';
import { verifyToken } from './jwt';
import type { Bindings, Variables, Role } from '../../core/types';

const ROLES: Role[] = ['user', 'editor', 'admin'];

export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();
    const token = header.slice('Bearer '.length);

    let payload;
    try {
      payload = await verifyToken(token, c.env.JWT_SECRET);
    } catch {
      throw Errors.unauthorized('Invalid or expired token');
    }

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || !ROLES.includes(payload.role as Role)) {
      throw Errors.unauthorized('Malformed token');
    }
    c.set('user', { id: payload.sub, email: payload.email as string, role: payload.role as Role });
    await next();
  },
);
```

## `src/features/auth/routes.ts`

```ts
import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { loginSchema, registerSchema } from './schema';
import { Errors } from '../../core/errors';
import { hashPassword, verifyPassword } from './password';
import { signAccessToken, signRefreshToken, verifyToken, REFRESH_COOKIE_NAME, REFRESH_COOKIE_MAX_AGE } from './jwt';
import { authRateLimit } from '../rate-limiting/middleware';
import type { Bindings, Variables } from '../../core/types';

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

authRoutes.post('/register', authRateLimit, zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) throw Errors.conflict('An account with this email already exists');

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, passwordHash, name, 'user').run();

  const user = { id, email, role: 'user' as const };
  const accessToken = await signAccessToken(user, c.env.JWT_SECRET);
  const refreshToken = await signRefreshToken(id, c.env.JWT_SECRET);
  setRefreshCookie(c, refreshToken, c.env.ENVIRONMENT === 'production');
  return c.json({ success: true, data: { accessToken, user } }, 201);
});

authRoutes.post('/login', authRateLimit, zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const row = await c.env.DB.prepare('SELECT id, email, password_hash, role FROM users WHERE email = ?')
    .bind(email).first<{ id: string; email: string; password_hash: string; role: 'user' | 'editor' | 'admin' }>();

  // Same error for "no such user" and "wrong password" — distinguishing them lets an
  // attacker enumerate valid emails.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw Errors.unauthorized('Invalid email or password');
  }

  const user = { id: row.id, email: row.email, role: row.role };
  const accessToken = await signAccessToken(user, c.env.JWT_SECRET);
  const refreshToken = await signRefreshToken(row.id, c.env.JWT_SECRET);
  setRefreshCookie(c, refreshToken, c.env.ENVIRONMENT === 'production');
  return c.json({ success: true, data: { accessToken, user } });
});

authRoutes.post('/refresh', authRateLimit, async (c) => {
  const token = getCookie(c, REFRESH_COOKIE_NAME);
  if (!token) throw Errors.unauthorized();

  let payload;
  try {
    payload = await verifyToken(token, c.env.JWT_SECRET);
  } catch {
    throw Errors.unauthorized('Invalid or expired session');
  }
  if (payload.type !== 'refresh' || typeof payload.sub !== 'string') throw Errors.unauthorized();

  const row = await c.env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?')
    .bind(payload.sub).first<{ id: string; email: string; role: 'user' | 'editor' | 'admin' }>();
  if (!row) throw Errors.unauthorized();

  const accessToken = await signAccessToken(row, c.env.JWT_SECRET);
  return c.json({ success: true, data: { accessToken } });
});

authRoutes.post('/logout', async (c) => {
  deleteCookie(c, REFRESH_COOKIE_NAME, { path: '/' });
  return c.json({ success: true, data: null });
});

function setRefreshCookie(c: any, token: string, isProd: boolean) {
  setCookie(c, REFRESH_COOKIE_NAME, token, {
    httpOnly: true, secure: isProd, sameSite: 'Strict', path: '/', maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}
```
