---
name: cf-fullstack-starter
description: >
  Reference/instructions for scaffolding a production-grade full-stack web app as two separate
  repos on Cloudflare: a Hono API on Cloudflare Workers (D1 for relational data, KV for
  caching/rate-limit counters, R2 for file storage, Zod validation, RBAC, JWT auth) and a
  React + TypeScript + shadcn/ui frontend on Cloudflare Pages. Organized feature-first (each
  feature owns its routes/schema/components together, not split across repo-wide layers).
  Every reference doc includes real doc links and copy-adaptable code blocks, plus a
  package-vetting step before any dependency is installed. Use when the user asks to "start a
  new web app", "scaffold a project", "set up Cloudflare Pages + Workers", "create a base
  template", "new full-stack app", or names this stack (Hono, D1, R2, shadcn, Cloudflare
  Workers) for a fresh project.
---

# Cloudflare Full-Stack Starter

This skill is a **reference**, not a codebase. Nothing under this skill's directory is meant to
be copied byte-for-byte into a project — the `.md` files here contain explanation, real doc
links, and code *blocks* to adapt (rename, extend, trim) as you write the actual project files
in the target repo. Generating a project means writing new files in the user's target
directory using these as your guide, not `cp -r` from this skill.

## Stack (fixed)

| Layer | Choice | Why |
|---|---|---|
| Repos | **Two separate repos**: `api` (Workers/Hono) and `web` (Pages/React) | Independent deploy cadence; no shared workspace coupling their release cycles — see `reference/architecture.md` |
| Frontend host | Cloudflare Pages | Same account/edge as the Worker, free TLS, preview deploys per PR |
| Frontend | React + TypeScript + Vite | Fast dev loop, standard shadcn target |
| UI kit | shadcn/ui + Tailwind | Copy-in components, no runtime dep, easy to theme |
| API host | Cloudflare Workers | Same edge, zero cold-start VM management |
| API framework | Hono | Tiny, typed, first-class Workers support, middleware model |
| Validation | Zod | Parse-don't-validate, defined once per repo (not shared across repos — see architecture doc) |
| Relational data | D1 (SQLite) | Native binding, no extra infra. Swap-out: Postgres via Hyperdrive if the project already has one |
| Cache / counters | Workers KV | Rate-limit counters, short-TTL cache — **not** system of record |
| File storage | R2 | S3-compatible, no egress fee |
| Auth | Stateless JWT (short-lived access + httpOnly refresh cookie) | No session store needed at the edge |
| Package manager | npm | Each repo is its own npm project — see `reference/package-vetting.md` before adding any dependency |

Read `reference/links.md` for the official docs behind every one of these before writing code —
don't rely on training-data memory of an API shape that may have changed.

## Layout of this skill

```
reference/
  architecture.md          two-repo split, feature-folder convention, request flow, admin-route
                            doctrine, D1-vs-KV-vs-Hyperdrive guidance
  security-checklist.md    every mandatory security item, checkbox form
  package-vetting.md       how to vet an npm package before installing it (typosquats,
                            malicious postinstall scripts, supply-chain scanning)
  links.md                 official docs for every piece of the stack

api/                        backend repo reference
  README.md                 setup steps, Cloudflare resource creation, feature-folder layout
  core/README.md             app-wide plumbing: wrangler.toml, package.json, tsconfig, types,
                              index.ts wiring, error handler, security headers, db schema, CI,
                              husky, .gitignore — copy-adapt these first
  features/
    auth/README.md           schemas, password hashing, JWT sign/verify, register/login/refresh
                              routes
    rbac/README.md            roles + requireRole middleware + the admin-route mount
    files/README.md           upload validation (magic-byte check) + R2 helpers + routes
    rate-limiting/README.md   KV-backed rate-limit middleware
    pagination/README.md      cursor pagination helper

web/                         frontend repo reference
  README.md                  setup steps (Vite, shadcn init), feature-folder layout
  config/README.md            vite/tsconfig/tailwind/eslint/prettier/husky/CI/.gitignore
  features/
    auth/README.md            in-memory token store, useAuth hook, api-client w/ auto-refresh
    admin/README.md            obscured-path admin route, code-split guard, the doctrine on
                                what this does and doesn't buy you
    core-ui/README.md          App shell, TanStack Query client wired to sonner toasts,
                                AsyncBoundary (loading/error/success)
    home/README.md              minimal landing + 404 pages
```

