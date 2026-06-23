---
name: rate-limiting-audit
description: >
  Audit for missing rate limits on sensitive endpoints: login, password reset, API calls, file uploads. Detect brute-force vulnerability, DoS attacks, quota exhaustion. Use when user says "rate limiting", "brute force", "throttling", "DoS protection", "login attempts", "password reset spam". Extends blueteam-defend Layer 6. Ponytail: Framework middleware first → Managed service → Custom token bucket.
---

# Rate Limiting Audit — Prevent Brute-Force & DoS

Operate as a rate-limiting security engineer. Missing rate limits enable brute-force attacks, quota exhaustion, and DoS.

**Default workflow: detect unthrottled endpoints → classify → propose rate limits → verify.**

## Core Doctrine — Throttle Every Sensitive Endpoint

| Endpoint | Attack | No Limit = |
| --- | --- | --- |
| /login | Brute-force 1000s passwords | Account takeover |
| /password-reset | Spam reset emails | Email DoS, account lockout |
| /api/send-otp | OTP brute-force (0000-9999) | 2FA bypass, account hijack |
| /api/search | Query amplification | Quota exhaustion, $1000s bill |
| /api/export | Export full dataset | Server CPU/memory exhausted |
| /upload | Large file upload | Disk full, service DoS |

## Operating Principles

- Identify sensitive endpoints: auth, verification, expensive operations.
- Different limits per operation: login 5/min, API search 100/min, upload 1/min.
- Distinguish per-IP (login) vs. per-user (API quota).
- Return 429 Too Many Requests; client backs off.
- Monitor quota; alert at 80%.
- Test enforcement: 6th request in 1min = 429.

## Phase 1 — Detect Unthrottled Endpoints

Map sensitive surface: /login, /password-reset, /verify-otp, /api/search, /api/export, /upload.

For each: Is it sensitive? Can attacker call unlimited times? What's the consequence?

## Phase 2 — Grep Leads

JavaScript/Express: `app.post('/login'` without `.rateLimit()` middleware
Python/Django: `@app.route('/login'` without `@limiter.limit` decorator
Go/Gin: `router.POST("/login"` not in `.Use(RateLimitMiddleware)`
Java/Spring: `@PostMapping("/login"` without `@RateLimiter`

## Phase 3 — Triage

- CRITICAL: Auth endpoint completely unthrottled = account takeover
- HIGH: Expensive API unthrottled = DoS/quota bill spike
- MEDIUM: Public endpoint with loose limits
- Fix Effort: Low (middleware), Medium (refactor), High (custom)

## Phase 4 — Ponytail Ladder

1. Does endpoint need rate limiting? → Yes (auth/expensive)
2. Already has it? → Verify middleware exists, check limits
3. Framework middleware available? → Use Express rate-limit, Django ratelimit, Flask-Limiter
4. Managed service available? → AWS API Gateway, Cloudflare, Auth0
5. Can add in one line? → Middleware decorator
6. Only then: custom token bucket

## Phase 5 — Record Format

ID, Title (e.g., "Login endpoint unthrottled"), Severity/Fix Effort/Confidence, Location (file:line), Vector (what attacker does), Impact (consequence), Proposed Fix (before/after)

## Phase 6 — Propose → Fix on Approval

Standard limits:
- Login: 5 per 15min per IP
- Password reset: 3 per hour per email
- OTP: 5 per 15min per user
- API search: 100 per min per user
- Export: 5 per hour per user

Ask user: Apply all? Critical only? Adjust limits?

Example Express fix:
```
Before: app.post('/login', (req, res) => { ... })  // No limit
After:  app.post('/login', loginLimiter, (req, res) => { ... })  // 5/15min
```

## Phase 7 — Verify

- Test manually: 6 requests in 1min = 429
- Check headers: Retry-After present
- Run tests/build
- Verify logging of rate-limit hits
- Check limits are reasonable

## Quality Bar

- Real file:line evidence
- Severity, Fix Effort, Confidence rated
- At least 3 endpoints checked (auth, API, file)
- Limits justified (5/min login is standard)
- Fixes concrete and implementable
- Applied fixes verified
- No false positives
- Doesn't block legitimate users

## Example Triggers

- "rate limiting"
- "brute force protection"
- "DoS prevention"
- "throttling"
- "login attempts"
- "password reset spam"
- "API quota"

## Relationship to blueteam-defend

rate-limiting-audit focuses on throttling; blueteam-defend covers full Layer 6 (DoS & Resource Limits). Use this skill for deep audit on rate limiting with per-language fixes.
