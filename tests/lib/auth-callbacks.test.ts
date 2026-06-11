import { describe, it, expect } from 'vitest';
import { shapeSession, sessionStillValid } from '@/lib/auth-callbacks';

describe('sessionStillValid', () => {
  it('valid when the token version matches the current version', () => {
    expect(sessionStillValid(3, 3)).toBe(true);
  });

  it('invalid when the password changed (current version bumped past the token)', () => {
    expect(sessionStillValid(2, 3)).toBe(false);
  });

  it('treats missing versions as 0 (legacy tokens stay valid until a real change)', () => {
    expect(sessionStillValid(undefined, undefined)).toBe(true);
    expect(sessionStillValid(undefined, 0)).toBe(true);
    expect(sessionStillValid(undefined, 1)).toBe(false);
  });
});

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
