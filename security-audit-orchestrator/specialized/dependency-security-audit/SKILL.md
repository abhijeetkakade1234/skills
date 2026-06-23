---
name: dependency-security-audit
description: >
  Audit dependencies for known CVEs, typosquatting, unmaintained packages. Detect vulnerable deps, floating version ranges, unpinned dependencies, missing lockfiles. Extends blueteam-defend Layer 7 (Software Supply Chain Failures). Ponytail: Run ecosystem auditor first → Pin versions → Use lockfiles.
---

# Dependency Security Audit — Eliminate Supply Chain Attacks

Operate as a supply-chain security engineer. Vulnerable/hijacked/stale dependencies enable RCE.

**Default workflow: run auditor → detect vulnerable deps → classify risk → propose pin strategy → verify.**

## Core Doctrine — Supply Chain Attacks via Dependencies

| Vulnerability | Attack | Impact |
| --- | --- | --- |
| Vulnerable version in package.json | npm/pip install pulls RCE-vulnerable code | Attacker RCE on install |
| Floating version range `^1.2.3` | Patch version auto-updates to malicious version | RCE on next install |
| No lockfile (package-lock.json) | Dependency versions float = different on each machine | Inconsistent, possibly compromised builds |
| Typosquatted package name `jqu5ery` vs `jquery` | Developer installs attacker's package by mistake | Attacker code in dependencies |
| Unmaintained package (3+ years stale) | No security patches available | Known CVEs go unfixed |
| Transitive RCE chain (A → B → C has vuln) | Indirect dependency has exploit | RCE via the chain |

## Operating Principles

- Run ecosystem auditor first (npm audit, pip-audit, cargo audit).
- Pin exact versions (no `^` or `~`), not floating ranges.
- Use lockfiles (package-lock.json, requirements.lock, Cargo.lock).
- Review all dependencies, especially those with install scripts.
- Audit transitive dependencies (indirect).
- Retire unmaintained packages (> 3 years).

## Phase 1 — Detect Vulnerable Dependencies

Run auditor first: `npm audit`, `pip-audit`, `cargo audit`, `bundle audit`, `osv-scanner`
Check for: Known CVEs, unmaintained packages, transitive exploits

## Phase 2 — Grep Leads

Check package manifests:
- Node: package.json with `"^"` or `"~"` versions, missing package-lock.json
- Python: requirements.txt with floating ranges, missing requirements.lock
- Rust: Cargo.toml with floating versions, missing Cargo.lock
- Ruby: Gemfile with loose constraints

## Phase 3 — Triage

- CRITICAL: Known RCE CVE in direct or transitive dependency = immediate patch
- HIGH: Unmaintained package (3+ years) = unpatched CVEs
- MEDIUM: Floating version range = inconsistent builds
- Fix Effort: Low (pin version), Medium (update to newer major), High (replace package)

## Phase 4 — Ponytail Ladder

1. Dependency really needed? → YAGNI (can we remove it?)
2. Ecosystem auditor available? → Run it first (npm audit, pip-audit, cargo audit)
3. Vulnerability fixable by update? → Update to patched version
4. Managed alternative available? → Use built-in or more-maintained package
5. Can pin version in one line? → Exact version (no ^/~)
6. Only then: fork/patch if upstream unresponsive

## Phase 5 — Record Format

ID, Dependency, Version, CVE ID, Severity/Fix Effort/Confidence, Proposed fix (pin or update)

## Phase 6 — Example

Vulnerable: package.json with `"lodash": "^4.17.0"` and known CVE in 4.17.15
Fixed: `"lodash": "4.17.21"` (exact version, no ^/~)

## Phase 7 — Verify

- Run auditor again: `npm audit` should show 0 vulnerabilities
- Verify lockfile present and up-to-date
- Check no new vulnerabilities in updated deps
- Run tests/build with lockfile
- Verify no version floating

## Quality Bar

- Auditor run + results shown
- All CVEs identified
- Fixes pin exact versions (no ^/~)
- Lockfile present and committed
- Tests passing with pinned deps
- No transitive CVEs remain

## Example Triggers

- "dependency vulnerability"
- "known CVE"
- "supply chain"
- "vulnerable package"
- "npm audit"

## Relationship to blueteam-defend

Extends Layer 7 (Software Supply Chain Failures). Dependency-specific deep-dive.
