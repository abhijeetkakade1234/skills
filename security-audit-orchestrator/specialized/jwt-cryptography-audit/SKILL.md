---
name: jwt-cryptography-audit
description: >
  Audit JWT security: algorithm confusion, missing exp/aud/iss validation, weak secrets. Detect alg:none, RS256→HS256 downgrade, missing expiry checks, hardcoded secrets. Extends blueteam-defend Layer 1b (Identification & Authentication Failures). Ponytail: Framework JWT library first → Configure algorithm → Validate claims.
---

# JWT Cryptography Audit — Prevent Token Forgery & Algorithm Confusion

Detect JWT failures that let an attacker forge or tamper tokens: decoding without verifying, accepting `alg:none`, RS256→HS256 confusion, missing claim validation, weak/hardcoded secrets, JWKS/`kid` trust gaps, no revocation, and PII in payloads.

**Default workflow: detect JWT issues → confirm signature is actually verified → classify by exploitability → propose pinned-algorithm + claim-validation fixes → verify.**

## Core Doctrine — JWT Security Failures

| Vulnerability | What Attacker Can Do | Real Consequence | Severity If Verified Correctly | Proper Fix |
|---|---|---|---|---|
| `jwt.decode(token)` without verifying signature | Modify payload (`sub`, `role`, `admin:true`) and replay | Any user becomes admin; full auth bypass | LOW (only used for non-trust logging) | Use `verify()` with key + pinned algorithm |
| `alg:none` accepted | Strip signature, set header `{"alg":"none"}` | Forge arbitrary tokens, no key needed | LOW (alg allowlist excludes none) | Pass explicit `algorithms` allowlist; reject `none` |
| RS256→HS256 confusion | Send `alg:HS256`, HMAC-sign with the RSA **public** key as the secret | Server verifies forged token, account takeover | LOW (algorithm pinned to RS256) | Pin to asymmetric alg; never let header pick alg |
| Missing `exp` validation | Replay a token long after issue | Stolen/leaked token works forever | LOW (lifetime validated) | Require and validate `exp` (and `nbf`) |
| Missing `aud`/`iss` validation | Reuse a token minted for another service | Cross-service privilege escalation | LOW (aud/iss enforced) | Enforce expected `audience` and `issuer` |
| Weak / hardcoded secret | Brute-force or read secret from source | All tokens forgeable | LOW (32+ byte random secret from env) | Strong random secret or asymmetric keys; from secret store |
| Missing `kid` validation / JWKS spoofing | Point `kid`/`jku` at attacker key or inject key | Server trusts attacker-controlled key | LOW (kid mapped to pinned trusted keyset) | Allowlist `kid`→key; pin JWKS URL; ignore `jku`/`x5u` |
| No revocation / refresh rotation | Reuse stolen refresh token indefinitely | Persistent access after logout/compromise | LOW (rotation + revocation list) | Short access TTL, rotating refresh, revocation/jti |
| Sensitive data in payload | Base64-decode the (signed-not-encrypted) JWT | PII/secrets exposed to anyone holding token | LOW (only opaque IDs in claims) | Keep PII out of JWT; use JWE if confidentiality needed |

## Operating Principles

1. **A JWT is signed, not encrypted.** Anyone can base64-decode the payload. Confidentiality requires JWE, never plain JWT.
2. **`verify` is truth, `decode` is a hint.** `decode()` parses without checking the signature — never make a trust decision on its output.
3. **The token must never choose the algorithm.** Always pass a server-controlled allowlist; the `alg` header is attacker-controlled.
4. **Pin the algorithm to the key type.** HMAC secrets verify HS*; RSA/EC keys verify RS*/ES*. Mixing them is the RS256→HS256 confusion bug.
5. **Validate every security-relevant claim.** `exp`, `nbf`, `aud`, `iss` — a valid signature on a stale or wrong-audience token is still a failure.
6. **Secrets must be high-entropy and external.** 32+ random bytes, from env/secret manager, never committed; rotate-able.
7. **Trust keys, not key hints.** Map `kid` to a pinned, allowlisted keyset; never fetch keys from a `jku`/`x5u`/`kid` URL the token controls.
8. **Plan for compromise.** Short access-token TTL, rotating refresh tokens, and a revocation path (jti denylist) limit blast radius.

