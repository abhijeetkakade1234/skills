---
name: cors-csrf-audit
description: >
  Audit CORS and CSRF protections. Detect permissive CORS (Access-Control-Allow-Origin: *), missing CSRF tokens, weak SameSite cookie settings. Extends blueteam-defend Layer 8 (Configuration & Deployment). Ponytail: Framework middleware first → HTTP headers → Custom validation.
---

# CORS & CSRF Audit — Prevent Cross-Origin Attacks

Operate as a cross-origin security engineer. CORS/CSRF misconfigurations leak data and trick users into actions.

**Default workflow: detect CORS issues → detect CSRF gaps → propose fixes → verify.**

## Core Doctrine — Restrict Cross-Origin Access

| Vulnerability | Attack | Risk |
| --- | --- | --- |
| `Access-Control-Allow-Origin: *` + credentials | Attacker site reads user's data | Data theft |
| No CSRF token on POST /transfer | Attacker site submits transfer | Fund theft, state change |
| `SameSite=None` + no Secure flag | Attacker exploits over HTTP | CSRF over HTTP |
| Missing CSRF token on any state-change | Form resubmitted by attacker | Duplicate action, money lost |

## Operating Principles

- CORS: Only allow trusted origins, never * with credentials.
- CSRF: Require token on POST/PUT/DELETE, never GET.
- SameSite: Strict (default) or Lax, never None without Secure.
- CSP: Content Security Policy as defense layer.

## Phase 1 — Detect CORS Issues

Search: Access-Control-Allow-Origin header, withCredentials, credentials: true
Red flags: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Credentials: true`, Allow origin = req.headers.origin

## Phase 2 — Grep Leads

JS: `Access-Control-Allow-Origin`, `withCredentials`, `app.use(cors())`
Python: `CORS_ALLOW_ALL_ORIGINS`, `allow_credentials=True`, `cors(supports_credentials=True)`
Express: `cors()` without options, `cors({origin: '*'})`

Detect CSRF gaps: POST/PUT/DELETE without `csrfToken`, missing `_csrf` field

## Phase 3 — Triage

- CRITICAL: `Access-Control-Allow-Origin: *` + credentials = all users' data exposed
- HIGH: Missing CSRF token on money operations
- MEDIUM: Missing SameSite flag on auth cookies
- Fix Effort: Low (add header/token), Medium (refactor cookie settings)

## Phase 4 — Ponytail Ladder

1. CORS/CSRF really needed? → Yes if handling HTTP
2. Already protected? → Check middleware, verify tokens
3. Framework middleware available? → cors(), csrf() from Express, Django, Spring
4. Managed service (API Gateway)? → AWS API Gateway CORS, WAF rules
5. Can add in one line? → Middleware
6. Only then: custom validation

## Phase 5 — Record Format

ID, Title (e.g., "CORS allows all origins"), Severity/Fix Effort/Confidence, Location, Vector, Impact, Fix

## Phase 6 — Fix Examples

CORS vulnerable → fixed:
```
Before: app.use(cors());  // Allows all origins + credentials
After:  app.use(cors({origin: ['https://trusted.com'], credentials: true}));
```

CSRF vulnerable → fixed:
```
Before: <form method="POST"><input name="amount">  // No token
After:  <form method="POST"><input name="_csrf" value="TOKEN"><input name="amount">
```

## Phase 7 — Verify

- Test CORS: OPTIONS request from different origin → should be denied or limited
- Test CSRF: POST without token → 403 Forbidden
- Check cookies have SameSite and Secure flags
- Run tests/build

## Quality Bar

- Real file:line evidence
- Severity, Fix Effort, Confidence rated
- CORS + CSRF both checked
- Fixes middleware-based, not custom
- Verified in browser (F12 Network tab)

## Example Triggers

- "CORS"
- "CSRF"
- "cross-origin"
- "state-changing endpoint"
- "cookie security"

## Relationship to blueteam-defend

Extends Layer 8 (Configuration & Deployment). CORS/CSRF are foundation web security.
