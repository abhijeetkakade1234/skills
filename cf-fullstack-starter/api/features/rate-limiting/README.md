# Feature: rate-limiting

KV-backed fixed-window counter. Cross-cutting (used by every other feature's routes) but
small enough to own its own folder rather than living in `core/`.

Docs: [Workers KV](https://developers.cloudflare.com/kv/) ·
[`cf-connecting-ip` header](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)

## `src/features/rate-limiting/middleware.ts`

```ts
import { createMiddleware } from 'hono/factory';
import { Errors } from '../../core/errors';
import type { Bindings, Variables } from '../../core/types';

type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
  keyPrefix: string;
  perUser?: boolean; // key on the authenticated user id instead of IP — mount AFTER auth
};

// Fixed-window counter backed by KV. Good enough for edge rate limiting at this scale — KV
// is eventually consistent, so under heavy concurrent bursts from the same key the true
// count can overshoot slightly. Acceptable for abuse/brute-force protection; for exact
// accounting (e.g. billing quotas) use a Durable Object counter instead
// (https://developers.cloudflare.com/durable-objects/).
export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
    // cf-connecting-ip is set by Cloudflare's edge and can't be spoofed by the client,
    // unlike x-forwarded-for/x-real-ip which the client can send any value for.
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const user = c.get('user');
    const identity = options.perUser && user ? `user:${user.id}` : `ip:${ip}`;
    const windowBucket = Math.floor(Date.now() / (options.windowSeconds * 1000));
    const key = `ratelimit:${options.keyPrefix}:${identity}:${windowBucket}`;

    const current = Number((await c.env.CACHE_KV.get(key)) ?? '0');
    if (current >= options.limit) {
      c.header('Retry-After', String(options.windowSeconds));
      throw Errors.rateLimited();
    }
    await c.env.CACHE_KV.put(key, String(current + 1), { expirationTtl: options.windowSeconds + 5 });
    await next();
  });
}

// Starting-point budgets — tune per project traffic. Auth stricter than reads: the limit
// reflects what the endpoint protects against (brute-force, mailbox flood, DB/CPU cost),
// not one global number.
export const authRateLimit = rateLimit({ limit: 5, windowSeconds: 15 * 60, keyPrefix: 'auth' });
export const readRateLimit = rateLimit({ limit: 100, windowSeconds: 60, keyPrefix: 'read' });
export const writeRateLimit = rateLimit({ limit: 30, windowSeconds: 60, keyPrefix: 'write' });
```

For deeper coverage on which endpoints need what limit and why (OTP, password reset, export,
GraphQL cost limiting, etc.), see `rate-limiting-audit` and `api-rate-limiting` under
`security-audit-orchestrator/specialized/`.
