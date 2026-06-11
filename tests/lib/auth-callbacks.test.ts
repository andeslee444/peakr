import { describe, it, expect } from 'vitest';
import { shapeSession } from '@/lib/auth-callbacks';

describe('shapeSession', () => {
  it('exposes the plan from the token on the session user (for UI gating)', () => {
    const s = shapeSession({ user: { name: null } }, { userId: 1, plan: 'pro' });
    expect(s.user?.plan).toBe('pro');
    expect(s.user?.id).toBe('1');
  });

  it('defaults to the free plan when the token carries none', () => {
    const s = shapeSession({ user: {} }, { userId: 1 });
    expect(s.user?.plan).toBe('free');
  });

  it('normalizes a garbage plan value to free', () => {
    const s = shapeSession({ user: {} }, { userId: 1, plan: 'enterprise-lol' });
    expect(s.user?.plan).toBe('free');
  });

  it('copies username onto the session name', () => {
    const s = shapeSession({ user: {} }, { userId: 2, username: 'andes', plan: 'free' });
    expect(s.user?.name).toBe('andes');
  });
});
