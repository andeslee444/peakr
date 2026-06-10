import { NextResponse } from 'next/server';

/**
 * Fixed-window in-memory rate limiter.
 *
 * NOTE: state is per-process, so on Vercel each serverless instance has its own
 * counters. This still meaningfully throttles bursts from a single client and is
 * a reasonable launch baseline. For strict global limits across instances, back
 * this with a shared store (e.g. Upstash Redis) — the call sites can stay the
 * same.
 */
type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

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
