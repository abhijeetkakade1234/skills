---
name: api-rate-limiting
description: >
  Audit API-platform rate limiting: per-API-key quotas and tiered plans (free/pro/enterprise), monetary/cost protection on metered downstream calls (third-party APIs, LLM tokens, egress, compute), standard quota headers (X-RateLimit-*, RateLimit-* draft, Retry-After), distributed enforcement across instances/regions (Redis/gateway), edge/gateway throttling (Kong, AWS API Gateway, Cloudflare, Apigee), graceful 429 + backoff contracts, and GraphQL query-cost/complexity limiting. Use when user says "API rate limiting", "API quota", "per-key throttling", "API gateway limits", "billing protection", "GraphQL cost limit", "usage plan", "tiered API limits". Distinct from rate-limiting-audit (which covers auth brute-force: login/OTP/password-reset/DoS) — cross-reference it for auth endpoints; this skill is the API-platform quota/cost/gateway deep-dive. Ponytail: gateway usage plans first → distributed per-key limiter → tier config + headers → GraphQL cost limit → cost budget guards → custom GCRA last.
---

# API Rate Limiting — Per-Key Quotas, Cost Protection & Platform Throttling

Operate as an API-platform rate-limiting engineer. The threat here is not a password-guessing attacker — it is a single API client (or tier) consuming shared capacity, running up a metered third-party/LLM bill, or amplifying a GraphQL query into thousands of resolvers. A limiter keyed on IP instead of API key, held in process memory, or with no per-tier quota lets one consumer starve every other and turn your downstream cost into an open tap.

**Default workflow: map API surface + tiers + metered downstreams → detect missing per-key quotas / cost guards / mis-scoped limiters → triage by cost & quota impact → propose gateway-first per-key limits → apply on approval → verify enforcement, headers, and fail-closed behavior.**

> **Scope split:** For login / OTP / password-reset brute-force and DoS throttling, use **rate-limiting-audit**. This skill covers the API *platform*: quotas, plans, billing/cost protection, gateway/edge limiting, quota headers, distributed enforcement, and GraphQL cost limiting. The two are complementary — cross-reference for auth routes; do not re-cover login brute-force here.

## Core Doctrine — Quota & Cost Protection Per Key

| Gap | What Happens | Real Consequence | Severity | Proper Fix |
| --- | --- | --- | --- | --- |
| No per-API-key quota | One client floods the API; limit (if any) is global/per-IP | Noisy-neighbor starves every other tenant; SLA breach | HIGH | Key limiter on API key/client ID, not IP; per-key bucket |
| Unbounded metered third-party / LLM cost | Each call fans out to a paid API (OpenAI tokens, SMS, maps, egress) with no budget cap | Runaway bill — $1,000s/hour; one key drains the spend cap | CRITICAL | Per-key cost budget + hard stop before the metered call |
| Missing quota response headers | No `RateLimit-*` / `Retry-After` emitted | Clients can't self-throttle; hammer blindly into 429s | MEDIUM | Emit `RateLimit-Limit/Remaining/Reset` + `Retry-After` |
| In-memory limiter across instances | Counter lives in one process; app is autoscaled | Attacker gets limit × instance-count; counts reset on deploy | HIGH | Shared store (Redis) or enforce at gateway/edge |
| No GraphQL query-cost limit | Count-based limit only; deeply nested/aliased query allowed | One request → thousands of resolvers; DB/compute DoS | HIGH | Cost/complexity + depth analysis, reject over budget |
| No burst control | Quota allows N/min but unlimited instantaneous spikes | Thundering-herd bursts saturate backend between windows | MEDIUM | Token bucket / GCRA: average rate + bounded burst |
| Free-tier unlimited | Free plan has no quota; paid tiers metered | Cost runaway from free abuse; no upgrade incentive | HIGH | Strict free-tier quota; tier-aware limits enforced |
| No 429 / Retry-After contract | 429 returned with no backoff guidance, or 500 instead | Clients retry instantly, worsening overload (retry storm) | MEDIUM | Documented 429 + `Retry-After` + client backoff contract |

## Operating Principles

