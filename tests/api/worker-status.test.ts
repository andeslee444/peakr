import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { getPool } from '@/lib/db';
import { GET } from '@/app/api/worker-status/route';

const mockGetPool = vi.mocked(getPool);

function poolReturning(rows: unknown[]) {
  mockGetPool.mockReturnValue({ query: vi.fn(async () => ({ rows })) } as never);
}

describe('GET /api/worker-status', () => {
  beforeEach(() => mockGetPool.mockReset());

  it('reports not-alive when there is no heartbeat', async () => {
    poolReturning([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alive: false });
  });

  it('reports alive for a recent heartbeat', async () => {
    poolReturning([{ worker_id: 'mac-mini', last_heartbeat_at: new Date().toISOString(), status: 'ok' }]);
    const data = await (await GET()).json();
    expect(data.alive).toBe(true);
  });

  it('reports not-alive for a stale heartbeat', async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    poolReturning([{ worker_id: 'mac-mini', last_heartbeat_at: old, status: 'ok' }]);
    const data = await (await GET()).json();
    expect(data.alive).toBe(false);
  });
});