## Phase 1 — Detection Strategy

**What to look for:**

1. **Decode without signature verification**
   - Patterns: `jwt.decode(token)` used for auth, manual `token.split('.')` base64 parsing, `{ verify_signature: false }`
   - Attack: Tamper payload (`role`, `sub`, `admin`) and replay; no signature check rejects it
   - Fix: Replace with `verify()`/`parseClaimsJws()` using the key + a pinned algorithm

2. **Algorithm not pinned / `alg:none`**
   - Patterns: `verify()` with no `algorithms` option, allowlist containing `"none"`, libraries that default to header-chosen alg
   - Attack: Send `{"alg":"none"}` and an empty signature; server accepts forged token
   - Fix: Always pass an explicit `algorithms` allowlist that excludes `none`

3. **RS256 ↔ HS256 confusion**
   - Patterns: `algorithms: ['HS256','RS256']` mixed allowlist, public key passed as HMAC secret, single key used for both
   - Attack: Attacker sets `alg:HS256` and HMAC-signs with the RSA **public key** (which it knows); HS verifier accepts it
   - Fix: Pin to the asymmetric algorithm only (`['RS256']`); never accept HS* where RS* is expected

4. **Missing claim validation (exp/nbf/aud/iss)**
   - Patterns: verify call without `audience`/`issuer`/`maxAge`, `verify_exp: false`, `ValidateLifetime = false`
   - Attack: Replay expired token, reuse not-yet-valid token, or reuse a token issued for another audience/service
   - Fix: Require `exp`/`nbf`; enforce expected `audience` and `issuer`

5. **Weak / hardcoded secret**
   - Patterns: `secret = "secret"`, short literals, secrets in source/config, `"changeme"`, base64 of a dictionary word
   - Attack: Brute-force (hashcat) or grep the repo, then forge any token
   - Fix: 32+ byte cryptographically random secret from a secret store; or asymmetric keys

6. **JWKS / `kid` trust issues**
   - Patterns: JWKS fetched from a token-supplied `jku`/`x5u`, `kid` used to index an attacker-controllable lookup (path/SQL), no JWKS URL pinning
   - Attack: SSRF the key fetch, inject a key, or spoof `kid` to a forged key
   - Fix: Pin the JWKS URL/issuer; allowlist `kid` values; ignore `jku`/`x5u` headers

7. **No revocation / refresh rotation**
   - Patterns: long-lived access tokens, refresh token reused without rotation, no `jti`/denylist, logout that does nothing server-side
   - Attack: Stolen token grants persistent access; refresh token never invalidated
   - Fix: Short access TTL (15–60m), rotate refresh tokens, maintain a revocation/jti list

8. **PII / secrets in payload**
   - Patterns: emails, names, SSNs, internal IDs, API keys placed in JWT claims
   - Attack: Anyone holding the token base64-decodes it and reads the data
   - Fix: Store only opaque references; use JWE if the payload truly must be confidential

## Phase 2 — Grep Leads

### JavaScript / Node (`jsonwebtoken`, `jose`)
Pattern: `jwt\.decode\(` (decode without verify — BAD if used for auth)
Pattern: `jwt\.verify\([^)]*\)` (check for missing `algorithms` option)
Pattern: `algorithms\s*:\s*\[[^\]]*['"]none['"]` (alg:none allowed — BAD)
Pattern: `algorithms\s*:\s*\[[^\]]*HS256[^\]]*RS256` (mixed HS/RS allowlist — confusion risk)
Pattern: `verify\([^,]+,\s*[A-Z_]*PUBLIC` (public key used in verify — confirm alg pinned)
Pattern: `token\.split\(['"]\.['"]\)` (manual JWT parsing — likely no signature check)

