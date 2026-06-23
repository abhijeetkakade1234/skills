---
name: security-audit-orchestrator
description: Master security audit coordinator that orchestrates all cybersecurity skills to perform comprehensive assessment against OWASP Top 10 2025. Scopes codebase, selects applicable skills, runs audits in priority order, synthesizes findings, deduplicates, and proposes batched remediation.
---

# Security Audit Orchestrator — Comprehensive Vulnerability Assessment

Operate as a chief security auditor coordinating a team of specialist security skills.

## Organization & File Structure

**Main entry point:** `/d/skills/security-audit-orchestrator/SKILL.md` (this file)

**Specialized skills subfolder:** `/d/skills/security-audit-orchestrator/specialized/`
- Contains all 13 production security audit skills
- Each skill is a complete Phase 1-7 audit framework
- Can be invoked independently or coordinated by orchestrator

## Skill Ecosystem — 13 Total Security Skills

### Tier 1: Foundation Skills (Always Invoked)
1. **blueteam-defend** (287 lines) — Full defensive audit, all OWASP layers, never-trust doctrine
   Location: `/d/skills/blueteam-defend/SKILL.md` (reference, top-level)

2. **redteam-attack** (306 lines) — Offensive review, design/spec attacks
   Location: `/d/skills/redteam-attack/SKILL.md` (reference, top-level)

3. **secret-scanning** (203 lines) — Exposed credentials, public config vs true secrets
   Location: `/d/skills/security-audit-orchestrator/specialized/secret-scanning/SKILL.md`

### Tier 2: Core Security Skills (Usually Needed)
4. **access-control-auditing** (288 lines) — IDOR/BOLA/BFLA (backend-is-truth doctrine)
   Location: `/d/skills/security-audit-orchestrator/specialized/access-control-auditing/SKILL.md`

5. **jwt-cryptography-audit** (101 lines) — JWT security, algorithm confusion
   Location: `/d/skills/security-audit-orchestrator/specialized/jwt-cryptography-audit/SKILL.md`

6. **frontend-validation-bypass** (275 lines) — Client-side checks (only HIGH if backend fails)
   Location: `/d/skills/security-audit-orchestrator/specialized/frontend-validation-bypass/SKILL.md`

7. **mass-assignment-audit** (263 lines) — ORM field binding, privilege escalation
   Location: `/d/skills/security-audit-orchestrator/specialized/mass-assignment-audit/SKILL.md`

### Tier 3: Injection & Input Skills (Deep-Dive Attack Vectors)
8. **sql-injection-deep-dive** (98 lines) — String concatenation in queries, real payloads
   Location: `/d/skills/security-audit-orchestrator/specialized/sql-injection-deep-dive/SKILL.md`

9. **character-encoding-injection** (289 lines) — Emoji/Unicode attacks, byte-length overflow
   Location: `/d/skills/security-audit-orchestrator/specialized/character-encoding-injection/SKILL.md`

10. **cors-csrf-audit** (101 lines) — Cross-origin attacks, CSRF tokens, cookie security
    Location: `/d/skills/security-audit-orchestrator/specialized/cors-csrf-audit/SKILL.md`

### Tier 4: Reliability & Rate Limiting
11. **fail-open-error-handling** (302 lines) — Fail-open vs fail-closed distinction
    Location: `/d/skills/security-audit-orchestrator/specialized/fail-open-error-handling/SKILL.md`

12. **rate-limiting-audit** (114 lines) — Brute-force, auth endpoint throttling
    Location: `/d/skills/security-audit-orchestrator/specialized/rate-limiting-audit/SKILL.md`

13. **integer-arithmetic-hardening** (268 lines) — Overflow/underflow in financial code
    Location: `/d/skills/security-audit-orchestrator/specialized/integer-arithmetic-hardening/SKILL.md`

### Tier 5: Resource Management & Supply Chain (Conditional)
14. **memory-resource-leaks** (263 lines) — File handles, goroutines, listeners
    Location: `/d/skills/security-audit-orchestrator/specialized/memory-resource-leaks/SKILL.md`

15. **dependency-security-audit** (98 lines) — CVEs, supply chain attacks
    Location: `/d/skills/security-audit-orchestrator/specialized/dependency-security-audit/SKILL.md`

16. **solidity-hardening** (282 lines) — Smart contract hardening (only for blockchain)
    Location: `/d/skills/solidity-hardening/SKILL.md` (reference, top-level)

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
- ✅ rate-limiting-audit (114 lines, FULL Phase 1-7, standard rate limits)
- ✅ sql-injection-deep-dive (98 lines, FULL Phase 1-7, real payloads)
- ✅ cors-csrf-audit (101 lines, FULL Phase 1-7, cross-origin & CSRF)
- ✅ jwt-cryptography-audit (101 lines, FULL Phase 1-7, token security)
- ✅ dependency-security-audit (98 lines, FULL Phase 1-7, supply chain)

## Orchestration Workflow

