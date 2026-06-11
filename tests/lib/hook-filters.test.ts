import { describe, it, expect } from 'vitest';
import { DEFAULT_FILTERS, hasActiveFilters } from '@/components/HookFilters';

describe('hasActiveFilters', () => {
  it('is false for the defaults', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it('is true when a niche is applied (the common silent-empty cause)', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, niche: 'fitness' })).toBe(true);
  });

  it('is true for a non-default platform / search / facet', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, platform: 'tiktok' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: 'foo' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, hook_type: 'question' })).toBe(true);
  });
});
