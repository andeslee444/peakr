import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCached, clearTtlCache } from '@/lib/ttl-cache';

describe('getCached', () => {
  beforeEach(() => clearTtlCache());

  it('computes once and serves the cached value within the TTL', async () => {
    const fn = vi.fn(async () => 42);
    const a = await getCached('k', 1000, fn, 0);
    const b = await getCached('k', 1000, fn, 500);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1); // second call hit the cache
  });

  it('recomputes after the TTL expires', async () => {
    const fn = vi.fn(async () => Math.random());
    await getCached('k', 1000, fn, 0);
    await getCached('k', 1000, fn, 1500); // past TTL
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keys are independent', async () => {
    const fn = vi.fn(async () => 1);
    await getCached('a', 1000, fn, 0);
    await getCached('b', 1000, fn, 0);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
