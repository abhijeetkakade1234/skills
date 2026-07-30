# API core — repo plumbing, not a feature

Everything here is app-wide: config, wiring, types, cross-cutting middleware that isn't big
enough to be its own feature. Set this up before any feature folder.

## `package.json`

Dependency versions below are what was current at time of writing — check
[npmjs.com](https://www.npmjs.com/) for the latest, and run each through
`../../reference/package-vetting.md` before installing regardless.

```json
{
  "name": "PROJECT-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "hono": "^4.6.9",
    "jose": "^5.9.6",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241022.0",
    "@hono/zod-validator": "^0.4.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4",
    "wrangler": "^3.83.0",
    "eslint": "^9.14.0",
    "@typescript-eslint/eslint-plugin": "^8.13.0",
    "@typescript-eslint/parser": "^8.13.0",
    "prettier": "^3.3.3",
    "husky": "^9.1.6",
    "lint-staged": "^15.2.10"
  }
}
```

`jose` handles JWT sign/verify — it's edge-runtime compatible (unlike `jsonwebtoken`, which
assumes Node's `crypto` module shape). Confirm you're installing the real `jose`
(https://github.com/panva/jose), not a similarly-named package.

## `wrangler.toml`

[Docs](https://developers.cloudflare.com/workers/wrangler/configuration/). Public config only —
anything sensitive goes through `wrangler secret put`, never in this file.

```toml
name = "PROJECT-api"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "development"
ALLOWED_ORIGIN = "http://localhost:5173"
ADMIN_ROUTE_PATH = "admin-REPLACE-WITH-RANDOM-SLUG"   # documentation only — the live
                                                        # mount is a static path in index.ts,
                                                        # see features/rbac/README.md

[[d1_databases]]
binding = "DB"
database_name = "PROJECT-db"
database_id = "REPLACE_WITH_WRANGLER_D1_CREATE_OUTPUT"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "REPLACE_WITH_WRANGLER_KV_NAMESPACE_CREATE_OUTPUT"

[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "PROJECT-uploads"

# JWT_SECRET: run `wrangler secret put JWT_SECRET` — do not add it here.
```

## `.dev.vars` (gitignored — copy from `.dev.vars.example`)

```
JWT_SECRET=replace-with-a-long-random-local-only-secret
```

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

## `src/core/types.ts`

Bindings type shared by every feature's middleware/route file.

```ts
export type Bindings = {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  UPLOADS: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: 'development' | 'production';
  ALLOWED_ORIGIN: string;
  ADMIN_ROUTE_PATH: string;
};

export type Role = 'user' | 'editor' | 'admin'; // see features/rbac/README.md

export type AuthedUser = {
  id: string;
  email: string;
  role: Role;
};

export type Variables = {
  user: AuthedUser;
};
```

## `src/core/errors.ts`

Route handlers throw `ApiError`; the top-level handler below turns it into the uniform
envelope. Nothing else in the app formats an error response directly.

```ts
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const Errors = {
  validation: (message: string) => new ApiError(422, 'validation_error', message),
  unauthorized: (message = 'Authentication required') => new ApiError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have access to this resource') =>
    new ApiError(403, 'forbidden', message),
  notFound: (message = 'Resource not found') => new ApiError(404, 'not_found', message),
  conflict: (message: string) => new ApiError(409, 'conflict', message),
  rateLimited: (message = 'Too many requests') => new ApiError(429, 'rate_limited', message),
};
```

## `src/core/error-handler.ts`

```ts
import type { ErrorHandler } from 'hono';
import { ApiError } from './errors';
import type { Bindings, Variables } from './types';

export const errorHandler: ErrorHandler<{ Bindings: Bindings; Variables: Variables }> = (err, c) => {
  if (err instanceof ApiError) {
    return c.json({ success: false, error: { code: err.code, message: err.message } }, err.status);
  }
  // Unexpected error: log full detail server-side (visible in `wrangler tail`), return a
  // generic message. Never leak err.message/err.stack to the client — can contain internal
  // paths or library internals.
  console.error('Unhandled error', err);
  return c.json(
    { success: false, error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } },
    500,
  );
};
```

## `src/core/security-headers.ts`

```ts
import { createMiddleware } from 'hono/factory';
import type { Bindings, Variables } from './types';

// Strict CSP is safe here because this Worker only ever returns JSON/binary, never HTML.
export const securityHeaders = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    c.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    if (c.env.ENVIRONMENT === 'production') {
      c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
  },
);
```

## `src/core/schema.sql`

Applied via `wrangler d1 execute PROJECT-db --file=src/core/schema.sql`.
[D1 SQL reference](https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/).

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id),
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_owner_created ON files (owner_id, created_at);
```

## `src/index.ts` — app wiring

Pulls in every feature. This is the only file that assembles the middleware order — see
`../../reference/architecture.md`'s request-flow diagram for why the order matters (rate
limit before auth so an anonymous flood gets throttled before it reaches a DB call; auth
before rbac so rbac has a `user` to check).

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { securityHeaders } from './core/security-headers';
import { errorHandler } from './core/error-handler';
import { authRoutes } from './features/auth/routes';
import { adminRoutes } from './features/rbac/routes';
import { fileRoutes } from './features/files/routes';
import type { Bindings, Variables } from './core/types';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', securityHeaders);

app.use(
  '*',
  cors({
    origin: (origin, c) => (origin === c.env.ALLOWED_ORIGIN ? origin : ''),
    credentials: true, // required for the httpOnly refresh cookie
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.onError(errorHandler);

app.get('/health', (c) => c.json({ success: true, data: { status: 'ok' } }));

app.route('/auth', authRoutes);
app.route('/files', fileRoutes);

// Static mount at a generated random slug, not a literal `/admin` — see
// reference/architecture.md and features/rbac/README.md for the doctrine. Replace the
// literal path below with your generated slug at scaffold time.
app.route('/admin-REPLACE-WITH-RANDOM-SLUG', adminRoutes);

export default app;
```

## `.gitignore`

```
node_modules/
.env
.env.*
!.env.example
.dev.vars
.dev.vars.*
dist/
.wrangler/
*.tsbuildinfo
coverage/
*.log
.DS_Store
```

## `.eslintrc` / `eslint.config.js`, `.prettierrc.json`, `.lintstagedrc.json`

Same shape as the web repo's — see `../../web/config/README.md`'s tooling section, copy and
adjust `files` globs for a backend-only repo (no `react-hooks` plugin needed here).

## `.husky/pre-commit`

```
npx lint-staged
```

## `.husky/pre-push`

```
npm run typecheck && npm run test
```

## `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test

  deploy:
    needs: verify
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

[wrangler-action docs](https://github.com/cloudflare/wrangler-action).
