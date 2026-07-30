# Vet every package before it goes in package.json

npm's supply chain gets compromised regularly — typosquatted names, maintainer account
takeovers, malicious `postinstall` scripts that exfiltrate env vars or credentials at install
time. Before adding ANY new dependency (not just the ones this skill recommends — anything
a project adds later), run through this before `npm install`:

## Checklist

1. **Name check.** Confirm the exact package name against the project's official docs/GitHub
   — typosquats differ by one character (`zod` vs `z0d`, `jose` vs `j0se`). Don't install from
   a Stack Overflow answer's `npm i` line without checking the name against the real project.
2. **Registry page.** Check `https://www.npmjs.com/package/<name>`:
   - Weekly downloads — a near-zero-download package claiming to be a popular library is a
     red flag.
   - "Provenance" badge — means the published artifact is cryptographically tied to a public
     build log (GitHub Actions run), harder to tamper with silently.
   - Last publish date vs. GitHub last-commit date — a package that publishes far more
     often than it commits, or publishes right after a maintainer-account-related GitHub
     issue, warrants a second look.
3. **Install scripts.** `npm view <name> scripts` — a `postinstall`/`preinstall` script is not
   automatically malicious (native modules need them) but is the actual mechanism most
   npm supply-chain attacks use. If a package has one and you don't know why, check what it
   does before installing, or install with `--ignore-scripts` and add it to an allowlist only
   after review (`npm config set ignore-scripts true` project-wide is the strict default for
   security-sensitive projects).
4. **Scan it.** https://socket.dev — paste the package name; flags obfuscated code, install
   scripts, filesystem/network access at install time, and typosquat similarity to popular
   packages. Free, no account needed for a single lookup.
5. **Vulnerability DB.** `npm audit` (built in — run after every install, and wire it into CI)
   plus https://snyk.io/advisor/npm-package/<name> for a maintenance/security score.
6. **Maintainer count / bus factor.** A single-maintainer package with no recent activity that
   sits deep in your auth/crypto path (this stack's `jose`, `zod`, `hono`) is a heavier bet
   than the same shape of risk in a dev-only tool. Weight scrutiny by blast radius: an auth
   library compromise is total account takeover; a lint plugin compromise is (usually) noisier
   and more contained.
7. **Pin and lock.** Commit `package-lock.json`, run `npm ci` (not `npm install`) in CI so a
   build never silently pulls a newer, unreviewed version. For the handful of packages this
   template treats as security-critical (`jose`, `zod`, anything doing password hashing or
   token signing), consider exact-pinning (no `^`/`~`) and bumping deliberately with a diff
   review rather than auto-updating.
8. **Re-check on major bumps.** A vetted package can still turn hostile after a maintainer
   sells/transfers it (this has happened to real, popular packages). Re-run this checklist on
   major version bumps of anything auth/crypto-adjacent, not just on first install.

## Tools referenced above

- npm audit docs: https://docs.npmjs.com/cli/v10/commands/npm-audit
- Socket (supply-chain scanner): https://socket.dev
- Snyk Advisor: https://snyk.io/advisor
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
- OpenSSF Scorecard (repo-level security posture, if the project has one): https://securityscorecards.dev

This is exactly the class of issue `dependency-security-audit` in `security-audit-orchestrator`
checks for on an existing codebase — this doc is the same doctrine applied *before* a package
ever gets installed, not after.
