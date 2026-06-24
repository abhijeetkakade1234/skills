---
name: dependency-security-audit
description: >
  Audit dependencies for known CVEs, typosquatting, unmaintained packages. Detect vulnerable deps, floating version ranges, unpinned dependencies, missing lockfiles. Extends blueteam-defend Layer 7 (Software Supply Chain Failures). Ponytail: Run ecosystem auditor first → Pin versions → Use lockfiles.
---

# Dependency Security Audit — Eliminate Supply Chain Attacks

Operate as a supply-chain security engineer. Vulnerable, hijacked, or stale dependencies enable RCE, credential theft, and build poisoning — often before a single line of your own code runs.

**Default workflow: run ecosystem auditor → detect vulnerable/unpinned deps → classify by reachability → propose pin/update strategy → verify auditor returns clean.**

## Core Doctrine — Supply Chain Attacks via Dependencies

| Vulnerability | Attack | Impact | Severity If Reachable | Proper Fix |
|---|---|---|---|---|
| Known-CVE direct dep (`lodash 4.17.15`, CVE-2020-8203) | Attacker triggers prototype pollution / RCE path | RCE or data tampering in running app | CRITICAL (reachable code path) | Update to patched version, pin exact |
| Floating range `^1.2.3` / `~1.2.3` | Patch/minor auto-updates to a hijacked release | RCE on next `npm install` / CI build | HIGH (build can silently change) | Pin exact version + commit lockfile |
| No lockfile (no `package-lock.json` / `poetry.lock`) | Versions float; each machine/CI resolves differently | Inconsistent, possibly compromised builds | HIGH (irreproducible builds) | Generate and commit a lockfile with integrity hashes |
| Typosquatted name (`jqu5ery` vs `jquery`, `python-dateutil` vs `dateutil`) | Dev installs attacker's lookalike package | Malicious code in dependency tree | CRITICAL (attacker code shipped) | Remove, install correct name, verify registry source |
| Unmaintained package (3+ years, no release) | No security patches issued upstream | Known CVEs go permanently unfixed | HIGH (accumulating debt) | Migrate to maintained alternative or fork |
| Transitive RCE chain (A → B → C is vulnerable) | Indirect dep carries the exploit | RCE via the chain you never chose directly | CRITICAL if reachable, else MEDIUM | Force resolution / override to patched C |
| Malicious install / `postinstall` script | Package runs arbitrary code on install | Credential exfil, backdoor at install time | CRITICAL (executes pre-runtime) | `--ignore-scripts`, audit script, remove package |
| Dependency confusion / internal-package name | Public registry serves a higher-version impostor of `@acme/internal-utils` | Attacker code injected into internal build | CRITICAL (internal supply chain) | Scope packages, lock registry in `.npmrc`, reserve names publicly |

## Operating Principles

1. **Run the ecosystem auditor first.** `npm audit`, `pip-audit`, `govulncheck`, `cargo audit`, `bundler-audit` — let the tool find known CVEs before manual review.
2. **Reachability over presence.** A CVE in an unreachable code path is lower severity than one on a hot request path. Flag CRITICAL only when the vulnerable function is actually invoked.
3. **Pin exact versions.** No `^` or `~` on security-sensitive deps. Floating ranges hand version control to whoever owns the registry account.
4. **Lockfiles are mandatory and committed.** `package-lock.json`, `poetry.lock`, `Cargo.lock`, `go.sum`, `Gemfile.lock` — with integrity hashes, checked into VCS.
5. **Audit transitive dependencies, not just direct.** Most real-world supply chain incidents land through indirect deps you never named.
6. **Treat install scripts as code execution.** `postinstall`/`preinstall` hooks run with your shell privileges. Review or disable them.
7. **Retire unmaintained packages.** 3+ years without a release means no CVE patches are coming. Plan migration before, not after, the next disclosure.
8. **Gate in CI.** A clean local audit is worthless if `main` can merge a new critical CVE. Wire the auditor into the pipeline with a failing threshold.

