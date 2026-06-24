---
name: api-abuse-detection
description: Detect and prevent abuse of legitimate API functionality at scale — credential stuffing on login, username/email/resource enumeration via differing responses or timing, scraping and bulk data harvesting via sequential IDs, business-logic abuse (coupon/promo/referral/inventory hoarding), free-tier/trial multi-account abuse, OTP/SMS pumping, and scalper/automation bots. Covers detection signals (velocity, fingerprint, anomaly patterns). Use when reviewing login/signup/forgot-password flows, coupon or referral redemption, OTP/email senders, public list/detail endpoints, or anywhere automated clients can abuse working features at volume. CRITICAL: Only flag HIGH/CRITICAL if the abuse causes real loss — account takeover, data exfiltration, or financial loss. Cosmetic or low-value scraping (public, non-sensitive, low-cost) = LOW.
---

# API Abuse Detection — Scale, Enumeration & Business-Logic Abuse

Detect abuse of working API functionality at scale: credential stuffing, enumeration oracles, scraping, coupon/referral/inventory abuse, multi-account trial abuse, OTP pumping, and bots. The endpoints work as designed — the problem is automated abuse at volume.

**Default workflow:** Map abuse-prone endpoints → identify enumeration oracles and per-account gaps → triage by real loss → fix with uniform responses, per-account caps, bot detection, and anomaly monitoring.

## Core Doctrine: Abuse Is a Pattern, Not a Single Request

| Abuse Vector | What Attacker Does | Real Consequence | Severity | Proper Defense |
|---|---|---|---|---|
| Credential stuffing on /login | Replay breach credential lists at high velocity | Account takeover at scale | CRITICAL | Velocity limits + CAPTCHA + breached-password check + bot detection |
| Username/email enumeration | Compare "user not found" vs "wrong password" responses/timing | Valid-account list for targeting/stuffing | HIGH | Uniform generic response + constant-time path |
| Sequential ID enumeration (scraping) | Iterate /items/1, /items/2, /items/3 … | Bulk data exfiltration of full dataset | HIGH (CRITICAL if sensitive/PII) | Opaque/UUID IDs + auth + pagination caps + velocity limit |
| Coupon/promo/referral abuse | Redeem same code many times or self-refer with throwaways | Direct financial loss, margin drain | HIGH | Atomic per-account redemption cap + idempotency + fraud checks |
| Inventory/booking hoarding | Reserve all stock/seats without purchasing | Lost sales, denial of inventory to real users | HIGH | Per-account hold cap + reservation TTL + bot detection |
| Free-tier/trial abuse (multi-account) | Create many accounts to farm free credits | Compute/cost drain, abuse of free resources | MEDIUM (HIGH if costly) | Device fingerprint + email/phone verification + velocity caps |
| OTP/SMS pumping | Trigger OTP/SMS sends in a loop to one or many numbers | Provider bill spike (toll fraud), DoS of channel | HIGH | Per-account/day cap + per-destination throttle + cost guard |
| Scalper/automation bots | Headless browsers buy/grab faster than humans | Resale gouging, brand damage, unfair access | MEDIUM (HIGH if revenue-tied) | Bot detection + proof-of-work/queue + behavioral signals |

## Operating Principles

