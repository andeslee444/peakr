import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { POST, GET } from '@/app/api/analyze-hook/route';
import { DAILY_MANUAL_ANALYSIS_CAP } from '@/lib/analysis-limits';

const mockAuth = vi.mocked(auth);
const mockGetPool = vi.mocked(getPool);

type Rows = { rows: unknown[] };
function poolWith(handler: (sql: string) => Rows) {
  const query = vi.fn(async (sql: string) => handler(sql));
  mockGetPool.mockReturnValue({ query } as never);
  return query;
}

function postReq(body: unknown) {
  return new Request('https://app.peakr.test/api/analyze-hook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const trackedPost = { id: 7, post_url: 'https://www.tiktok.com/@u/video/1', analyzed_at: null, hook_analysis: null };
const pendingPost = { id: 7, post_url: 'https://www.tiktok.com/@u/video/1', analyzed_at: null, hook_analysis: { status: 'pending' } };

describe('POST /api/analyze-hook', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetPool.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(postReq({ post_id: 7 }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the post is not tracked by the user (ownership)', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    poolWith((sql) => {
      if (sql.includes('user_tracked_profiles')) return { rows: [] };
      return { rows: [] };
    });
    const res = await POST(postReq({ post_id: 7 }));
    expect(res.status).toBe(404);
  });

  it('returns 429 when the user is over the daily manual-analysis cap', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    poolWith((sql) => {
      if (sql.includes('user_tracked_profiles')) return { rows: [trackedPost] };
      if (sql.includes('analysis_requests') && sql.toUpperCase().includes('COUNT')) {
        return { rows: [{ count: DAILY_MANUAL_ANALYSIS_CAP }] };
      }
      return { rows: [] };
    });
    const res = await POST(postReq({ post_id: 7 }));
    expect(res.status).toBe(429);
  });

  it('does not re-charge the daily cap when the post is already queued (pending)', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    const query = poolWith((sql) => {
      if (sql.includes('user_tracked_profiles')) return { rows: [pendingPost] };
      if (sql.includes('analysis_requests') && sql.toUpperCase().includes('COUNT')) {
        return { rows: [{ count: 0 }] };
      }
      return { rows: [] };
    });
    const res = await POST(postReq({ post_id: 7 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'queued', post_id: 7 });
    // The bug: reopening a pending post inserted a SECOND analysis_requests row,
    // burning another unit of the daily quota. It must be a no-op now.
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('INSERT INTO analysis_requests'))).toBe(false);
  });

  it('queues the post when authorized and under the cap', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    const query = poolWith((sql) => {
      if (sql.includes('user_tracked_profiles')) return { rows: [trackedPost] };
      if (sql.includes('analysis_requests') && sql.toUpperCase().includes('COUNT')) {
        return { rows: [{ count: 0 }] };
      }
      return { rows: [] };
    });
    const res = await POST(postReq({ post_id: 7 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'queued', post_id: 7 });
    // an analysis_requests row is recorded and the post is flagged pending
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('INSERT INTO analysis_requests'))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE posts SET hook_analysis'))).toBe(true);
  });
});

function getReq(postId: number) {
  return new Request(`https://app.peakr.test/api/analyze-hook?post_id=${postId}`);
}

describe('GET /api/analyze-hook (poll status)', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetPool.mockReset();
  });

  it('401 without a session', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(getReq(7));
    expect(res.status).toBe(401);
  });

  it('404 for a post the user does not track', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    poolWith(() => ({ rows: [] }));
    const res = await GET(getReq(7));
    expect(res.status).toBe(404);
  });

  it('reports done with the analysis once resolved', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    poolWith(() => ({ rows: [{ analyzed_at: '2026-06-10T00:00:00Z', hook_analysis: { hook_type: 'x' }, transcript: 't' }] }));
    const res = await GET(getReq(7));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'done' });
  });

  it('reports queued while still pending', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    poolWith(() => ({ rows: [{ analyzed_at: null, hook_analysis: { status: 'pending' }, transcript: null }] }));
    const res = await GET(getReq(7));
    expect(await res.json()).toMatchObject({ status: 'queued' });
  });
});
