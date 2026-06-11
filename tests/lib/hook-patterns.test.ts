import { describe, it, expect, vi } from 'vitest';
import { recomputePatternStats } from '@/lib/hook-patterns';

describe('recomputePatternStats', () => {
  it('recomputes example_count + averages on the pattern from its linked posts', async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => ({ rows: [] }));
    await recomputePatternStats({ query }, 42);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('UPDATE hook_patterns');
    expect(sql).toContain('example_count');
    expect(sql).toContain('avg_viral_score');
    expect(sql).toContain('hook_pattern_posts');
    expect(params).toEqual([42]);
  });
});
