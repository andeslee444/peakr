import { describe, it, expect } from 'vitest';
import { normalizeEmail, isValidEmail, passwordError } from '@/lib/auth-validation';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com');
  });
});

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
  });
  it('rejects malformed addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
});

describe('passwordError', () => {
  it('returns null for an acceptable password', () => {
    expect(passwordError('hunter2pass')).toBeNull();
  });
  it('rejects passwords shorter than 8', () => {
    expect(passwordError('ab1')).toMatch(/8 characters/);
  });
  it('requires a letter and a number', () => {
    expect(passwordError('12345678')).toMatch(/letter/);
    expect(passwordError('abcdefgh')).toMatch(/number/);
  });
});