### Python (`PyJWT`, `python-jose`)
Pattern: `jwt\.decode\([^)]*verify_signature\s*:?\s*False` (signature verification disabled — BAD)
Pattern: `jwt\.decode\((?![^)]*algorithms)` (decode without `algorithms=` list — BAD)
Pattern: `options\s*=\s*\{[^}]*verify_exp['"]\s*:\s*False` (expiry check off — BAD)
Pattern: `jwt\.decode\((?![^)]*audience)` (no `audience=` — missing aud validation)
Pattern: `jose\.jwt\.decode|from jose` (python-jose — confirm algorithm pinning)

### Go (`golang-jwt/jwt`)
Pattern: `jwt\.Parse\(` (check the keyfunc validates `token.Method`)
Pattern: `jwt\.ParseWithClaims\(` (same — algorithm must be asserted in keyfunc)
Pattern: `token\.Method\.\(\*jwt\.SigningMethodHMAC\)` (keyfunc enforcing HMAC — GOOD pattern)
Pattern: `return\s+\w+,\s*nil` (keyfunc returning key without checking `token.Method` — BAD)
Pattern: `SigningMethodNone|UnsafeAllowNoneSignatureType` (alg:none enabled — CRITICAL)

### Java / Spring (`jjwt`, `spring-security-oauth2`)
Pattern: `parseClaimsJws\(` (signed parse — GOOD; confirm key set)
Pattern: `parseClaimsJwt\(|parsePlaintextJws` (unsigned/plaintext parse — BAD)
Pattern: `setSigningKey\(|verifyWith\(|signWith\(` (key configured — confirm strength/type)
Pattern: `Keys\.hmacShaKeyFor\(['"]` (HMAC key from a string literal — weak/hardcoded)
Pattern: `\.requireAudience\(|\.requireIssuer\(|setAllowedClockSkewSeconds` (claim validation — confirm present)

### C# / .NET (`System.IdentityModel.Tokens.Jwt`)
Pattern: `new JwtSecurityTokenHandler\(\)` (locate validation site)
Pattern: `\.ReadJwtToken\(|\.ReadToken\(` (reads WITHOUT validating signature — BAD if trusted)
Pattern: `TokenValidationParameters` (confirm the Validate* flags below)
Pattern: `ValidateIssuerSigningKey\s*=\s*false|ValidateLifetime\s*=\s*false` (validation disabled — BAD)
Pattern: `ValidateAudience\s*=\s*false|ValidateIssuer\s*=\s*false` (claim checks off — BAD)
Pattern: `ValidAlgorithms` / `SecurityAlgorithms` (confirm algorithm is pinned)

## Phase 3 — Triage

| Issue | Signature Verified? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| `jwt.decode` used for auth decisions | NO | CRITICAL | Yes — tamper & replay | Low |
| `alg:none` accepted | NO (none) | CRITICAL | Yes — no key needed | Low |
| RS256→HS256 confusion (public key as HMAC secret) | NO (forgeable) | CRITICAL | Yes — public key known | Low |
| Mixed HS/RS allowlist, single key | Partial | HIGH | Likely | Low |
| Weak / hardcoded secret | YES but forgeable | HIGH | Yes — brute-force/grep | Medium |
| Missing `exp` validation | YES | HIGH | Yes — replay stolen token | Low |
| Missing `aud`/`iss` validation | YES | HIGH | Yes — cross-service reuse | Low |
| JWKS from token-supplied `jku`/`x5u` | NO (attacker key) | CRITICAL | Yes — SSRF/key inject | Medium |
| No revocation / refresh rotation | YES | MEDIUM | Partial — needs stolen token | Medium |
| PII in payload (signed only) | YES | MEDIUM | Yes — decode reveals data | Medium |
| Signature verified, alg pinned, claims validated | YES | INFO | No | N/A |

