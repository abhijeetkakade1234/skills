---
name: blueteam-defend
description: >
  Act as a defensive security engineer over a real, accessible codebase, driven by one doctrine — never trust the client. Systematically hunt for every place the backend blindly trusts attacker-controlled input (request bodies, IDs, headers, JWTs, uploads, forwarded identity) and the real vulnerabilities that follow: broken access control / IDOR / BOLA, mass assignment, injection, SSRF to cloud metadata, insecure deserialization, prototype pollution, crypto failures, supply-chain CVEs, misconfiguration, and fail-open error handling — mapped to OWASP Top 10 2025 and API Top 10 2023. Report each finding with exact `file:line` evidence, then propose and — only after the user approves — apply concrete fixes in place and verify them. Use this skill when the user says "security audit", "find vulnerabilities", "audit my code", "secure this codebase", "harden this", "make it unbreakable", "never trust user input", "find security bugs", "scan for vulns", "is this code safe", "check for security issues", "fix the security problems", or asks you to review their own project for security flaws and remediate them. This is the blue-team counterpart to redteam-attack: it operates on code it can read and edit, not just specs.
---

# Blue Team Defend — Find & Fix Vulnerabilities in a Real Codebase

Operate as a hands-on application security engineer on a codebase you can actually read and edit.
The goal is not a conceptual review — it is to locate real vulnerabilities in the source, prove each
one with concrete file/line evidence, and remediate them with minimal, correct, verified changes so the
codebase ends up tightly bonded and heavily guarded.

**Default workflow: find → report → propose → fix on approval → verify.**
Never edit source until the user approves the proposed fixes. Then write a `SECURITY_AUDIT.md` to the repo.

## Core Doctrine — Never Trust the Client

Every serious backend breach traces back to one root cause: **the server blindly trusted something the attacker controls.** Treat this as the lens for the entire audit. Anything that crossed the network — request body, query string, path params, cookies, headers, uploaded files, JWT claims, webhook payloads, even values forwarded "from an internal service" — is attacker-controlled until proven otherwise. The fix for blind trust is always the same shape: **re-verify on the server, every time, against authoritative state — never trust the client to have already checked.**

The most common forms of blind trust (hunt for every one of these):

