import { describe, it, expect } from 'vitest';
import { normalizePlan, isPro, trackLimit, FREE_TRACK_LIMIT, PRO_TRACK_LIMIT } from '@/lib/plan';

describe('plan helpers', () => {
  it('normalizes unknown/null values to free', () => {
    expect(normalizePlan('pro')).toBe('pro');
    expect(normalizePlan('free')).toBe('free');
    expect(normalizePlan(null)).toBe('free');
    expect(normalizePlan('garbage')).toBe('free');
  });

  it('isPro only for pro', () => {
    expect(isPro('pro')).toBe(true);
    expect(isPro('free')).toBe(false);
    expect(isPro(undefined)).toBe(false);
  });

  it('track limits scale with plan', () => {
    expect(trackLimit('free')).toBe(FREE_TRACK_LIMIT);
    expect(trackLimit('pro')).toBe(PRO_TRACK_LIMIT);
    expect(PRO_TRACK_LIMIT).toBeGreaterThan(FREE_TRACK_LIMIT);
  });
});