## Phase 4 — Ponytail Fix Ladder

1. **Use a vetted framework JWT library.** `jsonwebtoken`/`jose`, `PyJWT`, `golang-jwt/jwt`, `jjwt`, `System.IdentityModel.Tokens.Jwt`. Never hand-roll base64 + HMAC.
2. **Verify the signature with a pinned algorithm.** Replace any `decode()` with `verify()` and pass an explicit `algorithms`/`ValidAlgorithms` allowlist that excludes `none`.
3. **Validate the claims.** Enforce `exp`/`nbf`, expected `audience`, and expected `issuer` on every verify call.
4. **Use a strong secret or asymmetric keys.** 32+ bytes of CSPRNG output from a secret manager for HS*, or an RSA/EC keypair for RS*/ES*. Never a literal in source.
5. **Short expiry + refresh rotation.** Access tokens 15–60 minutes; rotate refresh tokens on use; track `jti` for revocation.
6. **Never write custom crypto.** No bespoke signing, comparison, or key handling — defer to the audited library and constant-time primitives it provides.

## Phase 5 — Record Format

```
ID: JWT-001
Title: alg:none accepted — signature stripped tokens are trusted
Severity: CRITICAL
Fix Effort: Low
Confidence: 95%
Location: auth/middleware.js:58
Vector: Attacker sends header {"alg":"none"} with empty signature; verify() has no algorithms allowlist
Impact: Full authentication bypass — any forged token (role:admin) accepted without a key
Evidence: jwt.verify(token, SECRET) with no { algorithms } option
Fix: jwt.verify(token, SECRET, { algorithms: ['HS256'], audience: 'app', issuer: 'auth.example.com' })
```

## Phase 6 — Vulnerable → Fixed Examples

**JavaScript — jsonwebtoken (Vulnerable):**
```javascript
// DANGER: decode() does NOT verify the signature
const payload = jwt.decode(token);
if (payload.role === 'admin') grantAccess();   // attacker forges role
```

**JavaScript — jsonwebtoken (Fixed):**
```javascript
// GOOD: verify with pinned algorithm + claim validation
const payload = jwt.verify(token, SECRET, {
  algorithms: ['HS256'],            // pin — no alg:none, no RS/HS confusion
  audience: 'my-app',
  issuer: 'auth.example.com',
  maxAge: '30m',
});
if (payload.role === 'admin') grantAccess();
```

**Python — PyJWT (Vulnerable):**
```python
# DANGER: no algorithms list; signature/claims effectively unenforced
payload = jwt.decode(token, options={"verify_signature": False})
```

**Python — PyJWT (Fixed):**
```python
# GOOD: pinned algorithm + audience/issuer validation
payload = jwt.decode(
    token,
    SECRET,                         # or public_key for RS256
    algorithms=["HS256"],           # pin to expected alg only
    audience="my-app",
    issuer="auth.example.com",
)
```

**Go — golang-jwt/jwt (Vulnerable):**
```go
// DANGER: keyfunc returns the key without asserting the signing method
token, _ := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
    return publicKey, nil            // accepts HS256 forged with the public key
})
```

**Go — golang-jwt/jwt (Fixed):**
```go
// GOOD: assert the algorithm in the keyfunc; validate claims
token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
    if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {  // pin to RS256 family
        return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
    }
    return publicKey, nil
}, jwt.WithAudience("my-app"), jwt.WithIssuer("auth.example.com"), jwt.WithValidMethods([]string{"RS256"}))
```

**Java — jjwt (Vulnerable):**
```java
// DANGER: parse() accepts unsigned JWTs; weak hardcoded key
Claims claims = Jwts.parser()
    .setSigningKey("secret")                 // weak literal secret
    .parseClaimsJwt(token).getBody();        // parseClaimsJwt = unsigned!
```