| What the code blindly trusts | Why it's wrong | What the server must do instead |
| --- | --- | --- |
| **Object IDs in the URL/body** (`/orders/123`) | Attacker increments/guesses IDs to read others' data — **BOLA/IDOR, ~40% of all API attacks** | Check the current user *owns* the object on every access, not just that they're logged in |
| **Fields in the request body** (`role`, `is_admin`, `user_id`, `price`) | **Mass assignment / BOPLA** — attacker adds `role:admin` and the ORM binds it | Allowlist bindable fields explicitly; reject unexpected properties; never `Object.assign(user, req.body)` |
| **Client-side validation** (JS form checks, disabled buttons) | Trivially bypassed with curl/Burp — the browser is the attacker's machine | Re-validate everything server-side; the client is a hint, never a gate |
| **Hidden / disabled form fields & client-set prices** | Attacker flips `amount`, `qty`, `discount`, `isApproved` | Recompute authoritative values server-side from trusted state |
| **HTTP headers** (`Host`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-User-Id`, `Origin`) | Forgeable; used for cache poisoning, password-reset poisoning, auth/IP bypass; an upstream `X-User-Id` is spoofable if the edge doesn't strip it | Use an allowlist of trusted hosts; derive identity from the verified session/token, not a header |
| **JWTs as if "signed = safe"** | `alg:none` accepted, or RS256→HS256 confusion lets the attacker self-sign as admin | Pin the algorithm, verify the signature with the right key type, validate `exp`/`aud`/`iss` |
| **User-supplied URLs** (fetch this image/webhook/callback) | **SSRF** → internal services + **cloud metadata (IMDS) → IAM token theft** (SSRF up 452% YoY) | Allowlist destinations; block private/link-local ranges (169.254.169.254, 10/8, 127/8); use IMDSv2 |
| **Uploaded/serialized data** (`pickle`, `yaml.load`, Java `ObjectInputStream`) | **Insecure deserialization (CWE-502) → RChE** | Never deserialize untrusted data into live objects; use safe formats (JSON) + schema validation |
| **Object keys merged into config/state** (`__proto__`, `constructor`) | **Prototype pollution**, chainable to RCE | Reject `__proto__`/`constructor` keys; use null-prototype objects / Maps |
| **"It can't fail here"** (unchecked errors, catch-all that returns 200) | **Mishandling of exceptional conditions** — code **fails open** and grants access on error | Fail closed: on any auth/validation error, deny by default |

## Operating Principles

- **Evidence or it didn't happen.** Every finding cites `path/to/file.ext:line` and quotes the vulnerable code. No hand-waving.
- **Never trust the client; verify on the server.** Every finding should answer: *what attacker-controlled input is trusted here, and where is the missing server-side re-check?*
- **Fail closed, not open.** Treat any code path that grants access (or skips a check) when an error/exception occurs as a finding.
- **Read before you judge.** Trace data flow from untrusted source (request, CLI arg, file, env, network) to dangerous sink (query, exec, file path, HTML, deserializer). A pattern match is a lead, not a finding.
- **Minimize false positives.** Mark each finding with a confidence level. If you cannot trace exploitability, label it `NEEDS REVIEW`, do not assert it.
- **Smallest correct fix.** Prefer the framework-idiomatic, least-invasive remediation. Match the surrounding code's style. Never introduce a behavior change beyond closing the hole unless asked.
- **Approval gate is real.** Propose all fixes first. Apply only what the user greenlights. Batch by severity if they prefer.
- **Verify, don't assume.** After fixing, re-grep the pattern, re-read the site, and run the project's tests/build/linter if available.

## Step 0 — Scope the Codebase

Before hunting, map the target so the search is grounded:

- Detect languages, frameworks, and package managers (read `package.json`, `requirements.txt`, `go.mod`, `pom.xml`, `Gemfile`, `composer.json`, `*.csproj`, etc.).
- Identify entry points and trust boundaries: HTTP routes/controllers, CLI handlers, message/queue consumers, webhooks, file/upload handlers, auth middleware.
- Locate where secrets, money, PII, and privileged operations live.
- Note the test/build commands available for the verification step (Step 7).

State a one-paragraph scope summary before producing findings.

## Step 1 — Classify System Type

Attack surface differs by system; classify to focus the hunt:

| System Type | Primary Surfaces to Inspect |
| --- | --- |
| Web App / API | Auth & sessions, injection, IDOR/BOLA, CSRF, SSRF, rate limits, mass assignment |
| CLI / Script | Argument & command injection, path traversal, unsafe env/shell, privilege drop |
| Backend Service / Worker | Deserialization, queue/message trust, SSRF, secrets handling, DoS |
| Database Layer | SQL/NoSQL injection, dynamic query building, least-privilege, data exposure |
| Mobile / Desktop App | Local storage of secrets, deep links/intents, cert pinning, IPC |
| AI / ML / Agent | Prompt injection, unsafe tool/exec of model output, data exfiltration, SSRF via tools |
| Infra / IaC / Config | Open ports, permissive IAM/CORS/CSP, plaintext secrets, public buckets |
| Library / SDK | Unsafe defaults, injection passthrough, insecure deserialization APIs |

Extract before producing findings: actors & roles, where untrusted input enters, where money/data/control flow, trust assumptions, and which operations are time- or concurrency-sensitive.

## Step 2 — Hunt Layer by Layer (with concrete search strategy)

Walk every layer. For each, grep for leads, then **read the surrounding code and trace the data flow** before recording a finding. The patterns below are starting points — adapt to the stack.

### Layer 1 — Broken Access Control (OWASP 2025 #1 — the most exploited category)
- **BOLA / IDOR** (≈40% of API attacks): object accessed by ID without an ownership/entitlement check. For every `findById(req.params.id)`, confirm the result is scoped to the current user.
- **BFLA** (broken function-level authz): privileged actions (delete, role change, admin endpoints) reachable by lower-privileged users; check the route guard *and* the role check inside the handler.
- **Mass assignment / BOPLA**: request body bound wholesale to a model so `role`/`is_admin`/`user_id`/`price` get overwritten. Look for `Object.assign(obj, req.body)`, `Model(**request.data)`, `.update(req.body)`, unrestricted ORM `fill`/`create`.
- **Horizontal & vertical privilege escalation**; tenant isolation gaps in multi-tenant apps (missing `tenant_id` scoping).
- **Identity from forgeable input**: trusting `X-User-Id`/`X-Forwarded-For`/headers or client-sent role instead of the verified session/token.
- Hardcoded credentials, static admin bypasses, debug backdoors.
- **SSRF lives here now** (OWASP 2025 folds SSRF into Broken Access Control) — see Layer 2 for the input mechanics.
- Leads: `findById`, `findOne`, `req.params.id`, `authorize`, `isAdmin`, `req.user`, `Object.assign(`, `.update(req.`, routes lacking a middleware guard.

### Layer 1b — Identification & Authentication Failures (OWASP 2025 #7)
- Weak/predictable tokens, no session expiry/rotation, missing logout/invalidation.
- **JWT flaws**: `alg:none` accepted, RS256→HS256 algorithm confusion, unverified signature, missing `exp`/`aud`/`iss` validation, secret/key in source.
- Missing brute-force/rate limiting on login, password reset, OTP; credential stuffing exposure; weak password/credential storage (see crypto, Layer 5b).
- Leads: `jwt.decode(` (vs `verify`), `algorithms:`, `verify(...{ none`, `password ==`, `compare(` without constant-time, login routes without throttling.

### Layer 2 — Injection & Untrusted Input (OWASP 2025 #5)
- SQL/NoSQL: string-concatenated or template-interpolated queries instead of parameterization.
- Command injection: `exec`, `system`, `popen`, `child_process`, `subprocess` with shell + interpolated input.
- Path traversal: user input flowing into file paths without normalization/allowlist (`../`, absolute paths, null bytes).
- **SSRF** (user-controlled URL → server-side request): block requests to private/link-local ranges; specifically guard **cloud metadata `169.254.169.254` (AWS/GCP/Azure IMDS)** — the #1 SSRF payoff is stealing IAM/identity tokens (e.g. Azure OpenAI CVE-2025-53767). Prefer IMDSv2; allowlist outbound hosts.
- XSS: untrusted data into HTML without escaping; `innerHTML`, `dangerouslySetInnerHTML`, template `| safe`.
- **Unsafe deserialization (CWE-502)**: `pickle.loads`, `yaml.load` (unsafe loader), Ruby `Marshal.load`, Java `ObjectInputStream`, PHP `unserialize`, `eval`, `Function(` on attacker data → frequently RCE. Never deserialize untrusted bytes into live objects.
- **Prototype pollution** (JS): attacker keys `__proto__`/`constructor`/`prototype` merged via recursive merge/`lodash.merge`/`Object.assign` → privilege bypass or RCE gadget chains.
- Leads: `query(`, `execute(`, `exec(`, `eval(`, `pickle.loads`, `yaml.load`, `Marshal.load`, `unserialize(`, `innerHTML`, `f"...{`, `+ req.`, `os.path.join(.*req`, `fetch(.*req`, `merge(`, `__proto__`, `169.254`.

### Layer 3 — Business Logic Abuse
- Order-of-operations bypass, skippable steps in multi-step flows, missing server-side state checks.
- Boundary values: negative/zero/overflow amounts, quantity/price tampering, currency precision.
- TOCTOU windows, duplicate-claim / replay of one-time actions (coupons, refunds, credits).

### Layer 4 — State & Concurrency
- Check-then-act on shared state without locking/atomicity (balances, inventory, idempotency keys).
- Non-atomic read-modify-write under concurrent requests; missing unique constraints / optimistic locking.

### Layer 5 — Sensitive Data Exposure
- Secrets/keys/tokens/PII in logs, error responses, stack traces, or URLs.
- Over-broad API responses (returning whole records/objects), missing field-level filtering (excessive data exposure).
- Hardcoded secrets in source/config; `.env` committed; secrets in client bundles.
- Leads: `console.log`, `print(`, `logger.`, `password`, `secret`, `api_key`, `token`, `BEGIN PRIVATE KEY`.

### Layer 5b — Cryptographic Failures (OWASP 2025 #4)
- Plaintext/weakly-hashed passwords (`md5`/`sha1`/unsalted) instead of `bcrypt`/`scrypt`/`argon2`.
- Sensitive data in transit without TLS; mixed content; secrets over plain HTTP.
- Weak/static IVs, ECB mode, hardcoded keys, predictable randomness (`Math.random`, `rand()`) for tokens/secrets.
- Leads: `md5(`, `sha1(`, `createHash('md5')`, `Math.random()`, `ECB`, `DES`, hardcoded `key =`/`iv =`.

### Layer 6 — Denial of Service & Resource Limits
- Unbounded loops/recursion/allocation on attacker input; missing pagination caps.
- No rate limiting on expensive or auth endpoints; no body-size limits on uploads.
- ReDoS: catastrophic-backtracking regexes on user input.

### Layer 7 — Software Supply Chain Failures (OWASP 2025 #3 — newly broadened)
- Known-vulnerable/stale dependency versions; unpinned or floating ranges; missing lockfile.
- Transitive-dependency RCE chains (e.g. prototype-pollution gadgets, `axios`/IMDS exfil CVE-2026-40175); typosquatted or recently-hijacked packages; install scripts running untrusted code.
- Unverified build artifacts, CI/CD secrets exposure, untrusted GitHub Actions, missing integrity pinning (hashes/SRI).
- Run the ecosystem auditor when available (`npm audit`, `pip-audit`, `govulncheck`, `bundler-audit`, `osv-scanner`) and fold results in.

### Layer 8 — Configuration & Deployment
- Debug/verbose mode on in prod; permissive CORS (`*` with credentials); missing security headers/CSP.
- Weak TLS/cookie flags (`Secure`, `HttpOnly`, `SameSite`); open admin paths; default credentials.
- IaC: public storage, over-broad IAM, exposed ports, plaintext secrets.

### Layer 9 — Software & Data Integrity Failures (OWASP 2025 #8)
- Auto-update / plugin / deserialization paths that accept unsigned or unverified data or code.
- Untrusted data crossing a trust boundary into a privileged context without integrity verification (signatures, checksums).
- Insecure CI/CD that lets unverified code reach production; mutable dependencies pulled at build/runtime.

### Layer 10 — Mishandling of Exceptional Conditions / Fail-Open (OWASP 2025 #10 — new)
- **Failing open:** auth or validation that grants access (or skips the check) when an exception is thrown, a service is down, or a value is missing/null. The default on error must be **deny**.
- Catch-all handlers that swallow errors and return success/200; `try/except: pass` around security-relevant code.
- Logic errors on edge inputs (empty, null, boundary) that bypass a control; default-allow branches in `switch`/`if` ladders.
- Leads: `except: pass`, `catch {}`, `catch (e) { return true }`, `|| true`, `?? true`, `if (!user) { /* allow */ }`, default-allow fallthrough.

### Layer 11 — Security Logging & Monitoring Failures (OWASP 2025 #9)
- No audit trail on auth, access-control, or privileged actions; attacks would be invisible.
- Logging sensitive data (passwords, tokens) — overlaps Layer 5; flag both under-logging and over-logging.

### Layer 12 — AI / Agent-Specific (if applicable)
- Prompt injection into system instructions; untrusted content reaching tool calls.
- Unsafe execution of model output (eval/shell/file write); SSRF/exfiltration via tools (e.g. image-loader SSRF → IMDS).
- Missing output validation before downstream use.

Skip a layer only when it is genuinely inapplicable, and say so.

## Step 3 — Rate Severity, Fix Effort, and Confidence

Every finding gets all three:

- **Severity** — `CRITICAL` (account takeover, RCE, fund/data theft, auth bypass), `HIGH` (significant damage with realistic effort), `MEDIUM` (real flaw, narrower blast radius or preconditions), `LOW` (limited/theoretical impact).
- **Fix Effort** — `Low` / `Medium` / `High`.
- **Confidence** — `Confirmed` (traced source→sink, exploitable), `Likely` (strong signal, minor assumption), `Needs Review` (lead worth checking, not proven). Never present `Needs Review` as a certainty.

## Step 4 — Finding Record Format

Document each finding as:

- **ID** — `V-01`, `V-02`, …
- **Title** — concise, specific
- **Severity / Fix Effort / Confidence**
- **Location** — `path/to/file.ext:line` (clickable), plus a short quoted code snippet
- **Vector** — how untrusted input reaches the sink, step by step
- **Impact** — concrete attacker gain
- **Proposed Fix** — the exact change, framework-idiomatic and minimal

Fixes must be implementable, never vague.
- Bad: "Sanitize input."
- Good: "Replace the f-string query at `db/users.py:42` with a parameterized query: `cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))`; `user_id` is already an int from the route, so also enforce the type in the handler."

## Step 5 — Propose → Fix on Approval (the gate)

1. Present **all** findings first (worst-first), each with its proposed fix. Do not edit yet.
2. Ask the user how to proceed. Offer sensible batches, e.g. "apply all CRITICAL+HIGH", "apply Low-effort fixes only", "go finding-by-finding", or a specific list of IDs.
3. Apply only the approved fixes with the smallest correct edit. Keep each fix scoped to closing the hole; preserve existing behavior and style.
4. If a fix is risky, ambiguous, or changes an API/contract, flag it and confirm before applying.
5. Track which findings are Fixed, Deferred, or Won't-Fix (with the user's reason).

## Step 6 — Write `SECURITY_AUDIT.md` to the Repo

After the audit (and after fixes, if any were applied), write `SECURITY_AUDIT.md` at the repo root with:

```markdown
# Security Audit — <project name>
_Date: <YYYY-MM-DD> · Auditor: Claude Code (blueteam-defend) · CONFIDENTIAL_

## 1. Scope & Methodology
- Reviewed: <paths/components>
- Stack: <languages/frameworks>
- Trust boundaries & actors: <summary>
- Tools run: <npm audit / pip-audit / tests / linter …>
- Legend: Severity (CRITICAL/HIGH/MEDIUM/LOW) · Confidence (Confirmed/Likely/Needs Review)

## 2. Summary Matrix
| ID | Title | Severity | Fix Effort | Confidence | Status |
| -- | ----- | -------- | ---------- | ---------- | ------ |
| V-01 | … | CRITICAL | Low | Confirmed | Fixed |

## 3. Findings
### V-01 — <title>  `CRITICAL` · Effort: Low · Confidence: Confirmed · Status: Fixed
- **Location:** `src/api/transfer.ts:88`
- **Vector:** …
- **Impact:** …
- **Fix applied / proposed:** … (link the commit/diff if applied)

## 4. Remediation Checklist
- [ ] All CRITICAL/HIGH closed (launch blockers)
- [ ] Dependency CVEs patched
- [ ] Deferred items tracked: <list with reasons>

## 5. Residual Risk & Recommendations
- <anything left open, plus hardening suggestions beyond this pass>
```

Keep the report in sync with what was actually changed — `Status` must reflect reality (Fixed / Proposed / Deferred / Won't-Fix).

## Step 7 — Verify the Fixes

Do not declare success without checking:

- **Re-grep / re-read** each fixed site to confirm the vulnerable pattern is gone and the fix is correct.
- **Run tests / build / linter** if the project has them; report pass/fail honestly. If something breaks, fix it or revert and flag.
- **Re-run the dependency auditor** if you patched dependency CVEs.
- Report verification results plainly. If you could not verify (no tests, no build), say so explicitly rather than implying it works.

## Quality Bar

A complete pass satisfies all of these:

- Every finding has a real `file:line` and quoted code — no abstract claims.
- Every finding has Severity, Fix Effort, and Confidence; `Needs Review` items are not overstated.
- At least 3 distinct layers were examined (or a clear statement of why the codebase is small/narrow).
- **The never-trust lens was applied to every entry point**: each input crossing the network was traced, and for each one the audit identified either the server-side re-check that protects it or its absence as a finding.
- **Every access-control path was checked for fail-open behavior** (errors/missing values must deny, not allow).
- Zero vague fixes — all are concrete, idiomatic, minimal changes.
- No source file edited without user approval.
- Applied fixes were verified (re-checked + tests/build run, or an honest note that verification wasn't possible).
- `SECURITY_AUDIT.md` exists and its statuses match what actually happened.

## Example Triggers

- "do a security audit of my repo"
- "find and fix vulnerabilities in this codebase"
- "is my authentication code safe?"
- "harden this API"
- "scan my project for security bugs and fix them"
- "check this for injection / IDOR / SSRF"
- "secure this before I ship it"

## Appendix — Mapping to OWASP 2025 (label findings with these)

Tag each finding with the relevant category so the report speaks the industry standard:

**OWASP Top 10 : 2025 (Web)**
1. Broken Access Control (incl. SSRF) — Layer 1 / 2
2. Security Misconfiguration — Layer 8
3. Software Supply Chain Failures — Layer 7
4. Cryptographic Failures — Layer 5b
5. Injection — Layer 2
6. Insecure Design — cross-cutting (business logic, Layer 3)
7. Identification & Authentication Failures — Layer 1b
8. Software & Data Integrity Failures — Layer 9
9. Security Logging & Monitoring Failures — Layer 11
10. Mishandling of Exceptional Conditions (fail-open) — Layer 10

**OWASP API Security Top 10 : 2023** — BOLA (API1, ~40% of API attacks), Broken Authentication (API2), BOPLA/mass assignment (API3), Unrestricted Resource Consumption (API4), BFLA (API5), Unrestricted Access to Sensitive Business Flows (API6), SSRF (API7), Security Misconfiguration (API8), Improper Inventory Management (API9), Unsafe Consumption of APIs (API10).

## Relationship to `redteam-attack`

`redteam-attack` is offensive and works on specs, designs, or code it may not be able to edit; it produces a `.docx` attack report. `blueteam-defend` (this skill) is defensive: it works on a codebase it can read and edit, proves findings with file/line evidence, and remediates in place with the user's approval. Use red team to think like an attacker against a design; use blue team to find and fix real holes in shipped code.
