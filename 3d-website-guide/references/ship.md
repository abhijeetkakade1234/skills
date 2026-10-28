# Ship

## Honest local preview
`"prod": "npm run build && vite preview"`. The dev server is slower and unsplit; never
judge smoothness there. DevTools Performance -> CPU 4x for weak machines; Fast 4G for first load.

## Repo hygiene (`templates/ship/`)
- `pre-commit` (husky 9): ESLint on staged files. After `npx husky init`, replace the
  generated `npm test` hook (it blocks every commit if there is no test script). Prove the
  hook by committing a file with an unused variable: it must be blocked.
- `ci.yml`: install, lint, `npm test --if-present`, typecheck + build on push/PR.
- `amplify.yml`: the same gates before building, so a bad commit fails its own deploy.
- `gitattributes` -> `.gitattributes`: LF for `.husky/*` and `*.yml`.
- `.gitignore` the QA output folder before any agent writes browser profiles into it.

## Hosting on AWS Amplify (similar on Vercel/Netlify)
- Connect the repo in the console when the GitHub org disables deploy keys (the CLI path
  with a personal token falls back to deploy keys and fails).
- Add an SPA rewrite to `/index.html` for non-asset paths if the site has client routes.

## Domains
- Check real availability before suggesting names, e.g.
  `aws route53domains check-domain-availability --region us-east-1 --domain-name x.com`.
- Short "<brand>.ai / .com" are usually taken. Patterns that still have inventory:
  `<brand>labs.com`, `get<brand>.com`, `try<brand>.com`, `<brand><noun>.com`, and
  `<brand>.<category tld>` (`.vision`, `.studio`, `.systems`).
- Buying charges for a year and needs registrant contact details: explicit go-ahead only;
  enable privacy protection and auto-renew; check the trademark.