1. **SCOPE** — Detect language, framework, codebase type
   - Questions: Language? (JS, Python, Go, Java, C#, PHP, Rust?)
   - Framework? (Express, Django, Gin, Spring, .NET, Laravel, Rocket?)
   - Type? (Web app, API, microservice, smart contract, CLI?)
   - Infrastructure? (Docker, Kubernetes, serverless, monolith?)

2. **SELECT** — Choose applicable skills (8-13 depending on type)
   - Web app (Express/Django/Spring): All 13 Tiers 1-4
   - Smart contract (Solidity): solidity-hardening + blueteam-defend + redteam-attack
   - Microservice: All 13 (focus on APIs, rate-limiting, dependencies)
   - CLI: Skip rate-limiting-audit; focus on input validation

3. **PHASE A** — Run in parallel: secret-scanning + integer-arithmetic-hardening
   - secret-scanning: Hardcoded credentials
   - integer-arithmetic-hardening: Financial/numeric boundaries

4. **PHASE B** — Run in parallel: access-control-auditing + jwt-cryptography-audit + frontend-validation-bypass + mass-assignment-audit
   - access-control-auditing: IDOR/BOLA/BFLA checks
   - jwt-cryptography-audit: Token vulnerabilities
   - frontend-validation-bypass: Backend-is-truth verification
   - mass-assignment-audit: ORM field binding

5. **PHASE C** — Run in parallel: sql-injection-deep-dive + character-encoding-injection + cors-csrf-audit
   - sql-injection-deep-dive: String concatenation patterns
   - character-encoding-injection: Emoji/Unicode attacks
   - cors-csrf-audit: Cross-origin & CSRF tokens

6. **PHASE D** — Run in parallel: fail-open-error-handling + rate-limiting-audit + memory-resource-leaks
   - fail-open-error-handling: Exception handling security
   - rate-limiting-audit: Brute-force/DoS prevention
   - memory-resource-leaks: Resource cleanup

7. **PHASE E** — Run sequentially: dependency-security-audit → blueteam-defend → redteam-attack
   - dependency-security-audit: Supply chain CVEs
   - blueteam-defend: Comprehensive defensive audit
   - redteam-attack: Offensive security review

8. **SYNTHESIZE** — Merge findings across all skills
   - Collect: ID, Title, Severity, Location, Vector, Impact, Evidence, Confidence, Fix

9. **DEDUPLICATION** — Remove duplicate findings across skills
   - Rule 1: If 2+ skills flag same finding → Keep 1 record, note "Confirmed by skill-A + skill-B"
   - Rule 2: Intentional overlaps (not duplicates):
     - **SQL-injection + character-encoding:** Both handle emoji attacks (different angles)
     - **Secret-scanning + JWT-crypto:** Both touch JWT secrets (different angles)
     - **Access-control + frontend-validation:** Both touch permission checks (different angles)

10. **PRIORITIZE** — Group by severity + fix effort + OWASP layer
    - Launch Blockers: CRITICAL + Low fix effort (fix immediately)
    - Sprint 1: HIGH + Low-Medium effort, or MEDIUM + Quick wins
    - Sprint 2+: MEDIUM + Complex fixes, LOW + Future improvements

11. **PROPOSE** — Batch remediation by sprint
    - Show findings grouped by layer
    - Example fixes (vulnerable → fixed code)
    - Estimated effort per fix

12. **APPLY** — User approves, fixes applied with Ponytail strategy
    - Each skill provides Phase 4 (Ponytail ladder) showing layered fixes
    - Start at lowest rung that holds (framework first, then custom)

13. **VERIFY** — Re-run skills, confirm vulnerabilities closed
    - Re-grep for patterns
    - Test by-hand (manually trigger exception, change URL param, etc.)
    - Confirm: Issue closed, no regressions

14. **OUTPUT** — Comprehensive COMPREHENSIVE_SECURITY_AUDIT.md
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
| Layer 1: Broken Access Control | access-control, frontend-validation | CRITICAL (IDOR), HIGH (BFLA) |
| Layer 2: Cryptographic Failures | jwt-crypto, character-encoding, secret-scanning | CRITICAL (exposed secret), HIGH (weak crypto) |
| Layer 3: Injection | sql-injection, character-encoding | CRITICAL (SQL injection) |
| Layer 4: Insecure Design | rate-limiting, fail-open | HIGH (no rate limit), CRITICAL (fail-open) |
| Layer 5: Misconfiguration | cors-csrf | HIGH (CORS: *) |
| Layer 6: Vulnerable Components | dependency-security | CRITICAL (unpatched CVE) |
| Layer 7: Authentication Failures | jwt-crypto, fail-open | CRITICAL (invalid token accepted) |
| Layer 8: Software & Data Integrity | dependency-security | CRITICAL (malicious package) |
| Layer 9: Logging & Monitoring | fail-open | HIGH (exception not logged) |
| Layer 10: SSRF, XXE, etc. | redteam-attack | HIGH (SSRF possible) |

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

**Orchestrator COORDINATES blueteam-defend + 15 specialist skills.**

blueteam-defend is comprehensive (287 lines, all OWASP layers); orchestrator adds:
- Skill selection logic (scope-aware)
- Phased execution order (5 parallel phases)
- Deduplication across skills (merge duplicate findings)
- Batched remediation proposals (Launch Blockers → Sprint 1 → Sprint 2+)
- Unified COMPREHENSIVE_SECURITY_AUDIT.md output with executive summary + detailed findings + remediation plan

**When to use orchestrator vs blueteam-defend:**
- Want comprehensive one-shot audit? → Use orchestrator (delegates to blueteam-defend + others)
- Want defensive security principles + all OWASP layers? → Use blueteam-defend directly
- Want offensive review? → Use redteam-attack
- Want specific vulnerability audit? → Use individual skill (sql-injection-deep-dive, etc.)

## Quality Checklist

1. ✅ All 13 skills follow Phase 1-7 structure
2. ✅ All 13 skills include Core Doctrine table
3. ✅ All 13 skills include Operating Principles (5-8 bullets)
4. ✅ All 13 skills include Phase 2 grep leads (per-language)
5. ✅ All 13 skills include Phase 4 Ponytail ladder (framework-first)
6. ✅ All 13 skills include Phase 6 code examples (vulnerable → fixed)
7. ✅ All 13 skills include Phase 7 verification checklist
8. ✅ All 13 skills include Quality Bar (8-10 criteria)
9. ✅ Deduplication logic defined (3 intentional overlaps)
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
