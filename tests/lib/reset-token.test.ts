import { describe, it, expect } from 'vitest';
import { generateResetToken, hashToken, isTokenExpired } from '@/lib/reset-token';

describe('hashToken', () => {
  it('is deterministic and 64-char hex', () => {
    const h = hashToken('abc');
    expect(h).toBe(hashToken('abc'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('generateResetToken', () => {
  it('returns a 64-char hex token', () => {
    expect(generateResetToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is unique across calls', () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });
});

describe('isTokenExpired', () => {
  it('is true once past the expiry', () => {
    expect(isTokenExpired(new Date(1000), 2000)).toBe(true);
  });
  it('is false before the expiry', () => {
    expect(isTokenExpired(new Date(5000), 2000)).toBe(false);
  });
});
