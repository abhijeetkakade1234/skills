# API repo — Hono on Cloudflare Workers

Separate repo from `web/` — see `../reference/architecture.md` for why. Deployed via `wrangler`.

Docs: [Workers](https://developers.cloudflare.com/workers/) ·
[Hono](https://hono.dev/) · [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers) ·
[D1](https://developers.cloudflare.com/d1/) · [KV](https://developers.cloudflare.com/kv/) ·
[R2](https://developers.cloudflare.com/r2/) · [Wrangler](https://developers.cloudflare.com/workers/wrangler/)

## Layout

```
src/
  core/               wrangler config, types, app wiring, error handler, security headers,
                       db schema — see core/README.md
  features/
    auth/              features/auth/README.md
    rbac/              features/rbac/README.md
    files/             features/files/README.md
    rate-limiting/      features/rate-limiting/README.md
    pagination/         features/pagination/README.md
```

## Setup order

1. `npm init -y`, then work through `core/README.md` first — every feature depends on the
   wrangler bindings, types, and app wiring it defines.
2. Add dependencies feature-by-feature as you build them, vetting each against
   `../reference/package-vetting.md` before installing.
3. Once `core` + `auth` + `rbac` are in place, create the Cloudflare resources (only after
   confirming with the user — these mutate the Cloudflare account):
   ```
   wrangler d1 create <project>-db
   wrangler kv namespace create <project>-kv
   wrangler r2 bucket create <project>-uploads
   wrangler d1 execute <project>-db --file=src/core/schema.sql
   wrangler secret put JWT_SECRET
   ```
4. `npx husky init` for the pre-commit/pre-push hooks in `core/README.md`.
5. `wrangler dev` for local dev; `wrangler deploy` only on explicit request (deploying is not
   reversible the way local file changes are).