1. **Uniform responses — no enumeration oracle.** Login, signup, and forgot-password must return the same generic message and same status whether the account exists or not.
2. **Abuse is a pattern, not a single request.** A single login or coupon redemption is fine; 50,000 across one IP/fingerprint in an hour is the attack. Look at velocity, distribution, and aggregates — not one request.
3. **Fingerprint device and bot, not just IP.** IPs rotate cheaply (residential proxies). Combine device fingerprint, TLS/JA3, header order, and behavioral signals to track an actor across IPs.
4. **Enforce business-logic invariants.** "One free trial per person," "one referral bonus per new user," "coupon usable once per account" must be enforced atomically server-side — never assumed from the UI.
5. **Monitor and detect anomalies.** Abuse-prone endpoints need metrics, baselines, and alerts (failed-login spike, redemption spike, OTP-send spike). You cannot stop what you do not measure.
6. **Defense-in-depth: layer rate-limiting + CAPTCHA + bot detection.** No single control stops a determined attacker; raise cost at every layer so abuse becomes uneconomical.
7. **Idempotency and per-account caps.** Mutating/financial actions need idempotency keys and atomic per-account limits so retries and races cannot double-redeem or double-charge.
8. **Always log and alert.** Every abuse-prone action emits a structured event (actor, fingerprint, outcome). Alerts fire on threshold breaches so humans can respond before loss compounds.

## Phase 1: Detection Strategy

**What to look for:**

1. **Credential stuffing**
   - Patterns: /login accepts unlimited attempts; no CAPTCHA after failures; no velocity limit per account/IP/fingerprint; no breached-password check
   - Attack: Replay millions of leaked email:password pairs; valid ones yield account takeover
   - Fix: Per-account + per-IP + per-fingerprint velocity limits, step-up CAPTCHA on failure spikes, bot detection, breached-credential check, alert on global failed-login spike

2. **Enumeration oracles**
   - Patterns: distinct messages ("no such user" vs "incorrect password"), different HTTP status, different response time, different field in JSON, signup "email already taken"
   - Attack: Probe which emails/usernames exist to build a target list for stuffing or phishing
   - Fix: Identical generic response + status for valid/invalid; constant-time code path; same behavior on signup ("if this email is new, we sent a link")

3. **Scraping / bulk data harvesting**
   - Patterns: sequential integer IDs in URLs, public list endpoints with no pagination cap or `limit` honored blindly, GraphQL with no depth/complexity limit, no per-actor velocity ceiling
   - Attack: Iterate IDs or page through everything to clone the dataset (listings, profiles, prices, PII)
   - Fix: Opaque/UUID IDs, auth on detail endpoints, server-enforced max page size, velocity limits, GraphQL cost limits

4. **Business-logic abuse (coupon/referral/inventory)**
   - Patterns: coupon redemption with no per-account counter, referral bonus credited without verifying distinct/real new user, inventory reserved without per-account cap or TTL, non-atomic check-then-act
   - Attack: Redeem one coupon thousands of times, self-refer with throwaway accounts, hoard all stock
   - Fix: Atomic per-account redemption/hold caps, idempotency keys, reservation TTL, fraud/identity checks on bonuses

5. **Multi-account / trial abuse**
   - Patterns: signup with no email/phone verification, no device fingerprint, no velocity cap on account creation, free credits granted on creation
   - Attack: Script thousands of accounts to farm free tier / promo credits
   - Fix: Email/phone verification, device + network fingerprint, account-creation velocity limits, disposable-email/VoIP detection

6. **OTP / notification pumping**
   - Patterns: send-OTP / send-email / resend endpoints with no per-account-per-day cap, no per-destination throttle, no cost ceiling
   - Attack: Loop OTP sends to inflate SMS provider bill (toll/IRSF fraud) or flood a victim's inbox/phone
   - Fix: Per-account/day + per-destination caps, exponential backoff on resend, global cost guard/circuit breaker, alert on send-rate spike

7. **Missing monitoring / anomaly detection**
   - Patterns: no metrics on failed logins, redemptions, sends, or 404-scan rates; no baselines; no alerts
   - Attack: Abuse runs undetected for days; loss only discovered on the invoice or breach report
   - Fix: Per-endpoint counters, rolling baselines, threshold + anomaly alerts, dashboards for abuse-prone flows

## Phase 2: Grep Leads

