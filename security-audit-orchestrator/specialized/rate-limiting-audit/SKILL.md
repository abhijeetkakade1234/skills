---
name: rate-limiting-audit
description: >
  Audit for missing rate limits on sensitive endpoints: login, password reset, API calls, file uploads. Detect brute-force vulnerability, DoS attacks, quota exhaustion. Use when user says "rate limiting", "brute force", "throttling", "DoS protection", "login attempts", "password reset spam". Extends blueteam-defend Layer 6. Ponytail: Framework middleware first → Managed service → Custom token bucket.
---

# Rate Limiting Audit — Prevent Brute-Force & DoS

Operate as a rate-limiting security engineer. Missing or broken rate limits enable brute-force attacks, OTP/2FA bypass, quota exhaustion, amplification, and denial of service. A limiter that exists but is keyed wrong (spoofable header) or scoped wrong (in-memory, per-instance) is as good as no limiter at all.

**Default workflow: map sensitive surface → detect unthrottled/mis-scoped endpoints → triage by exploitability → propose per-route limits → apply on approval → verify enforcement.**

## Core Doctrine — Throttle Every Sensitive Endpoint

| Endpoint | Attack | No Limit / Broken Limit = | Recommended Key + Limit |
| --- | --- | --- | --- |
| /login | Brute-force 1000s of passwords | Account takeover, credential stuffing | per-IP + per-account, 5 / 15min |
| /signup | Mass account/bot registration | Spam accounts, resource abuse, fake reviews | per-IP, 5 / hour |
| /password-reset | Spam reset emails | Email DoS, victim mailbox flood, account lockout | per-email + per-IP, 3 / hour |
| /api/send-otp (verify) | OTP brute-force (0000–9999) | 2FA bypass, account hijack | per-user + per-IP, 5 / 15min |
| /api/search | Query amplification | Quota exhaustion, $1000s DB/search bill | per-user, 100 / min |
| /api/export | Export full dataset | CPU/memory exhaustion, data exfil at scale | per-user, 5 / hour |
| /graphql | Deep/nested query, alias batching | Single request amplifies to thousands of resolvers | per-user + query cost/depth limit, 50 / min |
| /upload | Large/repeated file upload | Disk full, bandwidth/storage DoS | per-user, 10 / hour + size cap |
| /webhooks/* (inbound) | Forged/replayed event flood | Downstream processing DoS, duplicate side effects | per-source + signature verify, 100 / min |

## Operating Principles

1. **Identify the sensitive surface first.** Authentication, verification (OTP/email), password reset, expensive reads (search/report/export), writes that consume storage (upload), and amplification endpoints (GraphQL, batch APIs).
2. **Choose the right key.** Per-IP defends anonymous brute-force (login, signup); per-user/per-API-key enforces fair-use quota; per-account/per-email defends targeted attacks (reset spam, OTP). Sensitive endpoints often need **two keys at once** (per-IP AND per-account) so a single attacker can't rotate IPs to bypass the account limit, nor target one account from many IPs.
3. **Return `429 Too Many Requests` with `Retry-After`.** The status code and header let well-behaved clients back off; without `Retry-After` clients hammer blindly.
4. **Use a distributed counter store.** In a multi-instance / autoscaled deployment, an in-memory counter resets per process and per restart — an attacker spread across N instances gets N× the limit. Back the limiter with **Redis** (or Memcached / a managed store) so the count is shared.
5. **Fail closed on store outage — for auth.** If Redis is unreachable, an open-fail limiter silently allows unlimited login/OTP attempts. For security-critical endpoints, prefer fail-closed (reject or degrade to a strict local limit). For best-effort fair-use quotas, fail-open may be acceptable; decide deliberately, don't default.
6. **Never key on a spoofable header.** `X-Forwarded-For`, `X-Real-IP`, `Client-IP` are client-controllable. Behind a proxy, configure `trust proxy` / `ProxyFix` / forwarded-headers middleware so the framework derives the *real* client IP from the trusted hop. Keying naively on `X-Forwarded-For` lets an attacker send a unique value per request and bypass the limit entirely.
7. **Set per-route limits, not one global limit.** A global 1000/min is useless for /login (5/min) and too tight for a static asset route. Scope limits to the threat model of each endpoint.
8. **Don't punish legitimate users.** Tune windows so normal usage (a user fat-fingering a password twice, a dashboard polling) stays under the limit. Pair auth throttling with CAPTCHA / exponential backoff rather than a hard permanent lock.

## Phase 1 — Detection Strategy

Map the sensitive surface, then check each category:

1. **Auth endpoints unthrottled.** `/login`, `/signin`, `/token`, `/signup`.
   - *How to detect:* Find the route handler; confirm no rate-limit middleware/decorator is attached and no per-account attempt counter exists. Test: can you POST wrong credentials 100× without a 429?
   - *Consequence:* brute-force / credential stuffing → account takeover.

2. **OTP / verification brute-force.** `/verify-otp`, `/confirm`, `/2fa`, email/phone code checks.
   - *How to detect:* Locate the code-comparison handler. A 4-digit OTP has 10,000 combinations; with no limit and ~50ms/request it's cracked in minutes. Check for per-user attempt cap AND code expiry/rotation after N failures.
   - *Consequence:* 2FA bypass, account hijack.

3. **Expensive / amplification endpoints.** `/api/search`, `/report`, `/graphql`, batch/aggregate APIs.
   - *How to detect:* Find handlers that fan out to DB/search/3rd-party per call. For GraphQL, check for query depth/complexity limiting and alias-batch protection — a single request can spawn thousands of resolver calls. Check for per-user quota.
   - *Consequence:* quota exhaustion, runaway cloud bill, DB saturation.

4. **Upload / export resource exhaustion.** `/upload`, `/import`, `/api/export`, `/download-all`.
   - *How to detect:* Check for a count limit AND a size/payload cap. Repeated large uploads fill disk; repeated full-dataset exports pin CPU/memory and enable bulk exfiltration.
   - *Consequence:* disk-full DoS, memory exhaustion, data exfil at scale.

5. **Global vs per-route limits.** A single app-wide limiter.
   - *How to detect:* Search for one `app.use(limiter)` / global throttle config with no route-specific overrides. A global limit can't be both strict for /login and lenient for asset routes — sensitive endpoints leak through.
   - *Consequence:* sensitive endpoints effectively unthrottled.

6. **In-memory limiter that breaks across instances.** Limiter with no external store in a scaled deployment.
   - *How to detect:* Check the limiter's `store` config. Default for `express-rate-limit`, many Flask-Limiter setups, and `golang.org/x/time/rate` is in-process memory. In a load-balanced / autoscaled / serverless environment, each instance counts independently → attacker gets limit × instance-count, and counts reset on every deploy/restart.
   - *Consequence:* limit silently multiplied; bypass via load distribution.

7. **Limiter keyed on a spoofable header.** Key derived directly from `X-Forwarded-For` / `X-Real-IP`.
   - *How to detect:* Grep for the limiter's key function reading a forwarded header, or `trust proxy` not configured so the framework can't resolve the true client IP. An attacker rotating the header value per request gets a fresh bucket each time.
   - *Consequence:* per-IP limit fully bypassed.

## Phase 2 — Grep Leads

Look for sensitive routes declared **without** an adjacent limiter, and for limiters configured with the wrong key/store.

### JavaScript / Node (express-rate-limit, rate-limiter-flexible)
Pattern: `app\.(post|get)\(['"]/(login|signup|password-reset|verify-otp|reset)['"]` (sensitive route — confirm a limiter arg follows)
Pattern: `rateLimit\(` / `new RateLimiterMemory\(` (limiter present — check it's not memory-only in a scaled app)
Pattern: `new RateLimiterRedis\(|store:\s*new RedisStore` (GOOD — distributed store)
Pattern: `keyGenerator:.*headers\['x-forwarded-for'\]|req\.headers\['x-forwarded-for'\]` (BAD — spoofable key)
Pattern: `app\.set\(['"]trust proxy['"]` (presence needed behind a proxy so client IP is real)
Lead: a `loginLimiter`/`authLimiter` defined but **not** passed to the `/login` route handler.

### Python (Flask-Limiter, django-ratelimit, DRF throttling)
Pattern: `@app\.route\(['"]/(login|signup|reset)` *not* preceded by `@limiter\.limit\(` (Flask — unthrottled)
Pattern: `@limiter\.limit\(` / `Limiter\(.*storage_uri=` (Flask-Limiter — check `storage_uri=redis://`, not memory)
Pattern: `@ratelimit\(key=.*method=` (django-ratelimit — check `key='ip'`/`'user'`, not a header)
Pattern: `throttle_classes\s*=|DEFAULT_THROTTLE_RATES` (DRF — check rates set for scoped/anon/user)
Pattern: `key=['"]header:x-forwarded-for['"]` (BAD — spoofable key in django-ratelimit)

### Go (golang.org/x/time/rate, ulule/limiter, gin middleware)
Pattern: `router\.(POST|GET)\(['"]/(login|signup|otp)` not wrapped by limiter middleware
Pattern: `rate\.NewLimiter\(|rate\.Every\(` (x/time/rate — per-process, in-memory; not shared across instances)
Pattern: `limiter\.New\(store,|memory\.NewStore\(` (ulule/limiter — `memory` store won't scale; use `redis.NewStore`)
Pattern: `c\.GetHeader\("X-Forwarded-For"\)|c\.Request\.Header\.Get\("X-Real-IP"\)` as the limiter key (BAD)
Pattern: `gin-gonic.*RateLimiter|ginlimiter` (Gin middleware present — verify store + key)

### Java / Spring (Bucket4j, Resilience4j RateLimiter)
Pattern: `@PostMapping\(['"]/(login|signup)` without `@RateLimiter` / interceptor
Pattern: `Bucket4j\.builder\(\)|Bandwidth\.classic\(` (Bucket4j — check it's `proxyManager`/Redis-backed for clusters, not a local `Bucket`)
Pattern: `@RateLimiter\(name =|RateLimiterRegistry` (Resilience4j — present; node-local unless externalized)
Pattern: `request\.getHeader\("X-Forwarded-For"\)` used as bucket key (BAD)
Pattern: `ForwardedHeaderFilter|server\.forward-headers-strategy` (config needed so remote addr is real)

### C# / .NET (AspNetCoreRateLimit, .NET 7+ RateLimiter middleware)
Pattern: `\[HttpPost\("login"\)\]` without `[EnableRateLimiting(...)]`
Pattern: `AddRateLimiter\(|RateLimitPartition\.Get` (.NET 7+ built-in — check partition key = real IP/user)
Pattern: `services\.Configure<IpRateLimitOptions>|IpRateLimitMiddleware` (AspNetCoreRateLimit — check `RealIpHeader` configured to a trusted hop)
Pattern: `RealIpHeader\s*=\s*"X-Forwarded-For"` without `KnownProxies`/`ForwardedHeaders` (BAD — spoofable)
Pattern: `app\.UseForwardedHeaders\(` (needed so `HttpContext.Connection.RemoteIpAddress` is the real client)

## Phase 3 — Triage

| Endpoint | Throttled? | Severity | Exploitable? | Fix Effort |
| --- | --- | --- | --- | --- |
| /login | No | CRITICAL | Yes — brute-force / credential stuffing | Low (middleware) |
| /verify-otp | No | CRITICAL | Yes — 10k-space cracked in minutes | Low |
| /password-reset | No | HIGH | Yes — mailbox flood / lockout | Low |
| /signup | No | MEDIUM | Yes — bot/spam accounts | Low |
| /api/search, /graphql | No | HIGH | Yes — quota/bill spike, DB DoS | Medium |
| /api/export, /upload | No | HIGH | Yes — resource exhaustion / exfil | Medium |
| /login | Yes, but in-memory store, scaled app | HIGH | Yes — limit × instance-count | Medium (add Redis) |
| /login | Yes, but keyed on X-Forwarded-For | HIGH | Yes — rotate header to bypass | Low (fix key + trust proxy) |
| /login | Yes, distributed + per-IP+account | LOW | No | N/A (already safe) |
| Any | Global limit only, no per-route | MEDIUM | Partial — sensitive routes leak | Low |

## Phase 4 — Ponytail Fix Ladder

1. **Framework rate-limit middleware.** Reach for the built-in first: `express-rate-limit` / `rate-limiter-flexible`, Flask-Limiter / django-ratelimit / DRF throttling, Gin limiter middleware, Bucket4j/Resilience4j, .NET 7+ `AddRateLimiter`. One line per route.
2. **Managed edge service.** Push throttling to the edge where it absorbs load before it hits your app: Cloudflare Rate Limiting / WAF, AWS API Gateway usage plans + throttling, Auth0/Okta attack protection for auth. Best for blunt DoS and bot floods.
3. **Distributed store (Redis) backed limiter.** When you run more than one instance, back the framework limiter with Redis (`rate-limiter-flexible` RateLimiterRedis, Flask-Limiter `storage_uri=redis://`, ulule/limiter redis store, Bucket4j `proxyManager`). Shared count survives scaling and restarts.
4. **Per-route custom limits.** Override the global default with route-specific buckets: strict on /login, /verify-otp, /password-reset; looser on read APIs; size-capped on /upload, /export.
5. **CAPTCHA / exponential backoff for auth.** Layer adaptive friction on auth: progressive delay after each failure, CAPTCHA after N misses, temporary account-level cooldown. Stops brute-force without permanently locking real users out.
6. **Custom token bucket (last resort).** Only when no library fits (exotic protocol, custom cost accounting). Implement a token bucket / sliding window against the shared store, with explicit key + `Retry-After`. Most error-prone — avoid unless necessary.

## Phase 5 — Record Format

```
ID: RATE-001
Title: Login endpoint unthrottled — brute-force possible
Severity: CRITICAL
Fix Effort: Low
Confidence: 95%
Location: routes/auth.js:34
Vector: Attacker POSTs /login with credential list; no 429 after 1000s of attempts
Impact: Account takeover via brute-force / credential stuffing
Evidence: app.post('/login', loginHandler) — no rate-limit middleware; loginLimiter defined but unused
Key/Store concern: would also need per-IP + per-account key, Redis store (app runs 4 instances)
Proposed Fix: app.post('/login', loginLimiter, loginHandler) with RateLimiterRedis, 5/15min per IP+account
```

## Phase 6 — Propose → Fix on Approval

Standard limits (starting points; tune to traffic):

- Login: 5 per 15 min per IP **and** per account
- Signup: 5 per hour per IP
- Password reset: 3 per hour per email + per IP
- OTP / verify: 5 per 15 min per user; rotate/expire code after limit
- API search: 100 per min per user
- GraphQL: 50 per min per user + query depth/complexity cap
- Export: 5 per hour per user
- Upload: 10 per hour per user + size cap

Ask the user: Apply all? Critical (auth/OTP) only? Adjust limits or windows? Single instance or scaled (decides store)?

### Vulnerable → Fixed Examples

**JavaScript / Express (Vulnerable):**
```javascript
// DANGER: no rate limit — unlimited password guesses
app.post('/login', (req, res) => {
    // authenticate(req.body.username, req.body.password)
});
```

**JavaScript / Express (Fixed):**
```javascript
const { rateLimit } = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;

app.set('trust proxy', 1); // derive real client IP from trusted proxy hop

const loginLimiter = rateLimit({
    store: new RedisStore({ sendCommand: (...a) => redis.call(...a) }), // shared across instances
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,            // emits RateLimit-* and Retry-After
    keyGenerator: (req) => `${req.ip}:${req.body.username || ''}`, // per-IP + per-account
    handler: (req, res) =>
        res.status(429).set('Retry-After', '900').json({ error: 'Too many attempts' }),
});

app.post('/login', loginLimiter, (req, res) => { /* authenticate */ });
```

**Python (Vulnerable — Flask):**
```python
# DANGER: no limiter
@app.route('/login', methods=['POST'])
def login():
    return authenticate(request.form['username'], request.form['password'])
