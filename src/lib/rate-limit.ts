import { NextResponse } from 'next/server';

/**
 * Fixed-window in-memory rate limiter.
 *
 * NOTE: state is per-process, so on Vercel each serverless instance has its own
 * counters — the effective limit is roughly (configured limit × warm instances).
 * This still meaningfully throttles bursts from a single client and is a
 * reasonable launch baseline. For strict GLOBAL limits (login/signup brute-force),
 * back this with a shared store: provision Vercel KV / Upstash Redis and replace
 * the `store` Map operations with KV calls — `rateLimit` is the single chokepoint,
 * so no call site changes. Expired buckets are pruned (see PRUNE_THRESHOLD) so the
 * in-memory store can't grow unbounded under a flood of unique IPs.
 */
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

// Above this many tracked keys, sweep expired buckets so a flood of unique IPs
// can't grow the Map without bound (the buckets are otherwise only overwritten
// when the same key is seen again).
const PRUNE_THRESHOLD = 256;

function pruneExpired(now: number): void {
  for (const [key, bucket] of store) {
    if (now >= bucket.resetAt) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  if (store.size > PRUNE_THRESHOLD) pruneExpired(now);
  const bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/** Clears all counters. Test-only helper. */
export function resetRateLimitStore(): void {
  store.clear();
}

/** Number of tracked buckets (for tests / introspection). */
export function rateLimitStoreSize(): number {
  return store.size;
}

/** Build a per-client key from the forwarded IP, scoped by route. */
export function clientKey(request: Request, scope: string): string {
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : 'unknown';
  return `${scope}:${ip || 'unknown'}`;
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(resetAt: number, now: number = Date.now()): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

/**
 * Convenience guard for API routes. Returns a 429 NextResponse if the caller is
 * over the limit, or null to proceed. Keys by client IP + scope.
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const result = rateLimit(clientKey(request, scope), limit, windowMs);
  return result.allowed ? null : tooManyRequests(result.resetAt);
}

/**
 * Like {@link enforceRateLimit} but keyed by an explicit string (e.g. a user id)
 * — use for authenticated, per-user limits on expensive endpoints.
 */
export function enforceRateLimitFor(
  key: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const result = rateLimit(key, limit, windowMs);
  return result.allowed ? null : tooManyRequests(result.resetAt);
}
