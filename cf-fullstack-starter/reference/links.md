# Reference docs — read these, don't guess API shapes from memory

Framework/platform APIs shift between versions. Before writing code against any of these,
check the current docs rather than relying on training-data memory of an older API.

## Cloudflare (platform)

- Workers: https://developers.cloudflare.com/workers/
- Pages: https://developers.cloudflare.com/pages/
- D1 (SQL): https://developers.cloudflare.com/d1/
- KV: https://developers.cloudflare.com/kv/
- R2: https://developers.cloudflare.com/r2/
- Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/
- Durable Objects (if you outgrow KV counters for exact-count rate limiting): https://developers.cloudflare.com/durable-objects/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/

## API framework / validation

- Hono: https://hono.dev/
- Hono + Cloudflare Workers guide: https://hono.dev/docs/getting-started/cloudflare-workers
- Zod: https://zod.dev/
- jose (JWT signing/verification, edge-runtime compatible): https://github.com/panva/jose

## Frontend

- Vite: https://vitejs.dev/
- React: https://react.dev/
- React Router: https://reactrouter.com/
- TanStack Query: https://tanstack.com/query/latest
- shadcn/ui: https://ui.shadcn.com/
- shadcn/ui + Vite install guide: https://ui.shadcn.com/docs/installation/vite
- sonner (toast primitive shadcn wraps): https://sonner.emilkowal.ski/
- Tailwind CSS: https://tailwindcss.com/

## Tooling / CI

- Husky: https://typicode.github.io/husky/
- lint-staged: https://github.com/lint-staged/lint-staged
- GitHub Actions: https://docs.github.com/actions
- wrangler-action (CF deploy from CI): https://github.com/cloudflare/wrangler-action

## Security references

- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Cheat Sheet series (general): https://cheatsheetseries.owasp.org/
