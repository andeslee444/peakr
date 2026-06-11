import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { POST as portal } from '@/app/api/billing/portal/route';
import { resetRateLimitStore } from '@/lib/rate-limit';

const mockAuth = vi.mocked(auth);
const mockGetPool = vi.mocked(getPool);

function postReq() {
  return new Request('https://app.peakr.test/api/billing/portal', { method: 'POST' });
}

describe('POST /api/billing/portal', () => {
  const origKey = process.env.STRIPE_SECRET_KEY;
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetPool.mockReset();
    resetRateLimitStore();
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = origKey;
  });

  it('requires auth', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    mockAuth.mockResolvedValue(null as never);
    const res = await portal(postReq());
    expect(res.status).toBe(401);
  });

  it('returns 503 when billing is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    const res = await portal(postReq());
    expect(res.status).toBe(503);
  });

  it('returns 400 when the user has no Stripe customer to manage', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    const query = vi.fn(async (_sql: string) => ({ rows: [{ stripe_customer_id: null }] }));
    mockGetPool.mockReturnValue({ query } as never);
    const res = await portal(postReq());
    expect(res.status).toBe(400);
  });
});
