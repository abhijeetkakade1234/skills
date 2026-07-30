# Feature: rbac (+ the admin route)

Role hierarchy and the middleware that enforces it. Read
[`../../../reference/architecture.md`](../../../reference/architecture.md#admin-route-obscurity--what-it-buys-and-what-it-doesnt)
before wiring the admin route — the path being non-obvious is a deterrent, **this middleware
is the actual gate**.

## `src/features/rbac/roles.ts`

```ts
export const ROLES = ['user', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = { user: 0, editor: 1, admin: 2 };

export function hasAtLeastRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
```

## `src/features/rbac/middleware.ts`

Mount AFTER `requireAuth` (from `features/auth/middleware.ts`). Deny-by-default: if `user`
isn't on context, this throws rather than silently letting the request through.

```ts
import { createMiddleware } from 'hono/factory';
import { hasAtLeastRole } from './roles';
import { Errors } from '../../core/errors';
import type { Bindings, Variables, Role } from '../../core/types';

export function requireRole(required: Role) {
  return createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
    const user = c.get('user');
    if (!user) throw Errors.unauthorized();
    if (!hasAtLeastRole(user.role, required)) {
      // 404, not 403: a 403 confirms the resource exists to someone probing without
      // access. Use 403 instead if your threat model doesn't care about existence leaks.
      throw Errors.notFound();
    }
    await next();
  });
}
```

## `src/features/rbac/routes.ts`

Example admin-only route (paginated user list) — see
[`../pagination/README.md`](../pagination/README.md) for `buildPage`/`clampLimit`.

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../auth/middleware';
import { requireRole } from './middleware';
import { readRateLimit } from '../rate-limiting/middleware';
import { clampLimit, decodeCursor, buildPage } from '../pagination/lib';
import { paginationQuerySchema } from '../pagination/schema';
import { userSchema } from '../auth/schema';
import type { Bindings, Variables } from '../../core/types';

export const adminRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Every request under this router — regardless of the mount path in index.ts — re-checks
// role here. This is the ONLY thing that actually gates the admin surface.
adminRoutes.use('*', requireAuth, requireRole('admin'));

adminRoutes.get('/users', readRateLimit, zValidator('query', paginationQuerySchema), async (c) => {
  const { cursor, limit } = c.req.valid('query');
  const clamped = clampLimit(limit);
  const after = decodeCursor(cursor);

  const rows = await c.env.DB.prepare(
    `SELECT id, email, name, role, created_at as createdAt FROM users
     WHERE (? IS NULL OR created_at > ?) ORDER BY created_at ASC LIMIT ?`,
  ).bind(after ?? null, after ?? null, clamped + 1).all();

  const page = buildPage(rows.results as Record<string, unknown>[], clamped, 'createdAt');
  return c.json({ success: true, data: { ...page, data: page.data.map((r) => userSchema.parse(r)) } });
});
```

## Mounting the admin route

In `src/index.ts` (see `../../core/README.md`):

```ts
// Static mount at a generated random slug — replace at scaffold time, e.g.
// app.route('/admin-9f2ke1lp', adminRoutes)
app.route('/admin-REPLACE-WITH-RANDOM-SLUG', adminRoutes);
```

Generate the slug once (8+ random alphanumeric chars), keep it out of anywhere it'd be
guessable (don't name it `admin-secret` or similar), and don't rely on it alone — see the
doctrine link at the top of this file. If a future PR proposes removing `requireRole('admin')`
"since the route is obscured anyway," that's the exact fail-open mistake
`access-control-auditing` and `fail-open-error-handling` (in `security-audit-orchestrator`)
exist to catch.