## Phase 1 — Detection Strategy

**What to look for, by category:**

1. **Run the ecosystem auditor**
   - Detect: Execute the native auditor for the stack (`npm audit`, `pip-audit`, `govulncheck`, `cargo audit`, `bundler-audit`) plus `osv-scanner` as a universal cross-ecosystem pass.
   - Output: list of advisories with CVE/GHSA IDs, severity, affected version range, and patched version.

2. **Floating / unpinned version ranges**
   - Detect: Grep manifests for `^`, `~`, `>=`, `*`, `latest` in `package.json`, `requirements.txt`, `Cargo.toml`, `Gemfile`.
   - Risk: next install can pull a different (possibly hijacked) build than what was tested.

3. **Missing or stale lockfile**
   - Detect: Confirm `package-lock.json` / `yarn.lock` / `poetry.lock` / `Cargo.lock` / `go.sum` / `Gemfile.lock` exists, is committed, and is newer than its manifest.
   - Risk: irreproducible builds; integrity hashes absent so tampering goes undetected.

4. **Typosquatting & dependency confusion**
   - Detect typosquatting: Compare dependency names against the well-known package they resemble (Levenshtein distance 1–2, swapped chars, added digits).
   - Detect confusion: Internal/scoped package names (`@acme/...`) that also resolve from the public registry; check `.npmrc`/registry config pins the internal scope to a private registry.

5. **Unmaintained packages**
   - Detect: Check last-release date and open-issue/PR backlog (registry metadata, `npm view <pkg> time.modified`, repo activity). Flag anything 3+ years stale or archived.

6. **Install scripts (postinstall)**
   - Detect: Grep `package.json` for a `"scripts"` block containing `preinstall`/`install`/`postinstall`; inspect what each runs. Run installs with `--ignore-scripts` where feasible.

7. **Transitive vulnerabilities**
   - Detect: Auditors report indirect deps; map the chain (`npm ls <pkg>`, `pip-audit` tree, `cargo tree -i <pkg>`) to find which direct dep pulls the vulnerable one, then override/resolve at the patched version.

## Phase 2 — Grep Leads / Commands

### Node / npm
```bash
npm audit --audit-level=high            # advisories, fail threshold high+
npm audit --json | jq '.vulnerabilities'
npm ls <vulnerable-pkg>                  # find who pulls a transitive dep
osv-scanner --lockfile=package-lock.json
```
Grep `package.json`:
- Floating ranges: `"\^|~|>=|\*|latest"` in `dependencies`/`devDependencies`
- Install scripts: `"(pre|post)?install"\s*:` inside `"scripts"`
- Missing lockfile: confirm `package-lock.json` (or `yarn.lock`/`pnpm-lock.yaml`) present and committed

### Python / pip
```bash
pip-audit                               # scans installed env / requirements
pip-audit -r requirements.txt
osv-scanner --lockfile=poetry.lock
```
Grep `requirements.txt`:
- Floating / unpinned: lines without `==`, or using `>=`, `~=`, `*`
- Prefer fully pinned with hashes: `package==1.2.3 --hash=sha256:...`
- Confirm `poetry.lock` / `Pipfile.lock` present and committed for managed projects

### Go
```bash
govulncheck ./...                       # reachability-aware: only flags called vulns
```
Grep:
- `go.mod` for `require` directives; confirm `go.sum` exists with checksums for every module
- `govulncheck` is reachability-aware — trust its "called" vs "imported but not called" distinction for severity

### Rust / Cargo
```bash
cargo audit                             # uses RustSec advisory DB
cargo tree -i <vulnerable-crate>        # invert tree to find the importing dep
```
Grep `Cargo.toml`:
- Floating versions: `version = "^...|*"`; prefer `version = "=1.2.3"` for exact pin
- Confirm `Cargo.lock` committed (binaries) for reproducible builds