## How to run this skill

1. **Ask what's missing** if not already given: project name, and whether D1 is the right fit
   vs. an existing external DB (see `reference/architecture.md`'s D1-vs-KV-vs-Hyperdrive
   section). Don't ask about package manager or auth strategy — npm + stateless JWT is the
   default; only revisit if the user objects.
2. **Create the two repos** (or two directories if the user wants to init the split later) —
   `<project>-api` and `<project>-web`, each its own `git init`, own `package.json`, own
   `.gitignore`, own CI workflow. Do not merge them into one workspace.
3. **Work feature-by-feature.** For each feature doc under `api/features/` and `web/features/`,
   read it, then write the corresponding real files into the target repo under
   `src/features/<name>/` (API) or `src/features/<name>/` (web) — adapting names/fields to the
   actual project, not pasting verbatim. Start with `api/core/README.md` and `web/config/README.md`
   since every feature depends on that plumbing existing first.
4. **Vet every dependency before installing it** — walk `reference/package-vetting.md` for
   anything beyond this doc's own recommended packages, and even for those, spot-check the
   registry page and run `npm audit` after install. Don't `npm install` a dozen packages in one
   shot without a glance at each.
5. **Wire up shadcn** in the web repo: `npx shadcn@latest init`
   (https://ui.shadcn.com/docs/installation/vite), then add the components the project
   actually needs (`button`, `input`, `sonner`, `dialog`, `table`, `dropdown-menu` are the floor
   for auth + admin + paginated tables). Don't hand-write shadcn output — generate it live so
   it matches the installed shadcn version.
6. **Init husky in both repos**: `npx husky init`, confirm the pre-commit/pre-push hooks from
   the relevant `config`/`core` doc are in place.
7. **Create Cloudflare resources** in the API repo only after confirming with the user — these
   are real account-mutating calls, not local scaffolding:
   - `wrangler d1 create <project>-db`, paste the returned `database_id` into `wrangler.toml`.
   - `wrangler kv namespace create <project>-kv`, paste the `id` into `wrangler.toml`.
   - `wrangler r2 bucket create <project>-uploads`.
   - Apply the schema from `api/core/README.md` via `wrangler d1 execute`.
8. **Do not run `wrangler deploy` or push to a remote** without explicit confirmation —
   scaffolding local files is reversible, deploying and creating cloud resources is not.
9. Point the user at `reference/security-checklist.md` as the ongoing audit checklist. If they
   want a full security pass later, hand off to `security-audit-orchestrator` (sibling skill) —
   this skill only builds, it doesn't re-audit itself.

## Non-negotiable defaults (every item enforced, not a TODO)

Full detail in `reference/security-checklist.md`. Summary:

1. No secrets in the frontend — only `VITE_`-prefixed public values.
2. RBAC is server-enforced, always — a frontend guard is UX sugar, never the actual gate.
3. Admin route is obscured, not "hidden" — real gate is server-side role check, independent
   of path.
4. Every list endpoint is cursor-paginated with a server-enforced max page size.
5. Every route is rate-limited, auth stricter than reads.
6. Every input is Zod-validated and sanitized before it touches the DB or R2.
7. Uniform API envelope, never a raw stack trace to the client.
8. Frontend surfaces every state (loading/success/error) via shadcn `sonner` toasts.
9. Every dependency vetted before it's installed (`reference/package-vetting.md`).

## What this skill deliberately does not do

- Doesn't pick a design language beyond shadcn defaults — hand off to `frontend-design` if the
  user wants a distinctive visual identity on top of this scaffold.
- Doesn't stand up payment processing, email delivery, or third-party OAuth — those are
  per-project additions on top of the auth/RBAC skeleton here.
- Doesn't generate exhaustive test suites — a smoke test per feature is the floor; expand
  coverage as the project grows.
