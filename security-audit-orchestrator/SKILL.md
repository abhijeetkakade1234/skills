---
name: security-audit-orchestrator
description: Master security audit coordinator that orchestrates specialist cybersecurity skills against OWASP Top 10 2025. Scopes the codebase, selects applicable skills, runs them in priority order, deduplicates, adversarially verifies, ranks by exploitability, and proposes batched remediation.
---

# Security Audit Orchestrator

Chief auditor coordinating a team of specialist skills. This file = selection + phasing + synthesis. Each specialist (Phase 1-7 framework) lives in `specialized/<name>/SKILL.md` and can run standalone.

Lean runnable cousin for "we now have the backend, what's actually exploitable": `backend-security-reaudit` (user skills).

## Doctrine (applies to every finding)

1. **Threat-tier before severity.** Severity is noise until you say who can reach it. **Tier A** = live-exploitable by external/normal user, no special access (IDOR, missing route auth, brute-force, injection). **Tier B** = needs repo or host/log access (committed secrets, secrets in logs, fail-open env gates). Tier A is the headline; never headline Tier B as a live CRITICAL.
2. **Backend is truth.** Client-side gate is cosmetic (LOW) unless it leaks a secret / stores tokens insecurely / exposes a privileged capability with no server round-trip. If the backend validates, the frontend bypass is LOW.
3. **Public config ≠ secret.** Firebase *client* keys, Razorpay *publishable* key_id, API URLs are safe in clients — flag only if the issuer gives no abuse monitoring. `BEGIN PRIVATE KEY` / DB creds / `key_secret` are real.
4. **Fail-closed ≠ fail-open.** Only flag if the error path *grants* access/operation.
5. **Verify compensating controls.** Downstream auth may mitigate (IDOR in UI but backend scopes = LOW).
6. **Ponytail fix ladder.** Framework control first, custom last. Stop at the lowest rung that holds.

## Skill catalog (24)

Tier 1 — Foundation (always):
- **blueteam-defend** — full defensive audit, all OWASP layers. `/blueteam-defend/SKILL.md`
- **redteam-attack** — offensive/design review, SSRF/XXE. `/redteam-attack/SKILL.md`
- **secret-scanning** — exposed credentials vs public config. `specialized/secret-scanning/`

Tier 2 — Core:
- **access-control-auditing** — IDOR/BOLA/BFLA (backend-is-truth). `specialized/access-control-auditing/`
- **jwt-cryptography-audit** — JWT security, algorithm confusion. `specialized/jwt-cryptography-audit/`
- **cryptographic-weaknesses-audit** — hashes/ciphers, password hashing, RNG, IV/nonce, TLS. `specialized/cryptographic-weaknesses-audit/`
- **frontend-validation-bypass** — client checks (HIGH only if backend fails). `specialized/frontend-validation-bypass/`
- **mass-assignment-audit** — ORM field binding, privesc. `specialized/mass-assignment-audit/`

Tier 3 — Injection & input:
- **sql-injection-deep-dive** — concatenation in queries, real payloads. `specialized/sql-injection-deep-dive/`
- **character-encoding-injection** — emoji/Unicode, byte-length overflow. `specialized/character-encoding-injection/`
- **cors-csrf-audit** — cross-origin, CSRF tokens, cookie security. `specialized/cors-csrf-audit/`
- **ai-prompt-injection-audit** — LLM injection, insecure output, excessive agency. `specialized/ai-prompt-injection-audit/`

Tier 4 — Reliability, rate-limit & abuse:
- **fail-open-error-handling** — fail-open vs fail-closed. `specialized/fail-open-error-handling/`
- **rate-limiting-audit** — auth brute-force/DoS throttling. `specialized/rate-limiting-audit/`
- **api-rate-limiting** — platform quota, cost/billing, gateway & GraphQL cost. `specialized/api-rate-limiting/`
- **api-abuse-detection** — credential stuffing, enumeration, scraping, bots. `specialized/api-abuse-detection/`
- **integer-arithmetic-hardening** — overflow/underflow in financial code. `specialized/integer-arithmetic-hardening/`
- **concurrency-race-condition-audit** — TOCTOU, double-spend, idempotency. `specialized/concurrency-race-condition-audit/`

Tier 5 — Cloud/infra/mobile (by deploy target):
- **container-kubernetes-security-audit** — Dockerfile/runtime, K8s securityContext/RBAC. `specialized/container-kubernetes-security-audit/`
- **iam-privilege-escalation-audit** — cloud IAM privesc (AWS/GCP/Azure). `specialized/iam-privilege-escalation-audit/`
- **mobile-app-security-audit** — iOS/Android storage, cert pinning, exported components (MASVS). `specialized/mobile-app-security-audit/`

Tier 6 — Resource & supply chain:
- **memory-resource-leaks** — handles, goroutines, listeners. `specialized/memory-resource-leaks/`
- **dependency-security-audit** — CVEs, supply chain. `specialized/dependency-security-audit/`
- **solidity-hardening** — smart contracts (blockchain only). `/solidity-hardening/SKILL.md`

## Select by type

