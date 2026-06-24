---
name: security-audit-orchestrator
description: Master security audit coordinator that orchestrates all cybersecurity skills to perform comprehensive assessment against OWASP Top 10 2025. Scopes codebase, selects applicable skills, runs audits in priority order, synthesizes findings, deduplicates, and proposes batched remediation.
---

# Security Audit Orchestrator — Comprehensive Vulnerability Assessment

Operate as a chief security auditor coordinating a team of specialist security skills.

## Organization & File Structure

**Main entry point:** `/security-audit-orchestrator/SKILL.md` (this file)

**Specialized skills subfolder:** `/security-audit-orchestrator/specialized/`
- Contains all 21 production security audit skills
- Each skill is a complete Phase 1-7 audit framework
- Can be invoked independently or coordinated by orchestrator

## Skill Ecosystem — 24 Total Security Skills (21 specialized + 3 top-level references)

### Tier 1: Foundation Skills (Always Invoked)
1. **blueteam-defend** (287 lines) — Full defensive audit, all OWASP layers, never-trust doctrine
   Location: `/blueteam-defend/SKILL.md` (reference, top-level)

2. **redteam-attack** (306 lines) — Offensive review, design/spec attacks
   Location: `/redteam-attack/SKILL.md` (reference, top-level)

3. **secret-scanning** (203 lines) — Exposed credentials, public config vs true secrets
   Location: `/security-audit-orchestrator/specialized/secret-scanning/SKILL.md`

### Tier 2: Core Security Skills (Usually Needed)
4. **access-control-auditing** (288 lines) — IDOR/BOLA/BFLA (backend-is-truth doctrine)
   Location: `/security-audit-orchestrator/specialized/access-control-auditing/SKILL.md`

5. **jwt-cryptography-audit** (308 lines) — JWT security, algorithm confusion
   Location: `/security-audit-orchestrator/specialized/jwt-cryptography-audit/SKILL.md`

6. **cryptographic-weaknesses-audit** (374 lines) — Weak hashes/ciphers, password hashing, RNG, IV/nonce, TLS
   Location: `/security-audit-orchestrator/specialized/cryptographic-weaknesses-audit/SKILL.md`

7. **frontend-validation-bypass** (275 lines) — Client-side checks (only HIGH if backend fails)
   Location: `/security-audit-orchestrator/specialized/frontend-validation-bypass/SKILL.md`

8. **mass-assignment-audit** (263 lines) — ORM field binding, privilege escalation
   Location: `/security-audit-orchestrator/specialized/mass-assignment-audit/SKILL.md`

### Tier 3: Injection & Input Skills (Deep-Dive Attack Vectors)
9. **sql-injection-deep-dive** (348 lines) — String concatenation in queries, real payloads
   Location: `/security-audit-orchestrator/specialized/sql-injection-deep-dive/SKILL.md`

10. **character-encoding-injection** (289 lines) — Emoji/Unicode attacks, byte-length overflow
    Location: `/security-audit-orchestrator/specialized/character-encoding-injection/SKILL.md`

11. **cors-csrf-audit** (381 lines) — Cross-origin attacks, CSRF tokens, cookie security
    Location: `/security-audit-orchestrator/specialized/cors-csrf-audit/SKILL.md`

12. **ai-prompt-injection-audit** (328 lines) — LLM prompt injection, jailbreaks, insecure output handling, excessive agency (OWASP LLM Top 10)
    Location: `/security-audit-orchestrator/specialized/ai-prompt-injection-audit/SKILL.md`

### Tier 4: Reliability, Rate Limiting & Abuse
13. **fail-open-error-handling** (302 lines) — Fail-open vs fail-closed distinction
    Location: `/security-audit-orchestrator/specialized/fail-open-error-handling/SKILL.md`

14. **rate-limiting-audit** (332 lines) — Brute-force, auth endpoint throttling
    Location: `/security-audit-orchestrator/specialized/rate-limiting-audit/SKILL.md`

15. **api-rate-limiting** (404 lines) — API-platform quotas, cost/billing protection, gateway & GraphQL cost limits
    Location: `/security-audit-orchestrator/specialized/api-rate-limiting/SKILL.md`

16. **api-abuse-detection** (357 lines) — Credential stuffing, enumeration, scraping, business-logic abuse, bots
    Location: `/security-audit-orchestrator/specialized/api-abuse-detection/SKILL.md`

17. **integer-arithmetic-hardening** (268 lines) — Overflow/underflow in financial code
    Location: `/security-audit-orchestrator/specialized/integer-arithmetic-hardening/SKILL.md`