```

**Python (Fixed — Flask-Limiter + Redis, and django-ratelimit decorator):**
```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address  # uses real IP when ProxyFix is set

limiter = Limiter(get_remote_address, app=app, storage_uri="redis://localhost:6379")
# behind a proxy: app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)

@app.route('/login', methods=['POST'])
@limiter.limit("5 per 15 minutes")  # returns 429 + Retry-After automatically
def login():
    return authenticate(request.form['username'], request.form['password'])

# Django equivalent:
# from django_ratelimit.decorators import ratelimit
# @ratelimit(key='ip', rate='5/15m', block=True)   # key='ip' resolves real client IP
# def login_view(request): ...
```

**Go (Vulnerable — Gin):**
```go
// DANGER: no limiter middleware
r.POST("/login", loginHandler)
```

**Go (Fixed — Gin + ulule/limiter, Redis store):**
```go
import (
    "github.com/gin-gonic/gin"
    limiter "github.com/ulule/limiter/v3"
    mgin "github.com/ulule/limiter/v3/drivers/middleware/gin"
    sredis "github.com/ulule/limiter/v3/drivers/store/redis"
)

rate := limiter.Rate{Period: 15 * time.Minute, Limit: 5}
store, _ := sredis.NewStore(redisClient) // shared across instances
// ClientIPHeaders left default + Gin trusted proxies set, so ClientIP() is the real IP
mw := mgin.NewMiddleware(limiter.New(store, rate)) // emits 429 + Retry-After
r.POST("/login", mw, loginHandler)
```

**Java / Spring (Vulnerable):**
```java
// DANGER: no rate limiting
@PostMapping("/login")
public ResponseEntity<?> login(@RequestBody Credentials c) {
    return authService.authenticate(c);
}
```

**Java / Spring (Fixed — Bucket4j):**
```java
// Resolve a per-IP+account bucket from a Redis-backed proxyManager (shared across nodes)
@PostMapping("/login")
public ResponseEntity<?> login(@RequestBody Credentials c, HttpServletRequest req) {
    String key = clientIp(req) + ":" + c.getUsername(); // clientIp() trusts only known proxy
    Bucket bucket = buckets.builder().build(key, () -> BucketConfiguration.builder()
        .addLimit(Bandwidth.classic(5, Refill.intervally(5, Duration.ofMinutes(15)))).build());
    if (!bucket.tryConsume(1)) {
        return ResponseEntity.status(429).header("Retry-After", "900").build();
    }
    return authService.authenticate(c);
}
```

**C# / .NET (Vulnerable):**
```csharp
// DANGER: no rate limiting
app.MapPost("/login", (Credentials c) => AuthService.Login(c));
```

**C# / .NET (Fixed — .NET 7+ RateLimiter middleware):**
```csharp
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.OnRejected = async (ctx, _) => {            // surface Retry-After
        ctx.HttpContext.Response.Headers.RetryAfter = "900";
    };
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        // real client IP — UseForwardedHeaders must be configured for proxies
        partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(15) }));
});
app.UseForwardedHeaders();
app.UseRateLimiter();
app.MapPost("/login", (Credentials c) => AuthService.Login(c)).RequireRateLimiting("login");
```

## Phase 7 — Verification Checklist

- [ ] 6th login attempt within the window returns `429 Too Many Requests` (not 200/401).
- [ ] `Retry-After` header is present on the 429 response (and `RateLimit-*` headers where supported).
- [ ] OTP/verify endpoint blocks after N failures **and** rotates/expires the code.
- [ ] Limiter works across instances: hit two app instances behind the LB and confirm a shared count (not 5 per instance).
- [ ] Limiter survives restart/deploy (count not reset to zero by bouncing a process) — confirms external store.
- [ ] Limiter keyed on the real client IP, not a raw `X-Forwarded-For` / `X-Real-IP` value; sending a forged header per request does **not** grant fresh buckets.
- [ ] `trust proxy` / `ProxyFix` / `UseForwardedHeaders` / forwarded-header strategy is configured for the proxy topology.
- [ ] Sensitive endpoints have per-route limits, not just a global default.
- [ ] Auth endpoints use a dual key (per-IP AND per-account) so IP rotation or account targeting can't bypass.
- [ ] Store-outage behavior is deliberate: auth endpoints fail closed (or degrade to strict local limit), not silently open.
- [ ] Upload/export have a size/payload cap in addition to a request-count limit.
- [ ] Legitimate users are not blocked under normal usage; rate-limit hits are logged/metered for alerting.

## Quality Bar

1. Real `file:line` evidence for every finding.
2. Severity, Fix Effort, and Confidence rated per finding.
3. At least the auth, expensive-API, and file/upload categories checked.
4. Each limit justified (e.g., 5/15min on login is industry standard).
5. Correct key documented (per-IP vs per-user vs per-account; dual key for auth).
6. Store correctness assessed (in-memory vs Redis/distributed) for the actual deployment topology.
7. Spoofable-header pitfall explicitly checked (`X-Forwarded-For` keying + `trust proxy`).
8. `429` + `Retry-After` confirmed in the proposed fix.
9. Fixes concrete, language-appropriate, and implementable; applied fixes verified.
10. No false positives and no blocking of legitimate users.

## Example Triggers

- "rate limiting"
- "brute force protection"
- "DoS prevention"
- "throttling"
- "login attempts"
- "password reset spam"
- "API quota"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 6 (DoS & Resource Limits)**. blueteam-defend covers the full layer (timeouts, payload caps, connection limits, resource quotas); this skill is the deep-dive on rate limiting with per-language fixes, correct keying, distributed-store and spoofable-header pitfalls, and verification.