### Ruby
```bash
bundle audit check --update             # bundler-audit against ruby-advisory-db
```
Grep `Gemfile`:
- Loose constraints: `gem '...', '~> 1.2'` or no version at all
- Confirm `Gemfile.lock` present and committed

### Universal
```bash
osv-scanner -r .                        # recursive scan across all ecosystems via OSV DB
```
Automate ongoing detection with **Dependabot** or **Renovate** to open PRs for patched versions.

## Phase 3 — Triage

| Issue | Reachable / Exploitable? | Severity | Fix Effort |
|---|---|---|---|
| Known RCE CVE in direct dep, on hot path | YES | CRITICAL | Low (update + pin) |
| Known CVE in dep but vulnerable fn never called (`govulncheck` "not called") | NO | LOW | Low (track, no urgent change) |
| Floating `^`/`~` range on a runtime dep | Potential (next install) | HIGH | Low (pin + lockfile) |
| Missing/uncommitted lockfile | Potential (irreproducible) | HIGH | Low (generate + commit) |
| Typosquatted package installed | YES | CRITICAL | Low (remove, install correct) |
| Dependency-confusion exposure on internal scope | YES | CRITICAL | Medium (scope + registry pin) |
| Transitive CVE, reachable via chain | YES | CRITICAL | Medium (override/resolution) |
| Unmaintained package, no current CVE | NO (yet) | HIGH | High (migrate alternative) |
| `postinstall` script of unknown intent | YES (install-time) | CRITICAL | Medium (review/remove) |

## Phase 4 — Ponytail Fix Ladder

1. **YAGNI — remove the unused dependency.** Is this package actually imported anywhere? If not, delete it. The most secure dependency is the one you don't have.
2. **Run the ecosystem auditor and apply its fix.** `npm audit fix`, `pip-audit --fix`, `cargo update -p <crate>` — let the tooling resolve to the nearest safe version first.
3. **Update to the patched version.** If auto-fix can't (major bump needed), update explicitly to the advisory's patched release and run tests.
4. **Pin the exact version.** Replace `^4.17.0` with `4.17.21`. Remove `~`/`>=`/`*`. Security-sensitive deps get exact pins.
5. **Use a lockfile with integrity hashes.** Commit `package-lock.json` / `poetry.lock` / `Cargo.lock` / `go.sum` so every install is byte-reproducible and tamper-evident.
6. **Fork/patch only if upstream is unresponsive.** Last resort: vendor and patch the package (or apply an `overrides`/`[patch]` block) when no fixed upstream release exists. Track the upstream issue for eventual migration.

## Phase 5 — Record Format

```
ID: DEP-001
Dependency: lodash
Version: 4.17.15 (current) → 4.17.21 (patched)
CVE/GHSA ID: CVE-2020-8203 / GHSA-p6mc-m468-83gw
Severity: HIGH
Reachable?: YES — _.zipObjectDeep called in src/merge.js:31 with user-controlled keys
Fix: Update to 4.17.21, pin exact, commit package-lock.json; re-run npm audit (expect 0 high)
Confidence: 95%
```

## Phase 6 — Examples (Vulnerable → Fixed)

### npm — floating range with known CVE
**Vulnerable** `package.json`:
```json
{ "dependencies": { "lodash": "^4.17.0" } }   // resolves to 4.17.15 — CVE-2020-8203
```
Run and read the auditor:
```bash
$ npm audit
# high   Prototype Pollution in lodash
# Dependency  lodash  Patched in >=4.17.21
$ npm audit fix     # bumps to a safe version automatically
```
**Fixed** `package.json` + committed lockfile:
```json
{ "dependencies": { "lodash": "4.17.21" } }   // exact pin, no ^/~
```
```bash
$ npm install        # regenerates package-lock.json with integrity hashes
$ git add package.json package-lock.json
```

