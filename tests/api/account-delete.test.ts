import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { DELETE } from '@/app/api/account/route';

const mockAuth = vi.mocked(auth);
const mockGetPool = vi.mocked(getPool);

function mockClient() {
  const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
  const release = vi.fn();
  mockGetPool.mockReturnValue({ connect: async () => ({ query, release }) } as never);
  return query;
}

describe('DELETE /api/account', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetPool.mockReset();
  });

  it('requires auth', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it('deletes the user (and their data) within a transaction', async () => {
    mockAuth.mockResolvedValue({ user: { id: '7' } } as never);
    const query = mockClient();
    const res = await DELETE();
    expect(res.status).toBe(200);
    const sqls = query.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(sqls).toContain('BEGIN');
    expect(sqls).toContain('COMMIT');
    expect(sqls.some((s) => s.includes('DELETE FROM users WHERE id'))).toBe(true);
  });
});
