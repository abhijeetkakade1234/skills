# Web repo — React + TS + shadcn on Cloudflare Pages

Separate repo from `api/` — see `../reference/architecture.md`. Talks to the API only over
`fetch`/TanStack Query, never touches D1/KV/R2 directly.

Docs: [Vite](https://vitejs.dev/) · [React](https://react.dev/) ·
[shadcn/ui](https://ui.shadcn.com/) · [shadcn Vite install](https://ui.shadcn.com/docs/installation/vite) ·
[TanStack Query](https://tanstack.com/query/latest) · [React Router](https://reactrouter.com/) ·
[sonner](https://sonner.emilkowal.ski/) · [Tailwind](https://tailwindcss.com/) ·
[Cloudflare Pages](https://developers.cloudflare.com/pages/)

## Layout

```
src/
  config/            vite/tsconfig/tailwind/eslint/prettier/husky/CI — config/README.md
  features/
    auth/             features/auth/README.md
    admin/            features/admin/README.md
    core-ui/          features/core-ui/README.md
    home/             features/home/README.md
```

## Setup order

1. `npm create vite@latest . -- --template react-ts`, then work through `config/README.md`.
2. `npx shadcn@latest init` (https://ui.shadcn.com/docs/installation/vite) — don't hand-write
   shadcn's own output, generate it live so it matches the installed version.
   Add components as features need them: `npx shadcn@latest add button input sonner dialog table dropdown-menu`.
3. Build `features/core-ui` first (App shell, query client, toast wiring) — everything else
   renders inside it.
4. Then `features/auth`, then `features/admin`, then `features/home` (or whatever the
   project's actual first screens are).
5. Vet every dependency against `../reference/package-vetting.md` before installing —
   including anything shadcn's CLI pulls in as a peer dependency.
6. `npx husky init` for the pre-commit/pre-push hooks in `config/README.md`.
7. `npm run dev` for local dev; deploy to Pages only on explicit request.