1. **Key on identity, scope by tier.** The unit of fairness is the **API key / client ID**, not the IP. Each key gets a quota that depends on its **plan tier** (free/pro/enterprise). Per-IP limiting is for anonymous abuse (see rate-limiting-audit); per-key limiting is for fair-use and billing.
2. **Protect money, not just CPU.** Any route that triggers a *metered* downstream — LLM tokens, SMS/email, third-party API credits, egress bytes, GPU/compute minutes — needs a **cost budget**, not only a request count. 100 cheap requests and 100 expensive LLM calls are not the same risk.
3. **Emit standard quota headers.** Surface `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (IETF draft `ratelimit-headers`), and/or the legacy `X-RateLimit-*`, plus `Retry-After` on 429. Headers let well-behaved clients pace themselves and stay under quota.
4. **Use a distributed shared store.** Per-key counts must be consistent across instances and regions. Back the limiter with **Redis** (or the gateway's own store) so a load-balanced/serverless fleet enforces one quota — not N copies of it.
5. **Pick the algorithm deliberately.** **Fixed window** is simple but allows double-burst at the boundary; **sliding window** smooths that; **token bucket / GCRA** gives an average rate with a bounded burst (best for fair-use APIs). `rate-limiter-flexible`, Bucket4j, and Kong all offer these — choose burst-aware for platform quotas.
6. **Enforce at the gateway/edge first.** Throttle where traffic enters — Kong, AWS API Gateway usage plans, Cloudflare, Apigee — so abuse is rejected before it consumes app/DB/downstream capacity. App-level limiting is the second line, not the first.
7. **GraphQL needs cost-based, not count-based, limits.** A single GraphQL request can fan out arbitrarily via nesting, aliases, and fragments. Count limiting is useless; you need **query cost/complexity analysis** and **depth limiting** that reject expensive queries before execution.
8. **Fail closed on store outage for paid/metered routes.** If Redis/the quota store is down, an open-fail limiter lets a metered/LLM route run unbounded — directly converting an outage into a bill. For cost-bearing or paid-tier routes, **fail closed** (reject or degrade to a strict local cap). Best-effort read quotas may fail open — decide deliberately.

## Phase 1 — Detection Strategy

Map the API surface, the plan tiers, and every metered downstream; then check each category:

1. **No per-API-key quota (global or IP-keyed only).**
   - *Patterns:* a single `app.use(limiter)` or per-IP `keyGenerator`/`key_func` with no API-key dimension; no `plan`/`tier` lookup feeding the limit.
   - *Attack:* one client (or one IP behind many keys, or one key behind many IPs) consumes the whole budget; tenants starve each other.
   - *Fix:* derive the key from the authenticated API key/client ID; size the limit from the caller's tier.

2. **Cost-unbounded proxied / metered calls.**
   - *Patterns:* handler calls OpenAI/Anthropic, Twilio, a maps/geocode API, S3 egress, or a GPU job with only (or no) request-count limiting; no token/cost accounting before the call.
   - *Attack:* a key issues expensive calls (large LLM completions, bulk SMS) until the spend cap or credit pool is drained.
   - *Fix:* per-key **cost budget** (tokens/$/units) consumed *before* the downstream call; hard-stop at 0 with a clear 429/402.

3. **In-memory-only limiter in a scaled deployment.**
   - *Patterns:* `RateLimiterMemory`, default `express-rate-limit` MemoryStore, Flask-Limiter default (`memory://`), `golang.org/x/time/rate`, a local Bucket4j `Bucket` — with >1 instance / serverless.
   - *Attack:* quota multiplied by instance count; counts reset on every deploy/scale event.
   - *Fix:* Redis-backed store, or push enforcement to the gateway/edge (shared by construction).

4. **Missing standard quota headers.**
   - *Patterns:* no `standardHeaders`/`RateLimit-*` config; 429 returned without `Retry-After`; only custom undocumented headers.
   - *Attack:* not an attack per se, but clients can't pace → retry storms and avoidable 429s degrade the platform.
   - *Fix:* enable standard headers (`RateLimit-Limit/Remaining/Reset`, legacy `X-RateLimit-*`) and always set `Retry-After` on 429.

5. **GraphQL / batch cost not limited.**
   - *Patterns:* a GraphQL endpoint with only a request-count limit; no `costAnalysis`/`depthLimit`/complexity plugin; REST batch endpoints (`POST /batch`, JSON-RPC arrays) that fan out per element with no element cap.
   - *Attack:* a deeply nested or alias-batched query amplifies one request into thousands of resolver/DB calls (compute DoS, bill spike).
   - *Fix:* query cost/complexity + depth limiting; cap batch array length; bill batch elements against the per-key quota individually.