### pip — floating to pinned with hashes
**Vulnerable** `requirements.txt`:
```
requests>=2.0          # floats; CVE-2023-32681 affects 2.30.x
```
```bash
$ pip-audit -r requirements.txt
# Found 1 known vulnerability  requests 2.30.0  GHSA-j8r2-6x86-q33q  fixed in 2.31.0
```
**Fixed** `requirements.txt`:
```
requests==2.31.0 --hash=sha256:942c5a758f98d790eaed1a29cb6eefc7ffb0d1cf7af05c3d2791656dbd6ad1e1
```

### Go — update to patched, reachability-checked
```bash
$ govulncheck ./...
# Vulnerability GO-2023-1840 in golang.org/x/net  (called: yes)
$ go get -u golang.org/x/net@v0.17.0   # patched
$ go mod tidy && govulncheck ./...     # expect: no vulnerabilities called
```

### Cargo — exact pin via RustSec
```bash
$ cargo audit
# RUSTSEC-2023-0034  openssl 0.10.45  use-after-free; patched 0.10.55
$ cargo update -p openssl --precise 0.10.55
```
`Cargo.toml` (pin exact for the sensitive crate):
```toml
openssl = "=0.10.55"
```

### Dependency-confusion mitigation (scoped registry / `.npmrc`)
Reserve internal names under a scope and pin that scope to your private registry so the public registry can never satisfy it:
```ini
# .npmrc — force @acme scope to the internal registry only
@acme:registry=https://registry.internal.acme.com/
//registry.internal.acme.com/:_authToken=${NPM_TOKEN}
```
```json
{ "dependencies": { "@acme/internal-utils": "1.4.2" } }  // scoped, never public
```
Also publicly reserve the unscoped names so an attacker cannot register an impostor.

## Phase 7 — Verification Checklist

- [ ] Ecosystem auditor (`npm audit` / `pip-audit` / `govulncheck` / `cargo audit` / `bundler-audit`) run and output shown.
- [ ] Auditor returns **0 high and 0 critical** advisories (or each remaining one is documented as unreachable).
- [ ] Every flagged CVE/GHSA has a record (DEP-xxx) with reachability assessment.
- [ ] All direct dependencies use exact versions — no `^`, `~`, `>=`, `*`, or `latest` on runtime deps.
- [ ] Lockfile present, committed to VCS, and newer than its manifest.
- [ ] Lockfile contains integrity/hash entries (`integrity`, `--hash=`, `go.sum` checksums).
- [ ] Transitive vulnerabilities resolved via override/resolution or patched parent.
- [ ] No unreviewed `postinstall`/`preinstall` scripts; installs reproducible with `--ignore-scripts` where applicable.
- [ ] No typosquatted package names; internal scopes pinned to a private registry (dependency-confusion safe).
- [ ] Unmaintained packages (3+ years) identified with a migration plan.
- [ ] CI audit gate wired in (Dependabot/Renovate or pipeline step) failing on new high/critical.
- [ ] Tests and build pass against the pinned lockfile.

## Quality Bar

1. Ecosystem auditor was run and its results are shown, not assumed.
2. Every CVE/GHSA identified, with patched version noted.
3. Severity reflects **reachability**, not mere presence in the tree.
4. Fixes pin exact versions (no `^`/`~`) on security-sensitive deps.
5. Lockfile present, committed, and carries integrity hashes.
6. Transitive CVEs resolved, not just direct ones.
7. Install scripts reviewed; no unexplained `postinstall` execution.
8. Typosquatting and dependency-confusion checked; internal scopes locked to private registry.
9. CI audit gate in place so regressions can't merge.
10. Tests/build pass against pinned deps; no version floating remains.

## Example Triggers

- "dependency vulnerability"
- "known CVE"
- "supply chain"
- "vulnerable package"
- "npm audit"
- "pip-audit / govulncheck / cargo audit"
- "typosquatting"
- "dependency confusion"
- "should I pin my versions?"
- "is this package safe to install?"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 7 (Software Supply Chain Failures)**. Dependency-specific deep-dive: run the ecosystem auditor first, judge by reachability, pin exact versions, commit lockfiles with integrity hashes, and gate the pipeline so a new critical CVE cannot silently land in `main`.