### JavaScript/Node
Pattern: `(User not found|no such user|email (already )?(taken|exists)|incorrect password)` (enumeration oracle — distinct messages for valid vs invalid)
Pattern: `findById\(req\.params\.id\)|/:id\b` (sequential ID exposure — check if numeric/opaque + authed)
Pattern: `app\.(post|get)\(['"]/(login|signup|register|forgot|reset)` (abuse-prone auth endpoint — check for CAPTCHA/velocity/bot check)
Pattern: `coupon|promo|referral|redeem|voucher` (redemption logic — check per-account cap + idempotency)
Pattern: `(send|resend).*(otp|sms|email|verification)|twilio|sendgrid` (sender — check per-account/day throttle + cost guard)
Pattern: `recaptcha|hcaptcha|turnstile` (presence/absence of CAPTCHA on abuse-prone routes)

### Python
Pattern: `(User not found|does not exist|already registered|wrong password)` (enumeration oracle)
Pattern: `\.get\(id=|/<int:id>|kwargs\[['"]pk['"]\]` (sequential ID — verify opaque + authorized)
Pattern: `def (login|register|signup|forgot_password|reset)` (abuse-prone view — check throttle/CAPTCHA)
Pattern: `coupon|promo|referral|redeem|@transaction\.atomic` (redemption — check atomic per-user cap)
Pattern: `send_otp|send_sms|send_mail|twilio|boto3.*sns` (sender — check per-account/day cap + cost guard)
Pattern: `DjangoRatelimit|@ratelimit|slowapi|Limiter` (rate-limit presence on abuse-prone endpoints)

### Go
Pattern: `mux\.Vars\(r\)\["id"\]|strconv\.Atoi\(.*id` (numeric/sequential ID — verify opaque + authed)
Pattern: `"user not found"|"no such user"|"email already"` (enumeration oracle)
Pattern: `/login|/signup|/register|/forgot|/reset` (abuse-prone route — check velocity + CAPTCHA)
Pattern: `coupon|promo|referral|Redeem|UPDATE .* SET .* WHERE` (redemption — verify atomic per-account cap)
Pattern: `SendOTP|SendSMS|SendEmail|sns\.Publish|twilio` (sender — check per-account/day cap)

### Java/Spring
Pattern: `@PathVariable.*(Long|Integer) id` (numeric/sequential ID — verify opaque + authorized)
Pattern: `"User not found"|"No such user"|"Email already exists"` (enumeration oracle)
Pattern: `@PostMapping\(.*(login|signup|register|forgot|reset)` (abuse-prone endpoint — check CAPTCHA/throttle)
Pattern: `coupon|promo|referral|redeem|@Transactional` (redemption — verify atomic per-account cap)
Pattern: `sendOtp|sendSms|sendEmail|SnsClient|TwilioRestClient` (sender — check per-account/day throttle)
Pattern: `@RateLimiter|Bucket4j|resilience4j` (rate-limit presence on abuse-prone endpoints)

## Phase 3: Triage

| Issue | Causes Real Loss? | Severity | Exploitable? | Fix Effort |
|---|---|---|---|---|
| Credential stuffing possible (no velocity/CAPTCHA) | YES — account takeover | CRITICAL | Yes | Medium |
| Login enumeration (distinct valid/invalid messages) | YES — enables targeted stuffing/phishing | HIGH | Yes | Low |
| Forgot-password enumeration | YES — confirms valid accounts | HIGH | Yes | Low |
| Sequential IDs exposing PII/sensitive data | YES — bulk exfiltration | CRITICAL | Yes | Medium |
| Sequential IDs on public, non-sensitive data | NO — already public | LOW | Cosmetic | Low |
| Coupon redeemable unlimited times per account | YES — direct financial loss | HIGH | Yes | Low |
| Referral bonus farmable with throwaways | YES — financial loss | HIGH | Yes | Medium |
| OTP/SMS send with no cap (toll fraud) | YES — provider bill spike | HIGH | Yes | Low |
| Multi-account free-tier farming (costly resource) | YES — compute/cost drain | HIGH | Yes | Medium |
| Multi-account free-tier farming (cheap resource) | Minor | MEDIUM | Yes | Medium |
| Scalper bots on revenue-tied inventory | YES — lost sales/resale | HIGH | Yes | High |
| Low-value public scraping (no sensitivity/cost) | NO | LOW | Cosmetic | Low |
| No monitoring on abuse-prone endpoints | Indirect — delays detection | MEDIUM | N/A | Medium |