- **Web app** (Express/Django/Spring): Tiers 1-4 + relevant Tier 6 (always crypto).
- **REST/GraphQL API or microservice**: Tiers 1-4 full (emphasize api-rate-limiting, api-abuse, concurrency, deps).
- **AI/LLM** (agents, RAG, tools): add ai-prompt-injection as Tier-1 priority.
- **Containerized/K8s**: add container-kubernetes. **Cloud/IaC**: add iam-privilege-escalation.
- **Mobile**: add mobile-app-security (backend still gets Tiers 1-4).
- **Smart contract**: solidity-hardening + blueteam + redteam + crypto.
- **CLI**: skip rate-limiting; focus input validation, secrets, deps, crypto.

## Run

Phases A-D run in parallel; E conditional; F sequential.

- **A** — secret-scanning + integer-arithmetic + cryptographic-weaknesses.
- **B** — access-control + jwt-crypto + frontend-validation + mass-assignment.
- **C** — sql-injection + character-encoding + cors-csrf + ai-prompt-injection (if LLM).
- **D** — fail-open + rate-limiting + api-rate-limiting + api-abuse + concurrency + memory-leaks.
- **E** (if applicable) — container-k8s + iam-privesc + mobile.
- **F** (sequential) — dependency-security → blueteam-defend → redteam-attack.

Each finding: ID, Title, Severity, Location (file:line), Vector, Impact, Evidence, Confidence, Fix.

## Synthesize → dedup → verify → rank

**Dedup:** if 2+ skills flag the same thing → one record, "Confirmed by A+B". Intentional overlaps kept separate: SQL-inj + char-encoding (emoji, diff angles); secret-scan + jwt + crypto (keys, diff angles); access-control + frontend-validation (perms, diff layers); rate-limiting + api-rate-limiting (brute-force vs cost); access-control + iam-privesc (app vs cloud); api-abuse + rate-limiting (scale vs throttle).

**Adversarially verify (downgrade rules — these catch real over-claims):**
- JWT "alg-confusion/none → total bypass" + *string* (symmetric) secret on jsonwebtoken v9: `none` rejected by default, no RS pubkey to confuse → LOW hardening, not CRITICAL.
- "Secret inlined in client bundle" — only if a client component refs it; grep the build. Latent ≠ confirmed.
- Fail-open env gate (e.g. fixed OTP when `STAGE!=='prod'`) — severity hinges on prod setting the var; state it.
- Debug logging gated on release/debug mode → hygiene, not live leak.
- Read the actual handler before publishing any CRITICAL IDOR/auth claim. List SAFE counterexamples to prove a finding is *mixed*, not blanket.

**Rank:** Tier A then Tier B (doctrine 1); within tier, severity + fix effort. Launch blockers = CRITICAL + low effort.

## Output: COMPREHENSIVE_SECURITY_AUDIT.md

Reconciliation table (if a prior audit exists: prior ID → verdict → new ref) · executive summary · Tier A findings · Tier B findings · passing controls (+ SAFE counterexamples) · remediation by sprint (P0 = live theft + brute-force, then secrets) · verification commands · self-assessment (what verify caught, what's still unknown: secret strength, prod env values, package provenance).

## Recurring bug — broken object-level authorization

Routes check identity + billing, never ownership:
```
1. logged in?            → authenticate    ✅ present
2. tenant's plan allows? → requireFeature  ✅ present — BILLING, not authz
3. do YOU own THIS one?  → ownership check  ❌ MISSING ← the bug
```
Vulnerable: `findByIdAndUpdate(req.params.id, data)` — no `req.user` check between lookup and write. Fix: assert caller membership+role for that id (copy the project's newer handlers), add a role gate on the route. Trap: don't trust `req.user.tenantId` if auth derived it from the same client URL param — validate against the real membership list.

## Severity mapping (OWASP 2025)

| Layer | Skills | Example |
|---|---|---|
| A01 Broken Access Control | access-control, frontend-validation, iam-privesc, mobile | CRITICAL IDOR / IAM privesc, HIGH BFLA |
| A02 Cryptographic Failures | crypto-weaknesses, jwt, char-encoding, secret-scan | CRITICAL exposed secret / weak password hash |
| A03 Injection | sql-injection, char-encoding, ai-prompt-injection | CRITICAL SQLi, HIGH prompt-inj → privileged action |
| A04 Insecure Design | rate-limiting, api-rate-limiting, api-abuse, concurrency, fail-open | CRITICAL double-spend/fail-open, HIGH no rate limit |
| A05 Misconfiguration | cors-csrf, container-k8s | CRITICAL privileged container, HIGH CORS `*` |
| A06 Vulnerable Components | dependency-security | CRITICAL unpatched CVE |
| A07 Auth Failures | jwt, fail-open | CRITICAL invalid token accepted |
| A08 Integrity | dependency-security | CRITICAL malicious package |
| A09 Logging/Monitoring | fail-open, api-abuse | HIGH unlogged exception / no abuse monitoring |
| A10 SSRF/XXE | redteam-attack | HIGH SSRF |
| LLM Top 10 | ai-prompt-injection | CRITICAL injection → tool/RCE |
| MASVS (Mobile) | mobile-app-security | CRITICAL extractable secret, HIGH no cert pinning |

## Triggers
"security audit", "full security review", "OWASP compliance", "vulnerability scan", "penetration test", "what's actually exploitable".
