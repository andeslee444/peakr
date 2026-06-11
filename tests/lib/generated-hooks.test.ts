import { describe, it, expect, vi } from 'vitest';
import { persistGeneratedHooks, getRecentGenerations } from '@/lib/generated-hooks';

describe('persistGeneratedHooks', () => {
  it('inserts the generation scoped to the user with serialized hooks', async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => ({ rows: [] }));
    await persistGeneratedHooks({ query }, 7, 'morning routines', [{ hook: 'a' }]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO generated_hooks');
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('morning routines');
    expect(String(params[2])).toContain('"hook":"a"'); // JSON-serialized
  });

  it('never throws on a DB error (persistence is best-effort)', async () => {
    const query = vi.fn(async () => { throw new Error('db down'); });
    await expect(persistGeneratedHooks({ query }, 7, 't', [])).resolves.toBeUndefined();
  });
});

describe('getRecentGenerations', () => {
  it('returns the user-scoped recent generations, newest first', async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => ({ rows: [{ id: 2 }, { id: 1 }] }));
    const rows = await getRecentGenerations({ query }, 7, 10);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WHERE user_id');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([7, 10]);
    expect(rows).toHaveLength(2);
  });
});