## Phase 4: Ponytail Fix Ladder

1. **Uniform / generic responses (remove the enumeration oracle).**
   - Login, signup, and forgot-password return the same message and status for valid and invalid accounts; close timing side-channels with a constant-time path.
   - Cheapest, highest-leverage fix — kills the targeting list attackers need.

2. **Framework rate-limit + CAPTCHA on abuse-prone endpoints.**
   - Apply per-account + per-IP velocity limits; trigger CAPTCHA (reCAPTCHA/hCaptcha/Turnstile) on failure spikes or first signup.
   - Use the framework/middleware (express-rate-limit, slowapi/django-ratelimit, Bucket4j) — do not hand-roll.

3. **Bot detection / WAF / managed fraud service.**
   - Add a bot-management layer (Cloudflare Bot Management, AWS WAF Bot Control, hCaptcha Enterprise, fraud APIs) for stuffing, scraping, and scalping that rate limits alone cannot stop.
   - Use when attackers rotate IPs via residential proxies and beat naive throttles.

4. **Business-logic invariants & per-account caps + idempotency.**
   - Enforce "once per account / N per day" atomically in the database (unique constraints, atomic counters, `WHERE used_count < limit`); require idempotency keys on financial mutations.
   - Prevents coupon/referral/inventory abuse and race-condition double-redeem.

5. **Device fingerprinting & velocity checks.**
   - Track actors by device + network fingerprint across rotating IPs; gate multi-account and trial abuse with fingerprint + email/phone verification.
   - Needed when the unit of abuse is "the person," not "the request."

6. **Anomaly monitoring + alerting.**
   - Emit per-endpoint metrics (failed logins, redemptions, sends, 404-scan rate), set baselines, and alert on spikes/anomalies; feed a dashboard for abuse-prone flows.
   - Closes the loop so future abuse is caught fast, not on the invoice.

## Phase 5: Record Format

```
ID: ABUSE-001
Title: Username enumeration in POST /api/forgot-password — distinct responses
Severity: HIGH
Location: routes/auth.js:88
Vector: "No account with that email" vs "Reset link sent" reveals valid accounts
Impact: Attacker builds verified-account list for credential stuffing/phishing
Evidence: if (!user) return res.status(404).json({error:'No account with that email'})
Confidence: 95%
Fix: Always return 200 with generic "If that email exists, we sent a link"; constant-time path
```

## Phase 6: Vulnerable → Fixed Examples

### (a) Login / forgot-password enumeration

**Node (Vulnerable):**
```javascript
// DANGER: distinct messages + early return leak account existence (message + timing)
app.post('/login', async (req, res) => {
    const user = await User.findByEmail(req.body.email);
    if (!user) return res.status(404).json({ error: 'No account with that email' });
    if (!await bcrypt.compare(req.body.password, user.hash))
        return res.status(401).json({ error: 'Incorrect password' });
    res.json({ token: issueToken(user) });
});
```

**Node (Fixed):**
```javascript
// GOOD: uniform response + constant-time (always run a compare)
const DUMMY_HASH = '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
app.post('/login', loginRateLimit, async (req, res) => {
    const user = await User.findByEmail(req.body.email);
    const hash = user ? user.hash : DUMMY_HASH;          // avoid timing oracle
    const ok = await bcrypt.compare(req.body.password, hash);
    if (!user || !ok)
        return res.status(401).json({ error: 'Invalid email or password' }); // identical message
    res.json({ token: issueToken(user) });
});
```

