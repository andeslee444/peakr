import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { GET as exportData } from '@/app/api/export/route';

const mockAuth = vi.mocked(auth);
const mockGetPool = vi.mocked(getPool);

function poolForPlan(plan: string) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT plan')) return { rows: [{ plan }] };
    return { rows: [] };
  });
  mockGetPool.mockReturnValue({ query } as never);
  return query;
}

function req() {
  return new Request('https://app.peakr.test/api/export?format=csv');
}

describe('GET /api/export plan gating', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetPool.mockReset();
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
  });

  it('blocks a free user with 402 + upgrade hint (export is a Pro feature)', async () => {
    poolForPlan('free');
    const res = await exportData(req());
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
  });

  it('allows a Pro user to export', async () => {
    poolForPlan('pro');
    const res = await exportData(req());
    expect(res.status).toBe(200);
  });
});