18. **concurrency-race-condition-audit** (364 lines) — TOCTOU, double-spend, lost updates, idempotency, data races
    Location: `/security-audit-orchestrator/specialized/concurrency-race-condition-audit/SKILL.md`

### Tier 5: Cloud, Infrastructure & Mobile (Conditional — by deployment target)
19. **container-kubernetes-security-audit** (409 lines) — Dockerfile/runtime hardening, K8s securityContext/RBAC/NetworkPolicy
    Location: `/security-audit-orchestrator/specialized/container-kubernetes-security-audit/SKILL.md`

20. **iam-privilege-escalation-audit** (341 lines) — Cloud IAM privesc paths (AWS/GCP/Azure), wildcard & PassRole abuse
    Location: `/security-audit-orchestrator/specialized/iam-privilege-escalation-audit/SKILL.md`

21. **mobile-app-security-audit** (385 lines) — iOS/Android insecure storage, cert pinning, exported components, deep links (MASVS)
    Location: `/security-audit-orchestrator/specialized/mobile-app-security-audit/SKILL.md`

### Tier 6: Resource Management & Supply Chain (Conditional)
22. **memory-resource-leaks** (263 lines) — File handles, goroutines, listeners
    Location: `/security-audit-orchestrator/specialized/memory-resource-leaks/SKILL.md`

23. **dependency-security-audit** (269 lines) — CVEs, supply chain attacks
    Location: `/security-audit-orchestrator/specialized/dependency-security-audit/SKILL.md`

24. **solidity-hardening** (282 lines) — Smart contract hardening (only for blockchain)
    Location: `/solidity-hardening/SKILL.md` (reference, top-level)

## Best Practice Format — All Skills Now in Full Phase 1-7

Each skill includes:

```
Frontmatter (name, description, triggers)
↓
Title & Default Workflow
↓
Core Doctrine (table of assumptions & fixes)
↓
Operating Principles (5-8 bullet points)
↓
Phase 1: Detection strategy (what to look for)
↓
Phase 2: Grep leads (actual search patterns per language)
↓
Phase 3: Triage (severity/confidence/effort ratings)
↓
Phase 4: Ponytail fix ladder (5-6 rungs, stop at first that holds)
↓
Phase 5: Record format (ID, Title, Severity, Location, Vector, Impact, Fix)
↓
Phase 6: Propose → Fix on Approval workflow (vulnerable → fixed code)
↓
Phase 7: Verification checklist (10+ items)
↓
Quality Bar (8-10 acceptance criteria)
↓
Example Triggers (5-8 user phrases)
↓
Relationship to blueteam-defend
```

**Status per skill:**
- ✅ blueteam-defend (287 lines, exemplary, all phases)
- ✅ redteam-attack (306 lines, exemplary, all phases)
- ✅ solidity-hardening (282 lines, exemplary, all phases)
- ✅ secret-scanning (203 lines, FULL Phase 1-7, public config ≠ true secrets)
- ✅ memory-resource-leaks (263 lines, FULL Phase 1-7, resource lifecycle audit)
- ✅ mass-assignment-audit (263 lines, FULL Phase 1-7, ORM field binding)
- ✅ integer-arithmetic-hardening (268 lines, FULL Phase 1-7, overflow/underflow)
- ✅ frontend-validation-bypass (275 lines, FULL Phase 1-7, backend-is-truth)
- ✅ fail-open-error-handling (302 lines, FULL Phase 1-7, fail-open vs fail-closed)
- ✅ character-encoding-injection (289 lines, FULL Phase 1-7, emoji/Unicode attacks)
- ✅ access-control-auditing (288 lines, FULL Phase 1-7, IDOR/BOLA/BFLA)
- ✅ rate-limiting-audit (332 lines, FULL Phase 1-7, standard rate limits)
- ✅ sql-injection-deep-dive (348 lines, FULL Phase 1-7, real payloads)
- ✅ cors-csrf-audit (381 lines, FULL Phase 1-7, cross-origin & CSRF)
- ✅ jwt-cryptography-audit (308 lines, FULL Phase 1-7, token security)
- ✅ dependency-security-audit (269 lines, FULL Phase 1-7, supply chain)
- ✅ ai-prompt-injection-audit (328 lines, FULL Phase 1-7, LLM injection / OWASP LLM Top 10)
- ✅ api-abuse-detection (357 lines, FULL Phase 1-7, abuse-at-scale of legitimate APIs)
- ✅ api-rate-limiting (404 lines, FULL Phase 1-7, platform quota/cost/gateway)
- ✅ concurrency-race-condition-audit (364 lines, FULL Phase 1-7, TOCTOU/double-spend)
- ✅ container-kubernetes-security-audit (409 lines, FULL Phase 1-7, Docker/K8s hardening)
- ✅ cryptographic-weaknesses-audit (374 lines, FULL Phase 1-7, OWASP A02)
- ✅ iam-privilege-escalation-audit (341 lines, FULL Phase 1-7, cloud IAM privesc)
- ✅ mobile-app-security-audit (385 lines, FULL Phase 1-7, iOS/Android MASVS)

