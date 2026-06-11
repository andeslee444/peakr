import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { POST } from '@/app/api/track/route';
import { FREE_TRACK_LIMIT, PRO_TRACK_LIMIT } from '@/lib/plan';
import { resetRateLimitStore } from '@/lib/rate-limit';

const mockAuth = vi.mocked(auth);
const mockGetPool = vi.mocked(getPool);

const profile = { id: 99, username: 'creator', platform: 'tiktok' };

function poolWith(gate: { plan: string; tracked_count: number; already: boolean }) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT * FROM profiles')) return { rows: [profile] };
    if (sql.includes('tracked_count')) return { rows: [gate] };
    return { rows: [] };
  });
  mockGetPool.mockReturnValue({ query } as never);
  return query;
}

function trackReq(body: unknown = { username: 'creator', platform: 'tiktok' }) {
  return new NextRequest('https://app.peakr.test/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function inserted(query: ReturnType<typeof poolWith>): boolean {
  return query.mock.calls.map((c) => String(c[0])).some((s) => s.includes('INSERT INTO user_tracked_profiles'));
}

describe('POST /api/track plan gating', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetPool.mockReset();
    resetRateLimitStore();
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
  });

  it('allows a free user who is under the track limit', async () => {
    const query = poolWith({ plan: 'free', tracked_count: FREE_TRACK_LIMIT - 1, already: false });
    const res = await POST(trackReq());
    expect(res.status).toBe(200);
    expect(inserted(query)).toBe(true);
  });

  it('blocks a free user at the limit with 402 and does not track', async () => {
    const query = poolWith({ plan: 'free', tracked_count: FREE_TRACK_LIMIT, already: false });
    const res = await POST(trackReq());
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.limit).toBe(FREE_TRACK_LIMIT);
    expect(body.upgrade).toBe(true);
    expect(inserted(query)).toBe(false);
  });

  it('still lets a user re-track a profile they already track, even at the limit (idempotent)', async () => {
    const query = poolWith({ plan: 'free', tracked_count: FREE_TRACK_LIMIT, already: true });
    const res = await POST(trackReq());
    expect(res.status).toBe(200);
    expect(inserted(query)).toBe(true);
  });

  it('lets a pro user past the free limit', async () => {
    const query = poolWith({ plan: 'pro', tracked_count: FREE_TRACK_LIMIT + 5, already: false });
    const res = await POST(trackReq());
    expect(res.status).toBe(200);
    expect(inserted(query)).toBe(true);
    expect(PRO_TRACK_LIMIT).toBeGreaterThan(FREE_TRACK_LIMIT);
  });

  it('blocks a pro user only at the pro limit', async () => {
    const query = poolWith({ plan: 'pro', tracked_count: PRO_TRACK_LIMIT, already: false });
    const res = await POST(trackReq());
    expect(res.status).toBe(402);
    expect(inserted(query)).toBe(false);
  });
});