**Python (Vulnerable):**
```python
# DANGER: forgot-password confirms whether the email exists
def forgot_password(request):
    user = User.objects.filter(email=request.POST['email']).first()
    if not user:
        return JsonResponse({'error': 'No account with that email'}, status=404)
    send_reset_email(user)
    return JsonResponse({'message': 'Reset link sent'})
```

**Python (Fixed):**
```python
# GOOD: identical response whether or not the account exists; send only if real
@ratelimit(key='ip', rate='5/h')
def forgot_password(request):
    user = User.objects.filter(email=request.POST['email']).first()
    if user:
        send_reset_email(user)               # side effect only for real users
    return JsonResponse(                       # same body + status either way
        {'message': 'If that email exists, we sent a reset link'}, status=200)
```

### (b) Sequential ID scraping (Go)

**Go (Vulnerable):**
```go
// DANGER: sequential int IDs + no auth/velocity → iterate 1..N to scrape everything
func GetListing(w http.ResponseWriter, r *http.Request) {
    id, _ := strconv.Atoi(mux.Vars(r)["id"])     // /listings/1, /listings/2, ...
    listing := db.GetListing(id)
    json.NewEncoder(w).Encode(listing)            // includes seller PII
}
```

**Go (Fixed):**
```go
// GOOD: opaque UUID + auth + server-enforced pagination cap on the list endpoint
func GetListing(w http.ResponseWriter, r *http.Request) {
    userID := r.Context().Value("user_id")
    if userID == nil { http.Error(w, "Unauthorized", http.StatusUnauthorized); return }
    id := mux.Vars(r)["id"]                       // UUID, not guessable/sequential
    listing := db.GetListingByUUID(id)
    if listing == nil { http.Error(w, "Not found", http.StatusNotFound); return }
    json.NewEncoder(w).Encode(listing.Public())   // strip PII from response
}

func ListListings(w http.ResponseWriter, r *http.Request) {
    limit := clamp(atoiDefault(r.URL.Query().Get("limit"), 20), 1, 50) // cap page size
    json.NewEncoder(w).Encode(db.ListListings(limit, cursor(r)))       // cursor, no full dump
}
```

### (c) Coupon redemption without per-user cap

**Node (Vulnerable):**
```javascript
// DANGER: check-then-act race + no per-account cap → redeem one coupon many times
app.post('/redeem', requireAuth, async (req, res) => {
    const coupon = await Coupon.find(req.body.code);
    if (!coupon || coupon.used >= coupon.max) return res.status(400).json({ error: 'Invalid' });
    await Coupon.increment(coupon.id);           // race: many concurrent passes
    await Credit.add(req.user.id, coupon.value); // same user can loop this
    res.json({ ok: true });
});
```

**Node (Fixed):**
```javascript
// GOOD: atomic per-account uniqueness + atomic global counter + idempotency
app.post('/redeem', requireAuth, async (req, res) => {
    try {
        await db.tx(async t => {
            // unique(user_id, coupon_code) → one redemption per account, enforced by DB
            await t.insert('redemptions', { user_id: req.user.id, coupon_code: req.body.code });
            // atomic decrement; affects 0 rows when exhausted
            const n = await t.run(
                'UPDATE coupons SET used = used + 1 WHERE code = $1 AND used < max', [req.body.code]);
            if (n.rowCount === 0) throw new Error('exhausted');
            await t.run('UPDATE credits SET bal = bal + value FROM coupons ' +
                        'WHERE credits.user_id = $1 AND coupons.code = $2', [req.user.id, req.body.code]);
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: 'Coupon not available' }); // generic, no oracle
    }
});
```

### (d) OTP endpoint abuse

**Python (Vulnerable):**
```python
# DANGER: unlimited sends → SMS toll fraud + victim flooding
def send_otp(request):
    phone = request.POST['phone']
    code = generate_code()
    cache.set(f'otp:{phone}', code, 300)
    sms.send(phone, f'Your code is {code}')      # billable, no cap, no cost guard
    return JsonResponse({'sent': True})
```

