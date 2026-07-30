# Architecture

## Two repos, not a monorepo

`api/` and `web/` in this skill are two **separate repositories** — a Workers/Hono backend and
a Pages/React frontend, deployed and versioned independently. There is no shared workspace
package; the contract between them is the API's response shape (documented per-feature) plus
whatever Zod schema each side defines for itself. Duplicating a small schema (e.g. the shape of
a `User`) in both repos is the accepted cost of independent deploys — don't reach for a shared
npm package across two separate repos just to avoid a few duplicated lines; that couples their
release cycles for no real benefit at this scale.

## Feature-folder convention (both repos)

Group by feature, not by technical layer. A feature owns its own routes/schema/service files;
don't scatter one feature's code across a repo-wide `routes/`, `services/`, `models/` split.

```
api/
  src/
    core/            app-wide plumbing: index.ts wiring, error handler, security headers,
                      types, db schema — anything not specific to one feature
    features/
      auth/           routes + schema + jwt/password helpers, all in one place
      rbac/           roles + the requireRole middleware
      files/          upload routes + R2 helpers
      rate-limiting/  the rate-limit middleware (cross-cutting, but small enough to keep as
                      its own feature folder rather than dumping it in core/)
      pagination/     cursor pagination helper (cross-cutting, same reasoning)

web/
  src/
    features/
      auth/           auth-store, useAuth hook, api-client (incl. refresh flow)
      admin/          AdminRoute guard, AdminPage, admin-path constant
      core-ui/         AsyncBoundary, query-client + toast wiring, App shell
      home/            landing/404 pages
    config/            vite/tsconfig/tailwind/eslint/prettier/husky/CI — repo plumbing, not
                        a feature
```

When a new feature is added later (e.g. `billing/`, `notifications/`), it gets its own folder
on both sides with the same shape — route/schema/service on the API, hook/component/api-client
usage on the frontend. Don't grow `core/` to hold feature-specific code just because it was
convenient to bolt on.

## Request flow

```
Browser (Pages, web repo)
  → fetch via web/features/auth's api-client (adds Authorization header, no secrets)
  → Cloudflare Worker (api repo)
      1. security-headers middleware   (CSP, X-Content-Type-Options, etc. — core/)
      2. CORS middleware                (allowlist origin, not '*' — core/)
      3. rate-limit middleware          (KV counter, per-IP+route, 429 + Retry-After — features/rate-limiting)
      4. auth middleware                (verify JWT, attach ctx.user — features/auth)
      5. rbac middleware                (route-declared required role, deny by default — features/rbac)
      6. zod validator middleware       (parse body/query, strip/reject unknown fields)
      7. route handler                  (business logic, talks to D1 / R2 / KV)
      8. error handler (top-level)      (catches throws, uniform envelope, no stack to client — core/)
  ← { success, data } | { success: false, error }
Browser: TanStack Query resolves loading/success/error → shadcn `sonner` toast on error, inline
  skeleton on loading, rendered data on success (web/features/core-ui).
```

Every middleware in that chain is server-side. The frontend route guard (`AdminRoute`) exists
purely so an unauthorized user doesn't see a flash of admin UI before redirecting — it is not a
security control. If someone opens devtools, disables JS routing, and calls the admin API
endpoint directly, step 5 (`rbac` middleware) is what actually stops them. This is the same
"backend is truth" doctrine `security-audit-orchestrator` audits against — anything scaffolded
from this skill should already pass that audit on day one.

## Why D1 by default, and when not to

D1 (SQLite at the edge — https://developers.cloudflare.com/d1/) is the default because most CRUD
apps need relational queries (joins, foreign keys, transactions) and D1 needs zero extra
infrastructure — it's a Workers binding like KV or R2. Swap it for:

- **KV + Durable Objects only**, if the entire data model really is key-value with no relational
  queries (e.g. a pure counter/leaderboard service, or per-user blobs with no cross-user
  querying). Don't force D1 onto a shape that doesn't need it, but don't reach for KV-only just
  because it's simpler to wire up — the moment you need "all orders for this user, joined with
  product names," you need D1.
- **Postgres via Hyperdrive**, if the project already runs Postgres elsewhere (Neon, Supabase,
  RDS) and migrating data is more costly than the extra connection hop. Hyperdrive
  (https://developers.cloudflare.com/hyperdrive/) pools the connection so Workers don't exhaust
  Postgres connection limits.

KV in this template is **only** used for rate-limit counters and short-TTL response caching — it
is never the system of record for anything that needs strong consistency (KV is eventually
consistent across edge locations — see https://developers.cloudflare.com/kv/reference/consistency/).

## Admin route obscurity — what it buys and what it doesn't

The admin path is a random slug (not `/admin`). This is a deterrent, not a security boundary:

- It **does** stop the admin surface from showing up in the main JS bundle (code-split via
  `React.lazy`, no nav link rendered until the client already knows the user is an admin), so
  a casual user browsing devtools' Sources tab or a bot crawling common paths (`/admin`,
  `/wp-admin`, `/dashboard`) won't find it.
- It **does not** stop someone who has the URL (leaked, guessed via bundle chunk names, found via
  a `robots.txt` mistake, shared by another admin) — that's why the API-side `rbac` middleware
  requiring `role=admin` runs on every admin request unconditionally, independent of path. If a
  future contributor suggests "we can skip the auth check there, the route's already hidden," that
  is the fail-open mistake `fail-open-error-handling` and `access-control-auditing` exist to catch.

## Auth: stateless JWT

Access token: short-lived (15 min), returned in the JSON body, held in memory on the client (not
`localStorage` — XSS-readable storage of a bearer token is a common finding in
`jwt-cryptography-audit`). Refresh token: longer-lived, set as an `httpOnly`, `Secure`,
`SameSite=Strict` cookie so client JS can never read it; a `/auth/refresh` route rotates it.
Logout clears the cookie server-side (`Set-Cookie` with `Max-Age=0`) — there is no server session
to revoke since the scheme is stateless, so a compromised access token is only exploitable for its
15-minute window.