**Java — jjwt (Fixed):**
```java
// GOOD: signed parse, strong key, audience/issuer required
Claims claims = Jwts.parserBuilder()
    .verifyWith(strongKey)                    // 32+ byte key or public key
    .requireAudience("my-app")
    .requireIssuer("auth.example.com")
    .setAllowedClockSkewSeconds(30)
    .build()
    .parseClaimsJws(token)                     // Jws = signature enforced
    .getBody();
```

**C#/.NET — JwtSecurityTokenHandler (Vulnerable):**
```csharp
// DANGER: ReadJwtToken does NOT validate the signature
var handler = new JwtSecurityTokenHandler();
var jwt = handler.ReadJwtToken(token);        // no verification at all
var role = jwt.Claims.First(c => c.Type == "role").Value;
```

**C#/.NET — TokenValidationParameters (Fixed):**
```csharp
// GOOD: full validation with pinned algorithm + claim checks
var handler = new JwtSecurityTokenHandler();
var parameters = new TokenValidationParameters {
    ValidateIssuerSigningKey = true,
    IssuerSigningKey = signingKey,            // 32+ byte symmetric or RSA key
    ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 },  // pin algorithm
    ValidateIssuer = true,   ValidIssuer = "auth.example.com",
    ValidateAudience = true, ValidAudience = "my-app",
    ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30),
};
var principal = handler.ValidateToken(token, parameters, out _);
```

## Phase 7 — Verification Checklist

- [ ] Tampered token (modified payload, original signature) is **rejected**
- [ ] `{"alg":"none"}` token with empty signature is **rejected**
- [ ] Expired token (`exp` in the past) is **rejected**
- [ ] Not-yet-valid token (`nbf` in the future) is **rejected**
- [ ] Token with wrong `aud` is **rejected**
- [ ] Token with wrong `iss` is **rejected**
- [ ] RS256→HS256 confusion test: HMAC-sign with the public key, send `alg:HS256` → **rejected**
- [ ] Every verify call passes an explicit `algorithms`/`ValidAlgorithms` allowlist (no header-chosen alg)
- [ ] Secret is 32+ random bytes, loaded from env/secret store, not committed to source
- [ ] No `jwt.decode` / `ReadJwtToken` / `parseClaimsJwt` result is used for a trust decision
- [ ] `kid`/JWKS keys come from a pinned, allowlisted source; `jku`/`x5u` headers are ignored
- [ ] Access-token TTL is short; refresh tokens rotate and can be revoked
- [ ] No PII or secrets present in token payloads
- [ ] Build/tests pass after changes

## Quality Bar

1. Every JWT decode/verify site located with real file:line evidence
2. Signature verification confirmed at every trust boundary (no `decode`-for-auth)
3. Algorithm pinned via explicit allowlist; `alg:none` impossible
4. RS256↔HS256 confusion ruled out (alg pinned to key type)
5. `exp`/`nbf` validated; `aud` and `iss` enforced
6. Secret strength/origin verified (32+ random bytes, externalized) or asymmetric keys used
7. `kid`/JWKS trust pinned; token-supplied key URLs ignored
8. Severity reflects exploitability (verified-and-validated = INFO, not flagged CRITICAL)
9. Revocation/refresh-rotation and PII-in-payload assessed
10. Verification tests (tampered/none/expired/wrong-aud) pass

## Example Triggers

- "JWT"
- "token security"
- "authentication token"
- "JWT signature"
- "alg:none"
- "algorithm confusion"
- "RS256 HS256"
- "JWKS / kid validation"
- "is my JWT secret strong enough?"
- "JWT expiry / refresh token"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 1b (Identification & Authentication Failures)** as a JWT-specific deep-dive. Core doctrine: a JWT is only as trustworthy as its signature verification — pin the algorithm, validate the claims, and treat `decode()` output as untrusted. Only flag CRITICAL when the signature is actually forgeable or unverified.