**Python (Fixed):**
```python
# GOOD: per-account/day cap + per-destination throttle + global cost circuit breaker
def send_otp(request):
    user_id, phone = request.user.id, normalize(request.POST['phone'])
    if cache.incr(f'otp:day:{user_id}') > 5:                 # per-account/day cap
        return JsonResponse({'error': 'Too many requests'}, status=429)
    if not cache.add(f'otp:cooldown:{phone}', 1, 60):       # per-destination throttle
        return JsonResponse({'error': 'Please wait before retrying'}, status=429)
    if global_sms_counter.over_budget():                    # cost circuit breaker
        alert('SMS spend spike — possible pumping'); return JsonResponse({'error': 'Unavailable'}, status=503)
    code = generate_code()
    cache.set(f'otp:{phone}', code, 300)
    sms.send(phone, f'Your code is {code}')
    return JsonResponse({'sent': True})
```

## Phase 7: Verification Checklist

- [ ] Login returns identical message + status for "unknown email" and "wrong password"
- [ ] Forgot-password and signup do not reveal whether an email/username exists
- [ ] Response timing is constant for valid vs invalid accounts (dummy compare on miss)
- [ ] Resource IDs are opaque/UUID, not sequential integers, on sensitive endpoints
- [ ] List endpoints enforce a server-side max page size; no full-dataset dump
- [ ] CAPTCHA / bot check present on login, signup, and other abuse-prone endpoints
- [ ] Per-account velocity limits on login/signup/redeem/send (not IP-only)
- [ ] Coupon/referral redemption enforces an atomic per-account cap (DB constraint, not check-then-act)
- [ ] Financial/mutating actions accept idempotency keys; no double-redeem under concurrency
- [ ] OTP/SMS/email senders enforce per-account/day + per-destination caps and a cost guard
- [ ] Account creation gated by email/phone verification + device/network fingerprint
- [ ] Metrics + alerts exist for failed-login, redemption, send, and 404-scan spikes
- [ ] Tested: scripting valid:invalid pairs, ID iteration, repeated redemption, and OTP loops are all blocked

## Quality Bar

1. No enumeration oracle: valid vs invalid accounts are indistinguishable by message, status, or timing
2. Credential stuffing is throttled by per-account + per-IP + per-fingerprint velocity and CAPTCHA
3. Sensitive resources use opaque IDs and require authorization; no sequential-ID scraping
4. List/detail endpoints cap page size and velocity; bulk harvesting is uneconomical
5. Coupon/referral/inventory invariants enforced atomically with per-account caps + idempotency
6. Multi-account/trial abuse gated by verification + device fingerprint, not just IP
7. OTP/notification senders have per-account/day + per-destination caps and a cost circuit breaker
8. Bot/automation defense exists where rate-limiting alone is insufficient (stuffing, scraping, scalping)
9. Abuse-prone endpoints emit metrics and fire alerts on anomalies
10. Severity reflects real loss: account takeover / exfiltration / financial = HIGH/CRITICAL; low-value public scraping = LOW

## Example Triggers

- "API abuse"
- "credential stuffing"
- "account enumeration"
- "scraping protection"
- "bot detection"
- "business logic abuse"
- "coupon abuse"
- "trial abuse"

## Relationship to blueteam-defend

Extends **blueteam-defend** with an abuse-at-scale lens: these endpoints work as designed, but legitimate functionality is abused at volume. Cross-reference **rate-limiting-audit** for raw request throttling (this skill assumes throttling exists and focuses on the abuse patterns it must counter) and **access-control-auditing** for authorization/IDOR (this skill assumes authz is correct and focuses on enumeration, scraping, and business-logic abuse). Core doctrine: abuse is a pattern, not a single request; only flag HIGH/CRITICAL when the abuse causes real account, data, or financial loss.
