# Security checklist — every item must be present, not deferred

Verify each of these exists in the generated project before calling it done. This is the
enforcement list for the "Non-negotiable defaults" in `SKILL.md`.

## Secrets / env

- [ ] `web/.env.example` contains only `VITE_`-prefixed public values (API base URL,
      publishable keys). No DB creds, no JWT secret, no R2 keys anywhere in the `web` repo.
- [ ] `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `.dev.vars`, `.wrangler/`.
- [ ] `wrangler.toml` has no `[vars]` entries for anything secret — secrets go through
      `wrangler secret put` (prod) or `.dev.vars` (local, gitignored), never committed.
- [ ] CI workflow references secrets only via `${{ secrets.* }}`, never echoes them to logs.

## AuthN / AuthZ

- [ ] Access token short-lived, never written to `localStorage`/`sessionStorage`.
- [ ] Refresh token in `httpOnly; Secure; SameSite=Strict` cookie.
- [ ] Every route that mutates state or reads privileged data has an explicit role check in
      middleware — deny by default, not "everything open except what I remembered to lock."
- [ ] Admin API routes check `role === 'admin'` server-side regardless of the request path —
      the obscured path is not treated as sufficient by itself (see `architecture.md`).
- [ ] Frontend admin route guard exists for UX only; removing it must not change what the API
      allows.

## Input handling

- [ ] Every route handler validates `body`/`query`/`params` through a Zod schema before use —
      no `req.json()` result touching the DB unvalidated.
- [ ] String fields are trimmed and checked for control characters / null bytes.
- [ ] Any rich-text/HTML field goes through an explicit sanitize function with an allowlist —
      never rendered raw, never stored raw if it's ever rendered as HTML later.
- [ ] File uploads to R2 validate content-type and size **before** the R2 write, from an
      allowlist — not by trusting the client-supplied `Content-Type` header alone (sniff magic
      bytes for anything that will later be served back).

## Rate limiting

- [ ] Auth endpoints (`/auth/login`, `/auth/refresh`, `/auth/register`) have the strictest
      limits (5/15min class).
- [ ] All other routes have a limit appropriate to their cost (reads looser, writes/exports
      tighter).
- [ ] Rate limit key includes the real client IP (`cf-connecting-ip`, not a spoofable
      `x-forwarded-for`) plus account/user id where applicable, so an attacker can't rotate one
      dimension to bypass the other.
- [ ] 429 responses include `Retry-After`.

## Pagination

- [ ] Every list endpoint is cursor-based (opaque cursor, not raw `OFFSET`), so deep pages don't
      degrade into full-table scans.
- [ ] Server enforces a max page size regardless of what the client requests.

## API contract / error handling

- [ ] Every response follows the `{ success, data }` / `{ success: false, error: { code,
      message } }` envelope — no raw arrays, no bare error strings, no stack traces reaching the
      client in production.
- [ ] The top-level error handler distinguishes expected errors (validation, 404, 403 — return
      the real status code and a useful message) from unexpected ones (log full detail
      server-side, return a generic 500 message to the client).
- [ ] CORS is an explicit origin allowlist, not `*`, whenever the API accepts cookies/credentials.

## Frontend state handling

- [ ] Every data-fetching component has a loading state (skeleton, not a blank screen).
- [ ] Every mutation shows a success or error `sonner` toast — no silent failure a user could
      miss (e.g. a submit button that just... does nothing on error).
- [ ] Network/API errors surface the server's `error.message` when it's a validation error meant
      for the user; generic errors ("Something went wrong, try again") for 500s — never show a
      raw exception or stack trace in the UI.

## CI/CD & repo hygiene

- [ ] `husky` pre-commit runs lint-staged (eslint --fix, prettier) on staged files only.
- [ ] `husky` pre-push runs typecheck + tests — nothing broken reaches a shared branch.
- [ ] CI (GitHub Actions) runs lint, typecheck, test, build on every PR; deploy job is gated to
      `main` and requires the Cloudflare API token/account ID from repo secrets, never hardcoded.
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `.wrangler/`, `*.local`, `.DS_Store`,
      coverage output, and all env-secret files.

## Dependencies

- [ ] Every new package (in either repo) was checked against `package-vetting.md` before
      being added — name-typosquat check, registry download count, install-script review,
      `npm audit` clean, lockfile committed, `npm ci` used in CI (not `npm install`).

If a later change to the project violates one of these (e.g. someone adds an unpaginated list
endpoint, or a new admin route without the rbac middleware), that's exactly the kind of drift
`security-audit-orchestrator` (specifically `rate-limiting-audit`, `access-control-auditing`,
`mass-assignment-audit`, `dependency-security-audit`) is built to catch on a re-audit.
