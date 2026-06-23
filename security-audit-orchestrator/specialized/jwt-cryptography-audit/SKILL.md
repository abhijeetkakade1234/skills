---
name: jwt-cryptography-audit
description: >
  Audit JWT security: algorithm confusion, missing exp/aud/iss validation, weak secrets. Detect alg:none, RS256→HS256 downgrade, missing expiry checks, hardcoded secrets. Extends blueteam-defend Layer 1b (Identification & Authentication Failures). Ponytail: Framework JWT library first → Configure algorithm → Validate claims.
---

# JWT Cryptography Audit — Prevent Token Attacks

Operate as a JWT security specialist. JWT misconfigurations allow unauthorized access and privilege escalation.

**Default workflow: detect JWT issues → classify vulnerability → propose fixes → verify.**

## Core Doctrine — JWT Security Failures

| Vulnerability | Attack | Impact |
| --- | --- | --- |
| `jwt.decode(token)` without verifying signature | Attacker modifies token payload | Any user becomes admin |
| `alg:none` accepted | Attacker removes signature | Auth bypass |
| RS256→HS256 downgrade | Attacker self-signs with secret | Any user takeover |
| Missing `exp` validation | Token never expires | Stolen token works forever |
| Missing `aud`/`iss` validation | Token from different service reused | Privilege escalation |
| Weak/hardcoded secret | Attacker brute-forces secret | All tokens forged |

## Operating Principles

- Always verify signature with correct key type.
- Pin algorithm (no flexibility).
- Validate `exp`, `aud`, `iss` claims.
- Never weak secrets; use random 32+ byte secrets.
- Short expiry (15-60 minutes), refresh tokens for long-lived access.

## Phase 1 — Detect JWT Issues

Search: jwt.decode calls, alg claims, missing validations, hardcoded secrets.
Patterns: `jwt.decode(`, `algorithms=`, `secret =`, `token.split('.')`

## Phase 2 — Grep Leads

JS: `jwt.decode(token)` without verify, `algorithms: ['HS256', 'RS256']`
Python: `jwt.decode(token)` without algorithms list, `secret =`
Java: `jwtParser().parseClaimsJws(token)` without setSigningKey

## Phase 3 — Triage

- CRITICAL: alg:none accepted or RS256→HS256 downgrade = account takeover
- HIGH: Missing exp/aud/iss = token reuse across services
- MEDIUM: Weak secret = brute-forceable tokens
- Fix Effort: Low (pin algorithm), Medium (add claim validation)

## Phase 4 — Ponytail Ladder

1. JWT really needed? → Yes (stateless auth)
2. Framework JWT library available? → Use jsonwebtoken, PyJWT, Spring Security JWT
3. Can pin algorithm in one line? → jwt.decode(token, secret, algorithms=['HS256'])
4. Can add claim validation? → jwt.decode(token, secret, audience='app', issuer='trusted')
5. Only then: custom validation logic

## Phase 5 — Record Format

ID, Title (e.g., "alg:none accepted in JWT decode"), Severity/Fix Effort/Confidence, Location, Vector, Impact, Fix

## Phase 6 — Fix Examples

Vulnerable (Node.js):
```
const decoded = jwt.decode(token);  // No verification!
```

Fixed:
```
const decoded = jwt.verify(token, SECRET, {algorithms: ['HS256'], audience: 'app', issuer: 'trusted'});
```

## Phase 7 — Verify

- Test with tampered token (change payload) → should be rejected
- Test with expired token → should be rejected
- Test with token from different service → rejected if aud/iss set
- Check secret is 32+ random bytes
- Run tests/build

## Quality Bar

- Real file:line evidence
- Severity, Fix Effort, Confidence rated
- All JWT decode sites checked
- Signature verification confirmed
- Claims (exp/aud/iss) validated
- Tests passing

## Example Triggers

- "JWT"
- "token security"
- "authentication token"
- "JWT signature"
- "alg:none"

## Relationship to blueteam-defend

Extends Layer 1b (Identification & Authentication Failures). JWT-specific deep-dive.