## Orchestration Workflow

1. **SCOPE** — Detect language, framework, codebase type
   - Questions: Language? (JS, Python, Go, Java, C#, PHP, Rust?)
   - Framework? (Express, Django, Gin, Spring, .NET, Laravel, Rocket?)
   - Type? (Web app, API, microservice, smart contract, CLI?)
   - Infrastructure? (Docker, Kubernetes, serverless, monolith?)

2. **SELECT** — Choose applicable skills (10-24 depending on type)
   - Web app (Express/Django/Spring): Tiers 1-4 + relevant Tier 6 (always include cryptographic-weaknesses)
   - REST/GraphQL API or microservice: Tiers 1-4 in full (emphasize api-rate-limiting, api-abuse-detection, concurrency-race-condition, dependencies)
   - AI / LLM app (agents, RAG, tool-calling): add ai-prompt-injection-audit as a Tier-1 priority
   - Containerized / Kubernetes deployment: add container-kubernetes-security-audit (Tier 5)
   - Cloud infra / IaC (Terraform, IAM policies): add iam-privilege-escalation-audit (Tier 5)
   - Mobile app (iOS/Android): add mobile-app-security-audit (Tier 5); backend still gets Tiers 1-4
   - Smart contract (Solidity): solidity-hardening + blueteam-defend + redteam-attack + cryptographic-weaknesses
   - CLI: Skip rate-limiting-audit / api-rate-limiting; focus on input validation, secrets, dependencies, crypto

3. **PHASE A** — Run in parallel: secret-scanning + integer-arithmetic-hardening + cryptographic-weaknesses-audit
   - secret-scanning: Hardcoded credentials
   - integer-arithmetic-hardening: Financial/numeric boundaries
   - cryptographic-weaknesses-audit: Weak hashes/ciphers, password hashing, RNG, IV/nonce, TLS

4. **PHASE B** — Run in parallel: access-control-auditing + jwt-cryptography-audit + frontend-validation-bypass + mass-assignment-audit
   - access-control-auditing: IDOR/BOLA/BFLA checks
   - jwt-cryptography-audit: Token vulnerabilities
   - frontend-validation-bypass: Backend-is-truth verification
   - mass-assignment-audit: ORM field binding

5. **PHASE C** — Run in parallel: sql-injection-deep-dive + character-encoding-injection + cors-csrf-audit + ai-prompt-injection-audit (if AI/LLM present)
   - sql-injection-deep-dive: String concatenation patterns
   - character-encoding-injection: Emoji/Unicode attacks
   - cors-csrf-audit: Cross-origin & CSRF tokens
   - ai-prompt-injection-audit: LLM injection, insecure output handling, excessive agency

6. **PHASE D** — Run in parallel: fail-open-error-handling + rate-limiting-audit + api-rate-limiting + api-abuse-detection + concurrency-race-condition-audit + memory-resource-leaks
   - fail-open-error-handling: Exception handling security
   - rate-limiting-audit: Auth brute-force/DoS prevention
   - api-rate-limiting: Platform quota, cost protection, gateway & GraphQL cost limits
   - api-abuse-detection: Credential stuffing, enumeration, scraping, business-logic abuse
   - concurrency-race-condition-audit: TOCTOU, double-spend, lost updates, idempotency
   - memory-resource-leaks: Resource cleanup

7. **PHASE E** — Run in parallel (only if applicable to deployment target): container-kubernetes-security-audit + iam-privilege-escalation-audit + mobile-app-security-audit
   - container-kubernetes-security-audit: Docker/K8s hardening (containerized deploys)
   - iam-privilege-escalation-audit: Cloud IAM privesc paths (cloud/IaC)
   - mobile-app-security-audit: iOS/Android client hardening (mobile apps)

8. **PHASE F** — Run sequentially: dependency-security-audit → blueteam-defend → redteam-attack
   - dependency-security-audit: Supply chain CVEs
   - blueteam-defend: Comprehensive defensive audit
   - redteam-attack: Offensive security review

9. **SYNTHESIZE** — Merge findings across all skills
   - Collect: ID, Title, Severity, Location, Vector, Impact, Evidence, Confidence, Fix

10. **DEDUPLICATION** — Remove duplicate findings across skills
    - Rule 1: If 2+ skills flag same finding → Keep 1 record, note "Confirmed by skill-A + skill-B"
    - Rule 2: Intentional overlaps (not duplicates):
      - **SQL-injection + character-encoding:** Both handle emoji attacks (different angles)
      - **Secret-scanning + JWT-crypto + cryptographic-weaknesses:** Both touch keys/secrets & crypto (different angles)
      - **Access-control + frontend-validation:** Both touch permission checks (different angles)
      - **rate-limiting-audit + api-rate-limiting:** Auth brute-force vs platform quota/cost (different scope)
      - **access-control + iam-privilege-escalation:** App-layer authz vs cloud-IAM privesc (different layers)
      - **api-abuse-detection + rate-limiting:** Abuse-at-scale vs raw throttling (complementary)

11. **PRIORITIZE** — Group by severity + fix effort + OWASP layer
    - Launch Blockers: CRITICAL + Low fix effort (fix immediately)
    - Sprint 1: HIGH + Low-Medium effort, or MEDIUM + Quick wins
    - Sprint 2+: MEDIUM + Complex fixes, LOW + Future improvements

12. **PROPOSE** — Batch remediation by sprint
    - Show findings grouped by layer
    - Example fixes (vulnerable → fixed code)
    - Estimated effort per fix

13. **APPLY** — User approves, fixes applied with Ponytail strategy
    - Each skill provides Phase 4 (Ponytail ladder) showing layered fixes
    - Start at lowest rung that holds (framework first, then custom)

14. **VERIFY** — Re-run skills, confirm vulnerabilities closed
    - Re-grep for patterns
    - Test by-hand (manually trigger exception, change URL param, etc.)
    - Confirm: Issue closed, no regressions

15. **OUTPUT** — Comprehensive COMPREHENSIVE_SECURITY_AUDIT.md
    - Executive summary (high-level findings by layer)
    - Detailed findings (by skill + severity)
    - Remediation plan (by sprint)
    - Verification results

## Key Learnings Applied to All Skills

1. **Public config ≠ secret** (Firebase keys, Google keys safe in .env)
   - Used in: secret-scanning
   - Only flag as CRITICAL if issuer doesn't provide abuse monitoring

2. **Backend is truth** (if backend validates, frontend UI = LOW cosmetic)
   - Used in: frontend-validation-bypass, access-control-auditing
   - Only flag as HIGH if backend fails to validate

3. **Fail-closed ≠ fail-open** (only flag if error grants access)
   - Used in: fail-open-error-handling
   - Only flag if exception path allows operation

4. **Verify compensating controls** (downstream auth may mitigate)
   - Applied across: All skills check for mitigation
   - Example: IDOR in frontend but backend validates = LOW

5. **Ponytail ladder in every skill**
   - Ladder emphasizes framework first (not custom)
   - Example: Rate-limiting: framework middleware → managed service → custom
   - Example: SQL-injection: parameterized queries → ORM → never escaping

## Language-Specific Patterns

All skills include grep patterns for:
- **JavaScript/Node.js** (Express, Next.js, vanilla)
- **Python** (Django, Flask, FastAPI)
- **Go** (Gin, Echo, std http)
- **Java** (Spring Boot, Spring Security)
- **C#/.NET** (ASP.NET Core, Entity Framework)
- **PHP** (Laravel, Symfony)
- **Rust** (Actix, Rocket, Axum)
- **Ruby** (Rails)
- **Solidity** (Ethereum smart contracts)

## Deduplication Examples

**Scenario 1: SQL Injection via Emoji**
- sql-injection-deep-dive: "String concat in query, emoji injection possible"
- character-encoding-injection: "Emoji = 4 bytes, bypasses filters"
- **Merge:** 1 finding: "SQL injection via emoji in [location]"
- **Source:** Confirmed by sql-injection-deep-dive + character-encoding-injection

**Scenario 2: JWT Secret Exposed**
- secret-scanning: "Hardcoded JWT secret in code"
- jwt-cryptography-audit: "HMAC secret in git history"
- **Merge:** 1 finding: "JWT HMAC secret exposed in [location]"
- **Source:** Confirmed by secret-scanning + jwt-cryptography-audit

**Scenario 3: Frontend Permission Check Only**
- access-control-auditing: "Admin UI hidden, but API accessible"
- frontend-validation-bypass: "Permission check only in frontend"
- **Merge:** 1 finding: "BFLA: Admin API missing backend role check"
- **Source:** Confirmed by access-control-auditing + frontend-validation-bypass

## Severity Mapping (OWASP 2025)

| OWASP Layer | Skills | Example Severities |
|---|---|---|
| Layer 1: Broken Access Control | access-control, frontend-validation, iam-privilege-escalation, mobile-app-security | CRITICAL (IDOR), CRITICAL (IAM privesc to admin), HIGH (BFLA) |
| Layer 2: Cryptographic Failures | cryptographic-weaknesses, jwt-crypto, character-encoding, secret-scanning | CRITICAL (exposed secret / weak password hash), HIGH (weak crypto) |
| Layer 3: Injection | sql-injection, character-encoding, ai-prompt-injection | CRITICAL (SQL injection), HIGH (prompt injection → privileged action) |
| Layer 4: Insecure Design | rate-limiting, api-rate-limiting, api-abuse-detection, concurrency-race-condition, fail-open | CRITICAL (double-spend / fail-open), HIGH (no rate limit, abuse, cost runaway) |
| Layer 5: Misconfiguration | cors-csrf, container-kubernetes-security | CRITICAL (privileged container / cluster-admin), HIGH (CORS: *) |
| Layer 6: Vulnerable Components | dependency-security | CRITICAL (unpatched CVE) |
| Layer 7: Authentication Failures | jwt-crypto, fail-open | CRITICAL (invalid token accepted) |
| Layer 8: Software & Data Integrity | dependency-security | CRITICAL (malicious package) |
| Layer 9: Logging & Monitoring | fail-open, api-abuse-detection | HIGH (exception not logged, no abuse monitoring) |
| Layer 10: SSRF, XXE, etc. | redteam-attack | HIGH (SSRF possible) |
| OWASP LLM Top 10 | ai-prompt-injection | CRITICAL (injection → tool/RCE), HIGH (system-prompt leak) |
| OWASP MASVS (Mobile) | mobile-app-security | CRITICAL (extractable secrets), HIGH (no cert pinning) |

## Example Triggers

- "security audit"
- "full security review"
- "complete security assessment"
- "audit everything"
- "OWASP compliance"
- "vulnerability scan"
- "security assessment"
- "penetration test"

## Relationship to blueteam-defend

**Orchestrator COORDINATES blueteam-defend + 23 specialist skills.**

blueteam-defend is comprehensive (287 lines, all OWASP layers); orchestrator adds:
- Skill selection logic (scope-aware)
- Phased execution order (PHASE A–F: 5 parallel phases + 1 sequential)
- Deduplication across skills (merge duplicate findings)
- Batched remediation proposals (Launch Blockers → Sprint 1 → Sprint 2+)
- Unified COMPREHENSIVE_SECURITY_AUDIT.md output with executive summary + detailed findings + remediation plan

**When to use orchestrator vs blueteam-defend:**
- Want comprehensive one-shot audit? → Use orchestrator (delegates to blueteam-defend + others)
- Want defensive security principles + all OWASP layers? → Use blueteam-defend directly
- Want offensive review? → Use redteam-attack
- Want specific vulnerability audit? → Use individual skill (sql-injection-deep-dive, etc.)

## Quality Checklist

1. ✅ All 21 specialized skills follow Phase 1-7 structure
2. ✅ All 21 skills include Core Doctrine table
3. ✅ All 21 skills include Operating Principles (5-8 bullets)
4. ✅ All 21 skills include Phase 2 grep leads (per-language or per-artifact)
5. ✅ All 21 skills include Phase 4 Ponytail ladder (framework-first)
6. ✅ All 21 skills include Phase 6 code examples (vulnerable → fixed)
7. ✅ All 21 skills include Phase 7 verification checklist
8. ✅ All 21 skills include Quality Bar (8-10 criteria)
9. ✅ Deduplication logic defined (6 intentional overlaps)
10. ✅ Key learnings embedded (public config, backend-is-truth, fail-closed, compensating controls, Ponytail)
11. ✅ IceBreaker lessons applied (no over-flagging, distinction between HIGH vs LOW)
12. ✅ Organized hierarchically (orchestrator as main, specialized skills in subfolder)
13. ✅ Ready for production use on any codebase type

## Next Steps

1. Test orchestrator on 2-3 real codebases
2. Verify deduplication merges findings correctly
3. Validate Ponytail fixes work as described
4. Confirm no over-flagging (IceBreaker lessons hold)
5. Gather feedback and iterate
