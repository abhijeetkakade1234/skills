---
name: cors-csrf-audit
description: >
  Audit CORS and CSRF protections. Detect permissive CORS (Access-Control-Allow-Origin: *), missing CSRF tokens, weak SameSite cookie settings. Extends blueteam-defend Layer 8 (Configuration & Deployment). Ponytail: Framework middleware first → HTTP headers → Custom validation.
---

# CORS & CSRF Audit — Prevent Cross-Origin Attacks

Operate as a cross-origin security engineer. CORS misconfigurations leak authenticated data to attacker sites; CSRF gaps let attacker sites perform state-changing actions as the victim.

**Default workflow: detect CORS issues → detect CSRF gaps → triage by exploitability → propose framework-first fixes → verify with curl/browser.**

## Core Doctrine — Restrict Cross-Origin Access

| Vulnerability | Attack | Real Consequence | Severity | Proper Fix |
|---|---|---|---|---|
| Reflected-Origin CORS: `ACAO: <echoes req Origin>` + credentials | Attacker site sends `Origin: evil.com`, server echoes it back | Attacker reads victim's authenticated responses | CRITICAL | Match Origin against explicit allowlist; never echo arbitrary Origin |
| Wildcard + credentials: `ACAO: *` with `Allow-Credentials: true` | Any origin reads credentialed responses | All users' data exposed cross-origin | CRITICAL (browser blocks `*`+creds, but reflection variants don't) | Explicit origin allowlist; drop credentials if `*` truly needed |
| `null` origin allowed: `ACAO: null` | Attacker uses sandboxed iframe / `data:` URL to send `Origin: null` | Authenticated data read from null-origin context | HIGH | Never allowlist `null`; reject the literal string |
| Missing CSRF token on state-change (POST/PUT/DELETE) | Attacker auto-submits a cross-site form/fetch | Transfer funds, change email, delete data as victim | CRITICAL | Synchronizer token or double-submit + SameSite cookies |
| `SameSite=None` without `Secure` | Cookie sent cross-site over plaintext | CSRF over HTTP; cookie interceptable | HIGH | `SameSite=Lax`/`Strict`; if `None` required, mandate `Secure` |
| GET performs state change (`GET /transfer?to=x`) | `<img src>` triggers action with no preflight, no token | Silent state change, bypasses CSRF token | HIGH | Use POST/PUT/DELETE for mutations; never mutate on GET |
| Missing CSRF on JSON API trusting cookies | Attacker sends `fetch` with `text/plain` to dodge preflight | State change on cookie-authed JSON endpoint | HIGH | Require custom header / token; don't auth state-change on cookies alone |

## Operating Principles

1. **Exploitability gates severity.** CORS only matters when the endpoint returns sensitive data AND sends credentials. A `*` ACAO on a public, credential-less API is informational, not CRITICAL.
2. **`*` and credentials are mutually exclusive in browsers** — so the dangerous bug is usually *reflected Origin* (server echoes `req.headers.origin`), which silently passes the browser's credential check.
3. **CSRF requires an ambient credential.** If auth is a `Authorization: Bearer` header (not a cookie), the endpoint is largely CSRF-immune because the attacker site cannot set that header. Cookie/Basic/NTLM auth is what makes CSRF exploitable.
4. **SameSite is a strong CSRF baseline.** `SameSite=Lax` (browser default) blocks most cross-site cookie sends on unsafe methods — but not top-level GET navigations, so GET must never mutate state.
5. **Never trust the `Origin`/`Referer` for allow-decisions by reflection.** Validate against a fixed allowlist; reflection is the most common real-world CORS hole.
6. **`csurf` is deprecated and unmaintained** — recommend `csrf-csrf` (double-submit), `@fastify/csrf-protection`, or SameSite cookies + a double-submit token. Do not suggest `csurf` in fixes.
7. **Preflight is not a security control.** Attackers can craft "simple requests" (`Content-Type: text/plain`, no custom headers) that skip preflight entirely. Don't rely on the preflight existing.
8. **CSP is defense-in-depth, not a CORS/CSRF fix.** It limits exfiltration and injection blast radius but does not replace origin allowlisting or CSRF tokens.

## Phase 1: Detection Strategy

**What to look for:**

