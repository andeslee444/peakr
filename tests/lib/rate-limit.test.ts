import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimitStore, clientKey, rateLimitStoreSize } from '@/lib/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => resetRateLimitStore());

  it('prunes expired buckets so the store does not grow unbounded', () => {
    for (let i = 0; i < 500; i++) rateLimit(`ip-${i}`, 1, 1000, 0);
    expect(rateLimitStoreSize()).toBe(500);
    // A request well after those windows expired triggers a sweep.
    rateLimit('fresh', 1, 1000, 10_000);
    expect(rateLimitStoreSize()).toBeLessThan(500);
  });

  it('allows requests up to the limit, then blocks', () => {
    const now = 1000;
    expect(rateLimit('k', 3, 60_000, now).allowed).toBe(true);
    expect(rateLimit('k', 3, 60_000, now).allowed).toBe(true);
    expect(rateLimit('k', 3, 60_000, now).allowed).toBe(true);
    const fourth = rateLimit('k', 3, 60_000, now);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('resets after the window elapses', () => {
    expect(rateLimit('k', 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit('k', 1, 1000, 500).allowed).toBe(false);
    expect(rateLimit('k', 1, 1000, 1001).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    expect(rateLimit('a', 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit('b', 1, 1000, 0).allowed).toBe(true);
    expect(rateLimit('a', 1, 1000, 0).allowed).toBe(false);
  });
});

describe('clientKey', () => {
  it('derives a scoped key from the forwarded client IP', () => {
    const req = new Request('https://app.peakr.test/api/x', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(clientKey(req, 'signup')).toBe('signup:203.0.113.7');
  });

  it('falls back when no IP header is present', () => {
    const req = new Request('https://app.peakr.test/api/x');
    expect(clientKey(req, 'signup')).toBe('signup:unknown');
  });
});
