import { describe, it, expect } from 'vitest';
import { savedPostsClause } from '@/lib/saved-posts-sql';

describe('savedPostsClause', () => {
  it('scopes is_saved to the user with EXISTS (no unscoped LEFT JOIN fan-out)', () => {
    const c = savedPostsClause(42, 3);
    expect(c.fragment).toContain('EXISTS');
    expect(c.fragment).toContain('saved_posts');
    // The whole point: the subquery is scoped to THIS user, so a post saved by
    // N users yields one boolean (not N rows) and never leaks another user's save.
    expect(c.fragment).toContain('sp.user_id = $3');
    expect(c.fragment).toContain('AS is_saved');
    expect(c.fragment).not.toMatch(/LEFT JOIN/i);
    expect(c.params).toEqual([42]);
    expect(c.nextIndex).toBe(4);
  });

  it('returns a constant false for anonymous requests (no rows joined, nothing leaked)', () => {
    const c = savedPostsClause(null, 5);
    expect(c.fragment).toBe('false AS is_saved');
    expect(c.params).toEqual([]);
    expect(c.nextIndex).toBe(5);
  });

  it('always binds user_id when a user is present (regression guard against the leak)', () => {
    const c = savedPostsClause(7, 1);
    // Must reference user_id — a fragment without it is the original bug.
    expect(c.fragment).toMatch(/sp\.user_id\s*=\s*\$1/);
    expect(c.params).toEqual([7]);
  });
});
