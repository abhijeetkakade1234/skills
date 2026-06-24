# API Rate Limiting — Vulnerable → Fixed Examples

Reference companion to the api-rate-limiting skill's **Phase 6**. Full per-language vulnerable→fixed code and gateway config snippets, moved out of `SKILL.md` to keep the audit flow lean. Use these as the concrete fix templates when proposing or applying changes.

## (a) Limiter keyed on IP → keyed on API key + per-tier limit (Node)

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

## (b) In-memory limiter → Redis-backed distributed (Python)

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

## (c) Missing quota headers → emit standard RateLimit headers + Retry-After

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

## (d) Unbounded GraphQL → cost / depth limit

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

## (e) Gateway usage plan / Kong plugin config

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