1. **Wildcard ACAO with credentials**
   - Patterns: `Access-Control-Allow-Origin: *` alongside `Access-Control-Allow-Credentials: true`; `cors({ origin: '*', credentials: true })`
   - Attack: If both ship, browsers block — but the code intent reveals the dev wants credentialed cross-origin, usually "fixed" by reflecting Origin (see #2). Flag as a smell.
   - Fix: Replace `*` with an explicit allowlist when credentials are involved.

2. **Reflected Origin echo** (the real killer)
   - Patterns: `res.header('Access-Control-Allow-Origin', req.headers.origin)`; `origin: true` in Express cors; Django `CORS_ALLOW_ALL_ORIGINS=True` with `CORS_ALLOW_CREDENTIALS=True`
   - Attack: Attacker page does `fetch('https://victim.api/me', {credentials:'include'})`; server echoes `Origin: evil.com`; browser allows; attacker reads response.
   - Fix: Compare incoming Origin to a static allowlist; only echo if it matches.

3. **Null origin allowed**
   - Patterns: allowlist containing the literal `"null"`; `origin: ['null', ...]`
   - Attack: Sandboxed iframe (`<iframe sandbox>`) or `data:`/`file:` context sends `Origin: null`; server allows.
   - Fix: Strip `null` from any allowlist; treat it as untrusted.

4. **Missing CSRF token on state-changing requests**
   - Patterns: `app.post`/`put`/`delete` handlers with no CSRF middleware; HTML `<form method="POST">` with no `_csrf`/`csrfmiddlewaretoken`; cookie-based session + no token check.
   - Attack: Attacker hosts `<form action="https://victim/transfer" method="POST">` that auto-submits with the victim's cookie.
   - Fix: Framework CSRF middleware (token verified server-side) + `SameSite` cookies.

5. **Weak SameSite cookies**
   - Patterns: `Set-Cookie` without `SameSite`; `SameSite=None` without `Secure`; session cookie missing `HttpOnly`.
   - Attack: Cross-site cookie send enables CSRF; missing `Secure` exposes over HTTP.
   - Fix: `SameSite=Lax` (or `Strict`) + `Secure` + `HttpOnly` on auth cookies.

6. **CSRF on JSON APIs / preflight bypass**
   - Patterns: cookie-authenticated JSON endpoint that accepts `Content-Type: application/x-www-form-urlencoded`/`text/plain`; no custom header requirement.
   - Attack: `fetch` with a "simple" content type avoids preflight; cookie rides along; state changes.
   - Fix: Require a custom header (e.g. `X-CSRF-Token`) the attacker cannot set cross-origin, or double-submit token, or `SameSite`.

7. **Missing CSP**
   - Patterns: no `Content-Security-Policy` header; `unsafe-inline`/`unsafe-eval` in script-src.
   - Attack: XSS payload exfiltrates tokens/cookies; broadens CORS/CSRF impact.
   - Fix: Add a restrictive CSP (`default-src 'self'`; no `unsafe-inline`) as a defense layer.

## Phase 2: Grep Leads

### JavaScript/Node (Express `cors`)
Pattern: `cors\(\s*\)` (cors with no options — defaults to reflecting any origin)
Pattern: `origin:\s*true` (reflects request Origin — dangerous with credentials)
Pattern: `origin:\s*['"]\*['"]` (wildcard origin)
Pattern: `req\.headers\.origin` (manual Origin echo — check it is allowlist-gated)
Pattern: `Access-Control-Allow-Credentials` (credentials enabled — pair with origin check)
Pattern: `app\.(post|put|delete|patch)\(` (state-change handlers — confirm CSRF protection)

### Python (Django `CORS_*`, Flask-CORS)
Pattern: `CORS_ALLOW_ALL_ORIGINS\s*=\s*True` (wildcard, Django)
Pattern: `CORS_ORIGIN_ALLOW_ALL\s*=\s*True` (legacy wildcard, Django)
Pattern: `CORS_ALLOW_CREDENTIALS\s*=\s*True` (credentials — must pair with explicit allowlist)
Pattern: `CORS\(app[^)]*supports_credentials\s*=\s*True` (Flask-CORS credentialed)
Pattern: `origins\s*=\s*['"]\*['"]` (Flask-CORS wildcard)
Pattern: `@csrf_exempt` (Django CSRF disabled — high-value lead)

### Go (`rs/cors`, `gin-contrib/cors`)
Pattern: `AllowedOrigins:\s*\[\]string\{"\*"\}` (rs/cors wildcard)
Pattern: `AllowOriginFunc` (custom origin check — verify it is not `return true`)
Pattern: `AllowCredentials:\s*true` (credentials — pair with explicit origins)
Pattern: `AllowAllOrigins\s*=\s*true` (gin-contrib/cors wildcard)
Pattern: `config\.AllowOrigins\s*=\s*\[\]string\{"\*"\}` (gin-contrib/cors)

### Java/Spring (`@CrossOrigin`, `CorsConfiguration`)
Pattern: `@CrossOrigin\b` (check for `origins = "*"` or missing allowlist)
Pattern: `@CrossOrigin\(origins\s*=\s*"\*"` (wildcard annotation)
Pattern: `setAllowedOrigins\(.*\*` (wildcard in CorsConfiguration)
Pattern: `addAllowedOriginPattern\("\*"\)` (pattern wildcard — combined with credentials = bug)
Pattern: `setAllowCredentials\(true\)` (credentials — must not combine with `*`)
Pattern: `\.csrf\(\)\.disable\(\)|csrf\(AbstractHttpConfigurer::disable\)` (CSRF disabled in Spring Security)

### C#/.NET (`AddCors`, `WithOrigins`)
Pattern: `AllowAnyOrigin\(\)` (wildcard)
Pattern: `SetIsOriginAllowed\(_\s*=>\s*true\)` (reflects any origin — dangerous)
Pattern: `AllowAnyOrigin\(\).*AllowCredentials\(\)` (invalid+dangerous combo)
Pattern: `WithOrigins\(` (explicit allowlist — GOOD; verify the list)
Pattern: `\[IgnoreAntiforgeryToken\]|app\.UseAntiforgery` (CSRF posture for Razor/Blazor)

## Phase 3: Triage

| Issue | Credentials / State-change? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| Reflected Origin echo on credentialed endpoint | Credentials: YES | CRITICAL | Yes | Low |
| `ACAO: *` on public, credential-less API | Credentials: NO | INFO/LOW | No | N/A |
| `ACAO: *` + `Allow-Credentials: true` in code | Credentials: YES | HIGH (browser blocks, intent unsafe) | Browser-blocked | Low |
| `null` origin allowlisted, credentialed | Credentials: YES | HIGH | Yes | Low |
| Missing CSRF token, cookie session, POST /transfer | State-change: YES | CRITICAL | Yes | Medium |
| Missing CSRF token, but auth is Bearer header | State-change: YES | LOW | No (no ambient cred) | N/A |
| `SameSite=None` without `Secure` on auth cookie | State-change enabler | HIGH | Yes | Low |
| GET performs state change | State-change: YES | HIGH | Yes | Medium |
| JSON API, cookie auth, no custom-header/token | State-change: YES | HIGH | Yes | Medium |
| Missing CSP header | Defense-in-depth | LOW | Indirect | Low |

## Phase 4: Ponytail Fix Ladder

1. **Framework CORS middleware with explicit origin allowlist.** Use the platform's CORS middleware (Express `cors`, Django `corsheaders`, Spring `CorsConfiguration`, .NET `AddCors`) configured with a hard-coded list of trusted origins. Never `*`, never reflect, never `null`.
2. **Framework CSRF middleware / synchronizer token.** Enable the framework's built-in CSRF protection (Django middleware, Spring Security `csrf()`, Rails token, `@fastify/csrf-protection`). Token generated server-side, verified on every unsafe method.
3. **SameSite=Strict/Lax + Secure cookies.** Set auth/session cookies to `SameSite=Lax` (or `Strict` for sensitive apps) plus `Secure` and `HttpOnly`. This alone blocks most CSRF before any token check.
4. **Double-submit cookie / SameSite for JSON APIs.** For token-light SPAs, use a double-submit token (`csrf-csrf` library) or require a custom header the cross-origin attacker cannot set. Combine with `SameSite`.
5. **CSP header.** Add `Content-Security-Policy` to limit XSS-driven token exfiltration and tighten the blast radius. Defense-in-depth only.
6. **Never reflect arbitrary Origin / never disable CSRF globally.** Last principle: if you find `origin: true`, `SetIsOriginAllowed(_ => true)`, `csrf().disable()`, or `@csrf_exempt` on a state-changing route, that is the bug — replace with the rungs above, do not paper over it.

## Phase 5: Record Format

```
ID: CORS-001
Title: Reflected Origin on GET /api/me — credentialed cross-origin read
Severity: CRITICAL
Location: src/middleware/cors.js:14
Vector: Attacker page fetch('/api/me', {credentials:'include'}); server echoes Origin: evil.com
Impact: Authenticated user profile/session data readable by any origin
Evidence: res.setHeader('Access-Control-Allow-Origin', req.headers.origin) + Allow-Credentials: true
Confidence: 95%
Fix: Match req Origin against ALLOWED_ORIGINS allowlist; only echo on match
```

```
ID: CSRF-001
Title: No CSRF protection on POST /api/transfer — cookie-authenticated
Severity: CRITICAL
Location: routes/transfer.js:23
Vector: Attacker auto-submits cross-site form; victim session cookie rides along
Impact: Funds transferred / state changed as victim without consent
Evidence: app.post('/api/transfer') with cookie session, no token check, SameSite absent
Confidence: 90%
Fix: Enable double-submit CSRF (csrf-csrf) + SameSite=Lax + Secure on session cookie
```

## Phase 6: Vulnerable → Fixed Examples

### CORS — JavaScript / Express (Vulnerable)
```javascript
// DANGER: reflects any Origin and allows credentials
const cors = require('cors');
app.use(cors({ origin: true, credentials: true }));
// Equivalent manual smell:
// res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
// res.setHeader('Access-Control-Allow-Credentials', 'true');
```

### CORS — JavaScript / Express (Fixed)
```javascript
// GOOD: explicit allowlist, credentials only for trusted origins
const cors = require('cors');
const ALLOWED = ['https://app.example.com', 'https://admin.example.com'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
  credentials: true,
}));
```

### CORS — Python / Django + Flask (Vulnerable)
```python
# DANGER (Django): wildcard + credentials
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# DANGER (Flask-CORS): wildcard with credentials
from flask_cors import CORS
CORS(app, origins="*", supports_credentials=True)
```

### CORS — Python / Django + Flask (Fixed)
```python
# GOOD (Django): explicit allowlist
CORS_ALLOWED_ORIGINS = [
    "https://app.example.com",
    "https://admin.example.com",
]
CORS_ALLOW_CREDENTIALS = True  # safe: paired with explicit origins, no wildcard

# GOOD (Flask-CORS): explicit origins
from flask_cors import CORS
CORS(app, origins=["https://app.example.com"], supports_credentials=True)
```

### CORS — Go (`rs/cors`) (Vulnerable)
```go
// DANGER: wildcard with credentials (rs/cors)
c := cors.New(cors.Options{
    AllowedOrigins:   []string{"*"},
    AllowCredentials: true,
})
```

### CORS — Go (`rs/cors`) (Fixed)
```go
// GOOD: explicit allowlist
c := cors.New(cors.Options{
    AllowedOrigins:   []string{"https://app.example.com", "https://admin.example.com"},
    AllowCredentials: true,
    AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE"},
})
```

### CORS — Java / Spring (Vulnerable)
```java
// DANGER: wildcard pattern + credentials
@Bean
CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration cfg = new CorsConfiguration();
    cfg.addAllowedOriginPattern("*");      // reflects any origin
    cfg.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
    src.registerCorsConfiguration("/**", cfg);
    return src;
}
```

### CORS — Java / Spring (Fixed)
```java
// GOOD: explicit allowlist
@Bean
CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration cfg = new CorsConfiguration();
    cfg.setAllowedOrigins(List.of(
        "https://app.example.com", "https://admin.example.com"));
    cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
    cfg.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
    src.registerCorsConfiguration("/**", cfg);
    return src;
}
```

### CORS — C# / .NET (Vulnerable)
```csharp
// DANGER: reflects any origin and allows credentials
builder.Services.AddCors(o => o.AddPolicy("open", p =>
    p.SetIsOriginAllowed(_ => true)   // echoes any Origin
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));
```

### CORS — C# / .NET (Fixed)
```csharp
// GOOD: explicit allowlist
builder.Services.AddCors(o => o.AddPolicy("trusted", p =>
    p.WithOrigins("https://app.example.com", "https://admin.example.com")
     .AllowAnyHeader()
     .WithMethods("GET", "POST", "PUT", "DELETE")
     .AllowCredentials()));
```

### CSRF — JavaScript / Express (Vulnerable)
```javascript
// DANGER: cookie session, no CSRF protection, no SameSite
app.use(session({ secret: s, cookie: {} }));
app.post('/api/transfer', (req, res) => {
  doTransfer(req.session.userId, req.body.to, req.body.amount); // attacker-triggerable
  res.json({ ok: true });
});
```

### CSRF — JavaScript / Express (Fixed)
```javascript
// GOOD: SameSite cookie + double-submit token (csrf-csrf; csurf is deprecated)
const { doubleCsrf } = require('csrf-csrf');
app.use(session({ secret: s, cookie: { sameSite: 'lax', secure: true, httpOnly: true } }));
const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: '__Host-csrf',
  cookieOptions: { sameSite: 'lax', secure: true },
});
app.get('/api/csrf', (req, res) => res.json({ token: generateToken(req, res) }));
app.post('/api/transfer', doubleCsrfProtection, (req, res) => {
  doTransfer(req.session.userId, req.body.to, req.body.amount);
  res.json({ ok: true });
});
```

### CSRF — Python / Django (Vulnerable)
```python
# DANGER: CSRF protection explicitly disabled on a state-changing view
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def transfer(request):
    do_transfer(request.user, request.POST['to'], request.POST['amount'])
    return JsonResponse({'ok': True})
```

### CSRF — Python / Django (Fixed)
```python
# GOOD: rely on CsrfViewMiddleware (enabled by default); token required.
# settings.py: SESSION_COOKIE_SAMESITE='Lax', SESSION_COOKIE_SECURE=True,
#              CSRF_COOKIE_SECURE=True
from django.views.decorators.http import require_POST

@require_POST  # no @csrf_exempt — middleware enforces the token
def transfer(request):
    do_transfer(request.user, request.POST['to'], request.POST['amount'])
    return JsonResponse({'ok': True})
# Template includes {% csrf_token %}; AJAX sends X-CSRFToken header.
```

## Phase 7: Verification Checklist

- [ ] Enumerate every endpoint that returns sensitive data and sends credentials (cookies/auth) — these are the CORS-relevant ones.
- [ ] curl preflight: `curl -i -X OPTIONS https://target/api/me -H "Origin: https://evil.com" -H "Access-Control-Request-Method: GET"` — confirm `Access-Control-Allow-Origin` does NOT echo `evil.com`.
- [ ] curl reflected-origin check: `curl -i https://target/api/me -H "Origin: https://evil.com"` — server must not return `ACAO: https://evil.com`.
- [ ] Confirm `Access-Control-Allow-Origin: *` never appears together with `Access-Control-Allow-Credentials: true`.
- [ ] Confirm the literal `null` origin is rejected (test with `-H "Origin: null"`).
- [ ] POST-without-token test: send a state-changing POST with a valid session cookie but no CSRF token → expect `403 Forbidden`.
- [ ] Cross-site form test: host an auto-submitting form against a mutation endpoint → expect rejection (token or SameSite blocks it).
- [ ] Inspect cookie flags (browser DevTools → Application → Cookies, or `Set-Cookie` header): auth cookies have `HttpOnly`, `Secure`, and `SameSite=Lax`/`Strict`.
- [ ] Confirm no `SameSite=None` cookie lacks `Secure`.
- [ ] Verify no state-changing operation is reachable via GET (`<img>`/navigation cannot trigger mutations).
- [ ] For JSON APIs: confirm a "simple" `Content-Type: text/plain` request without a token/custom header is rejected (preflight-bypass test).
- [ ] Confirm a `Content-Security-Policy` header is present and free of `unsafe-inline`/`unsafe-eval` in script-src.
- [ ] Run the app's test/build suite after applying fixes to confirm no regressions.

## Quality Bar

1. Real `file:line` evidence for every finding.
2. Severity, Fix Effort, and Confidence rated on each record.
3. CORS severity reflects exploitability: reflected/credentialed = CRITICAL; public credential-less `*` = INFO/LOW.
4. CSRF findings confirm an ambient credential (cookie/Basic) exists — Bearer-only endpoints are not flagged CRITICAL.
5. Both CORS and CSRF surfaces audited; SameSite cookie flags inspected.
6. Fixes are framework-middleware-based with explicit allowlists, never `*`, never reflection.
7. No deprecated `csurf` in recommendations — use `csrf-csrf` / `@fastify/csrf-protection` / SameSite + double-submit.
8. Every state-changing method (POST/PUT/DELETE/PATCH) verified for token or SameSite coverage; no mutation on GET.
9. Verified empirically: curl OPTIONS preflight, POST-without-token, and cookie-flag inspection all performed.
10. CSP present as defense-in-depth without being claimed as a CORS/CSRF replacement.

## Example Triggers

- "CORS"
- "CSRF"
- "cross-origin"
- "state-changing endpoint"
- "cookie security"
- "Access-Control-Allow-Origin"
- "SameSite cookie"
- "reflected origin"
- "CSRF token missing"
- "preflight bypass"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 8 (Configuration & Deployment)**. CORS and CSRF are foundational web-platform controls. Core doctrine: exploitability gates severity — only flag CRITICAL when the misconfiguration is reachable (credentialed/sensitive CORS endpoint, or cookie-authenticated state-change without a token). Fix framework-first; never reflect arbitrary Origin or disable CSRF globally.