6. **Tier enforcement gaps.**
   - *Patterns:* free tier with no quota; tier stored but never read by the limiter; downgrade/upgrade not reflected at runtime; the same limit for all plans.
   - *Attack:* free-tier abuse drives cost; a downgraded key keeps enterprise limits.
   - *Fix:* limit and cost budget parameterized by the caller's current plan, resolved per request; strict free-tier cap.

7. **No client backoff / 429 contract.**
   - *Patterns:* overload returns 500 instead of 429; 429 with no `Retry-After`; no documented client retry/backoff guidance; no jitter recommended.
   - *Attack:* clients retry immediately and in lockstep, amplifying overload (retry storm / thundering herd).
   - *Fix:* documented 429 + `Retry-After`, exponential backoff **with jitter** contract for SDK/clients; idempotency for safe retries.

## Phase 2 — Grep Leads

Look for limiters keyed on IP instead of API key, memory stores in scaled apps, metered downstream calls with no budget, and gateways/GraphQL with no quota config.

### JavaScript / Node (express-rate-limit, rate-limiter-flexible)
Pattern: `keyGenerator:\s*\(req\)\s*=>\s*req\.ip` (BAD for platform quota — keyed on IP, should be API key/client ID)
Pattern: `keyGenerator:.*req\.(apiKey|headers\['x-api-key'\]|user\.keyId)` (GOOD — per-key)
Pattern: `new RateLimiterMemory\(|new MemoryStore\(` (in-memory — won't scale; needs Redis or gateway)
Pattern: `new RateLimiterRedis\(|store:\s*new RedisStore` (GOOD — distributed store)
Pattern: `standardHeaders:\s*true|legacyHeaders` (quota headers — confirm enabled)
Lead: an `openai`/`anthropic`/`twilio` SDK call inside a handler with **no** preceding `points`/budget consume → unbounded cost.

### Python (Flask-Limiter, DRF throttling)
Pattern: `key_func\s*=\s*get_remote_address` (IP-keyed — for platform quota use an API-key key_func instead)
Pattern: `def\s+\w+\(.*\):\s*return\s+request\.headers\.get\(['"]X-API-Key` (custom key_func by API key — GOOD)
Pattern: `Limiter\(.*storage_uri=['"]memory://|Limiter\([^)]*\)\s*$` (memory storage — needs `redis://`)
Pattern: `storage_uri=['"]redis://` (GOOD — distributed)
Pattern: `class\s+\w+Throttle\(.*ScopedRateThrottle|throttle_scope\s*=` (DRF scoped throttle — check scope is per-key/plan, rates in `DEFAULT_THROTTLE_RATES`)
Lead: `openai.ChatCompletion`/`anthropic.messages.create`/`boto3` egress in a view with no per-key cost accounting.

### Go (ulule/limiter, tollbooth, redis store)
Pattern: `tollbooth\.NewLimiter\(.*\)` then `SetIPLookups` (tollbooth defaults to IP — for API quota key on the API-key header)
Pattern: `limiter\.New\(store,\s*rate\)` with `memory\.NewStore\(` (ulule memory store — won't scale; use redis)
Pattern: `sredis\.NewStore\(|redis\.NewStore\(` (GOOD — ulule/limiter Redis store, shared across instances)
Pattern: `rate\.NewLimiter\(` (x/time/rate — per-process only; not a platform quota store)
Lead: a third-party/HTTP client call (`http.Post` to a paid API) in a handler with no per-key budget check.

### Java / Spring (Bucket4j, distributed)
Pattern: `Bucket4j\.builder\(\)|Bandwidth\.classic\(|Bandwidth\.simple\(` (Bucket4j — local unless backed by a proxyManager)
Pattern: `new Bucket\(|Bucket\.builder\(\)\.build\(\)` (a local in-JVM bucket — won't share across nodes)
Pattern: `LettuceBasedProxyManager|RedisProxyManager|Hazelcast.*proxyManager|JCacheProxyManager` (GOOD — distributed Bucket4j)
Pattern: `Bandwidth.*Refill\.greedy|Refill\.intervally` (refill strategy — `greedy` allows burst, `intervally` smooths)
Lead: a `RestTemplate`/`WebClient` call to a metered API with the bucket sized by request count, not cost.

### API gateway / edge config
Pattern: `rate-limiting|rate-limiting-advanced` in Kong declarative config (`kong.yml`) — check `policy: redis` (cluster) and `limit_by: consumer` (per-key, not `ip`)
Pattern: `UsagePlan|ApiKey|ThrottleSettings|QuotaSettings` (AWS API Gateway usage plans — check `RateLimit`/`BurstLimit`/`Quota` set, keys associated)
Pattern: `ratelimit|rate_limit` rules in Cloudflare/Terraform (`cloudflare_ruleset`) — check `characteristics`/`counting_expression` keyed on API token, not just IP
Pattern: `SpikeArrest|Quota` policy in Apigee proxy XML (`<Quota>`, `<SpikeArrest>`) — check `<Identifier ref="...apikey">`
Lead: a gateway in front of the API with **no** rate-limiting/usage-plan policy attached to the route.

### GraphQL (cost analysis / depth limiting)
Pattern: `graphql-cost-analysis|graphql-query-complexity|costAnalysis\(` (GOOD — cost limiting present)
Pattern: `graphql-depth-limit|depthLimit\(` (GOOD — depth cap)
Pattern: `validationRules:\s*\[` without a cost/depth rule (GraphQL server with no complexity guard — BAD)
Pattern: `ApolloServer\(\{[^}]*\}\)` with no `validationRules`/plugins for cost (check for unbounded queries)
Lead: a GraphQL endpoint behind only a per-request count limiter — count limiting does not bound query cost.

## Phase 3 — Triage

| Issue | Cost/Quota impact? | Severity | Exploitable? | Fix Effort |
| --- | --- | --- | --- | --- |
| Metered LLM/3rd-party call, no per-key budget | Direct $ runaway | CRITICAL | Yes — drain spend cap with one key | Medium |
| No per-API-key quota (global/IP only) | Shared capacity starved | HIGH | Yes — noisy neighbor / tenant starvation | Medium |
| Free tier unlimited | Cost runaway from free abuse | HIGH | Yes — abuse free plan at your expense | Low–Medium |
| In-memory limiter, scaled app | Quota × instance-count | HIGH | Yes — bypass via load distribution | Medium (Redis/gateway) |
| GraphQL no cost/depth limit | Compute/DB DoS + bill | HIGH | Yes — nested/aliased query amplification | Medium |
| Tier stored but not enforced at runtime | Downgraded key keeps high limit | MEDIUM | Yes — over-consume after downgrade | Low |
| No burst control (window only) | Spiky backend saturation | MEDIUM | Partial — boundary double-burst | Low |
| Missing `RateLimit-*` / `Retry-After` | Retry storms, poor DX | MEDIUM | Partial — clients can't pace | Low |
| 429 returned as 500, no backoff contract | Retry-storm amplification | MEDIUM | Partial | Low |
| Per-key quota, Redis, tier-aware, headers, fail-closed | — | LOW | No | N/A (already safe) |

## Phase 4 — Ponytail Fix Ladder

1. **API gateway / edge usage plans first.** Push quota to where traffic enters: **AWS API Gateway usage plans** (rate + burst + quota per API key), **Kong** `rate-limiting`/`rate-limiting-advanced` (`limit_by: consumer`, `policy: redis`), **Cloudflare** rate-limiting rules, **Apigee** Quota/SpikeArrest. Abuse is rejected before it reaches your app or downstreams. Best first line for platform limiting.
2. **Distributed (Redis) per-key limiter middleware.** When you must limit in-app (logic the gateway can't see), use a framework limiter **keyed on the API key/client ID** and backed by Redis: `rate-limiter-flexible` `RateLimiterRedis`, Flask-Limiter `storage_uri=redis://`, ulule/limiter redis store, Bucket4j + Lettuce/Hazelcast proxyManager. Shared count across instances/regions.
3. **Per-tier quota config + standard headers.** Parameterize the limit and cost budget by the caller's **plan** (free/pro/enterprise), resolved per request. Emit `RateLimit-Limit/Remaining/Reset` and `Retry-After` so clients self-throttle. Strict cap on free tier.
4. **GraphQL query-cost / depth limiting.** Add `graphql-cost-analysis`/`graphql-query-complexity` + `graphql-depth-limit` as validation rules; reject queries over the per-tier cost/depth budget before execution. Cap REST batch array length too.
5. **Cost budget guards on metered downstream calls.** For LLM/SMS/3rd-party/egress routes, consume a per-key **cost budget** (estimated tokens/units/$) *before* the call; hard-stop at 0 with 429/402. Reconcile with actual usage after the call. Fail closed on budget-store outage.
6. **Custom GCRA / token bucket (last resort).** Only when no library/gateway fits (exotic cost accounting, multi-dimensional quotas). Implement GCRA or a token bucket against the shared store with explicit per-key+tier key, bounded burst, and `Retry-After`. Most error-prone — avoid unless necessary.

## Phase 5 — Record Format

```
ID: APIRL-001
Title: LLM proxy route has no per-key cost budget — unbounded spend
Severity: CRITICAL
Fix Effort: Medium
Confidence: 90%
Location: routes/ai.js:58
Vector: A single API key POSTs /v1/complete repeatedly with large max_tokens; each call hits OpenAI with no budget gate
Impact: Runaway third-party bill; one key drains the org spend cap in minutes
Evidence: openai.chat.completions.create(...) with only a 100/min request count limit; no token/cost accounting
Quota/Cost concern: needs per-key token budget keyed on API key, sized by plan tier, Redis-backed, fail-closed on store outage
Proposed Fix: Consume estimated tokens from a per-key Redis budget before the call; hard-stop at 0 → 429 + Retry-After; reconcile actual usage after
```

## Phase 6 — Vulnerable → Fixed Examples

Starting quota points (tune to plan economics):

- Free tier: 60 req/min, 10k req/day, no metered-LLM access (or tiny token budget)
- Pro tier: 600 req/min burst 1000, per-key token/cost budget
- Enterprise: negotiated rate + burst, dedicated quota, higher cost budget
- GraphQL: per-tier query-cost budget (e.g. 1000 cost units/request) + depth ≤ 10
- Batch endpoints: cap array length (e.g. ≤ 100) and bill each element

Ask the user: Limit at the gateway, in-app, or both? Single instance or scaled (decides store)? Which routes hit metered downstreams (decides cost budgets)? Fail-open or fail-closed on store outage per route?

### (a) Limiter keyed on IP → keyed on API key + per-tier limit (Node)

**Vulnerable — express-rate-limit, IP-keyed, one global limit:**
```javascript
// DANGER: keyed on IP, same limit for every plan, in-memory
const limiter = rateLimit({ windowMs: 60_000, limit: 600 }); // default MemoryStore, default key = req.ip
app.use('/v1', limiter); // one client behind one IP gets the whole budget; tiers ignored
```

**Fixed — rate-limiter-flexible + Redis, per-API-key, per-tier:**
```javascript
const { RateLimiterRedis } = require('rate-limiter-flexible');

const limiters = {                       // one shared Redis-backed limiter per tier
  free: new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl_free', points: 60, duration: 60 }),
  pro:  new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl_pro',  points: 600, duration: 60 }),
  ent:  new RateLimiterRedis({ storeClient: redis, keyPrefix: 'rl_ent',  points: 6000, duration: 60 }),
};

app.use('/v1', async (req, res, next) => {
  const { apiKeyId, plan } = req.auth;            // resolved from the authenticated API key
  const limiter = limiters[plan] || limiters.free;
  try {
    const r = await limiter.consume(apiKeyId, 1); // key on the API key, NOT the IP
    res.set('RateLimit-Limit', limiter.points)
       .set('RateLimit-Remaining', r.remainingPoints)
       .set('RateLimit-Reset', Math.ceil(r.msBeforeNext / 1000));
    next();
  } catch (r) {
    res.set('Retry-After', Math.ceil(r.msBeforeNext / 1000))
       .status(429).json({ error: 'Quota exceeded for plan ' + plan });
  }
});
```

### (b) In-memory limiter → Redis-backed distributed (Python)

**Vulnerable — Flask-Limiter, memory storage, IP key:**
```python
# DANGER: memory:// resets per process and per deploy; keyed on IP
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
limiter = Limiter(get_remote_address, app=app)            # default storage = memory://
@app.route('/v1/search')
@limiter.limit("600/minute")                              # 600 PER INSTANCE in a scaled app
def search(): ...
```

**Fixed — Redis storage, key by API key, per-tier rate:**
```python
from flask_limiter import Limiter

def api_key_id():
    return request.headers.get("X-API-Key", "anon")       # quota unit = API key, not IP

def tier_rate():                                          # dynamic limit from the caller's plan
    plan = current_key_plan()                             # look up plan for this API key
    return {"free": "60/minute", "pro": "600/minute", "enterprise": "6000/minute"}[plan]

limiter = Limiter(api_key_id, app=app,
                  storage_uri="redis://localhost:6379")   # shared across instances/regions

@app.route('/v1/search')
@limiter.limit(tier_rate)                                 # 429 + Retry-After emitted automatically
def search(): ...
```

**Fixed — Go (ulule/limiter, Redis store, API-key key):**
```go
import (
    limiter "github.com/ulule/limiter/v3"
    sredis "github.com/ulule/limiter/v3/drivers/store/redis"
)

store, _ := sredis.NewStore(redisClient)                 // shared across instances
func quotaMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        key := r.Header.Get("X-API-Key")                 // key on the API key, not RemoteAddr
        rate := planRate(r)                              // limiter.Rate sized by the caller's tier
        ctx, _ := limiter.New(store, rate).Get(r.Context(), key)
        w.Header().Set("RateLimit-Limit", strconv.FormatInt(ctx.Limit, 10))
        w.Header().Set("RateLimit-Remaining", strconv.FormatInt(ctx.Remaining, 10))
        if ctx.Reached {
            w.Header().Set("Retry-After", strconv.FormatInt(ctx.Reset-time.Now().Unix(), 10))
            http.Error(w, "Quota exceeded", http.StatusTooManyRequests)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### (c) Missing quota headers → emit standard RateLimit headers + Retry-After

**Vulnerable:**
```javascript
// DANGER: 429 with no guidance — client retries instantly into a retry storm
if (overQuota) return res.status(429).send('Too Many Requests');
```

**Fixed:**
```javascript
// IETF draft RateLimit-* + legacy X-RateLimit-* + Retry-After on every limited response
res.set({
  'RateLimit-Limit':     String(limit),
  'RateLimit-Remaining': String(remaining),
  'RateLimit-Reset':     String(resetSeconds),     // seconds until the window resets
  'X-RateLimit-Limit':   String(limit),            // legacy compatibility for older clients
  'X-RateLimit-Remaining': String(remaining),
});
if (overQuota) {
  return res.set('Retry-After', String(resetSeconds))   // tells the client exactly when to retry
            .status(429)
            .json({ error: 'rate_limited', retry_after: resetSeconds });
}
```

### (d) Unbounded GraphQL → cost / depth limit

**Vulnerable — Apollo with no complexity guard:**
```javascript
// DANGER: a deeply nested / alias-batched query amplifies into thousands of resolvers
const server = new ApolloServer({ typeDefs, resolvers }); // no validation rules
```

**Fixed — depth + cost analysis as validation rules:**
```javascript
const depthLimit = require('graphql-depth-limit');
const costAnalysis = require('graphql-cost-analysis').default;

const server = new ApolloServer({
  typeDefs, resolvers,
  validationRules: [
    depthLimit(10),                                 // reject queries nested deeper than 10
    costAnalysis({
      maximumCost: 1000,                            // per-request cost budget (tune per tier)
      defaultCost: 1,
      // costMap / @cost directives weight expensive fields (lists, joins) higher
    }),
  ],
});
// Over-budget queries are rejected before execution → no resolver/DB amplification.
```

### (e) Gateway usage plan / Kong plugin config

**AWS API Gateway — usage plan with per-key rate, burst, and quota:**
```yaml
# Throttle = steady rate + burst bucket; Quota = hard cap per period. Bound to an API key.
UsagePlanPro:
  Type: AWS::ApiGateway::UsagePlan
  Properties:
    UsagePlanName: pro
    Throttle: { RateLimit: 600, BurstLimit: 1000 }      # req/sec average + burst
    Quota:    { Limit: 1000000, Period: MONTH }         # hard monthly cap per key
ProKeyLink:
  Type: AWS::ApiGateway::UsagePlanKey
  Properties: { KeyId: !Ref ProApiKey, KeyType: API_KEY, UsagePlanId: !Ref UsagePlanPro }
```

**Kong — rate-limiting-advanced, per-consumer, Redis (cluster-shared):**
```yaml
# limit_by: consumer keys the quota on the API consumer (the key), not the IP.
plugins:
  - name: rate-limiting-advanced
    config:
      limit:        [600]
      window_size:  [60]
      identifier:   consumer        # per-API-key, not per-IP
      strategy:     redis           # shared across the Kong cluster
      redis: { host: redis, port: 6379 }
      retry_after_jitter_max: 5     # adds jitter to Retry-After to avoid synchronized retries
```

## Phase 7 — Verification Checklist

- [ ] Quota is enforced **per API key / client ID**, not per IP or globally.
- [ ] Limit and cost budget are sized by the caller's **plan tier**; free tier has a strict cap (not unlimited).
- [ ] Limiter works **across instances/regions**: hit two instances behind the LB and confirm one shared count (not N×).
- [ ] Limiter survives restart/deploy (count not reset) — confirms an external store or gateway enforcement.
- [ ] Standard quota headers present: `RateLimit-Limit/Remaining/Reset` (and/or `X-RateLimit-*`).
- [ ] `429 Too Many Requests` (not 500) is returned on quota exhaustion, with `Retry-After`.
- [ ] Metered downstream routes (LLM/SMS/3rd-party/egress) consume a **per-key cost budget** before the call and hard-stop at 0.
- [ ] GraphQL endpoint has **cost/complexity + depth** limiting; an over-budget nested/aliased query is rejected before execution.
- [ ] REST batch endpoints cap array length and bill each element against the quota.
- [ ] Burst is bounded (token bucket / GCRA or burst limit), not just a per-window count.
- [ ] **Fail-closed** on store/budget outage for paid/metered routes; fail-open choices are deliberate and documented.
- [ ] Tier changes (upgrade/downgrade) are reflected at runtime; a downgraded key loses the higher limit immediately.
- [ ] Client **backoff contract** is documented: exponential backoff **with jitter**, honor `Retry-After`, idempotency for safe retries.
- [ ] Gateway/edge enforcement is the first line where a gateway exists; in-app limiting is the second.

## Quality Bar

1. Real `file:line` (or config path) evidence for every finding.
2. Severity, Fix Effort, and Confidence rated per finding.
3. Quota keyed on the **API key/client ID**, sized by **plan tier** — not IP, not global.
4. Metered/cost-bearing routes assessed for a per-key **cost budget**, not just request count.
5. Store correctness assessed for the real topology (in-memory vs Redis/gateway; multi-instance/region).
6. Standard quota headers (`RateLimit-*` / `X-RateLimit-*`) and `Retry-After` confirmed in the fix.
7. GraphQL/batch amplification explicitly checked with cost/depth limiting (not count-based).
8. Algorithm choice justified (fixed/sliding window vs token bucket/GCRA) for burst behavior.
9. Fail-open vs fail-closed decided per route; paid/metered routes fail closed.
10. Fixes concrete, library/gateway-appropriate, implementable; applied fixes verified; no blocking of legitimate paying clients.

## Example Triggers

- "API rate limiting"
- "API quota"
- "per-key throttling"
- "API gateway limits"
- "billing protection"
- "GraphQL cost limit"
- "usage plan"
- "tiered API limits"

## Relationship to blueteam-defend

Extends **blueteam-defend Layer 6 (DoS & Resource Limits)** on the API-platform axis. blueteam-defend covers the full layer (timeouts, payload caps, connection limits, resource quotas); this skill is the deep-dive on **API quota, cost protection, gateway/edge limiting, standard headers, distributed per-key enforcement, and GraphQL cost limiting**, with per-language and per-gateway fixes and verification.

## Relationship to rate-limiting-audit

These two split the rate-limiting domain by threat model — run both for full coverage:

- **rate-limiting-audit** owns **authentication & abuse throttling**: login/credential-stuffing brute-force, OTP/2FA cracking, password-reset spam, signup-bot floods, and blunt DoS. Its unit is the **IP and/or account**; its goal is stopping attackers, with CAPTCHA/backoff and spoofable-header (`X-Forwarded-For`) pitfalls.
- **api-rate-limiting** (this skill) owns the **API platform**: per-API-key quotas, plan tiers, billing/cost protection on metered downstreams, gateway/edge usage plans, standard quota headers, distributed enforcement, and GraphQL query-cost limiting. Its unit is the **API key/tier**; its goal is fair-use and cost control among legitimate consumers.

When auditing an endpoint, decide which lens applies: an unauthenticated `/login` is rate-limiting-audit; an authenticated, metered `/v1/complete` keyed by API plan is api-rate-limiting. A few endpoints (e.g. `/graphql`) appear in both — there, this skill owns **query-cost/quota**, and rate-limiting-audit owns **anonymous abuse/DoS**. Cross-reference rather than duplicate.
