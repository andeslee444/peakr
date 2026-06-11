import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { id: '1' } })) }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { getPool } from '@/lib/db';
import { GET as keyframe } from '@/app/api/keyframe/[post_id]/route';

const mockGetPool = vi.mocked(getPool);

function poolReturning(row: Record<string, unknown> | null) {
  const query = vi.fn(async () => ({ rows: row ? [row] : [] }));
  mockGetPool.mockReturnValue({ query } as never);
  return query;
}

function req() {
  return new NextRequest('https://app.peakr.test/api/keyframe/1');
}

describe('GET /api/keyframe/[post_id] redirect safety', () => {
  beforeEach(() => mockGetPool.mockReset());

  it('redirects to an allowlisted Instagram CDN thumbnail', async () => {
    poolReturning({ keyframe_base64: null, thumbnail_url: 'https://scontent.cdninstagram.com/v/x.jpg', s3_thumbnail_url: null });
    const res = await keyframe(req(), { params: { post_id: '1' } });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('cdninstagram.com');
  });

  it('redirects to an allowlisted TikTok CDN thumbnail', async () => {
    poolReturning({ keyframe_base64: null, thumbnail_url: 'https://p16-sign-va.tiktokcdn.com/v/x.jpg', s3_thumbnail_url: null });
    const res = await keyframe(req(), { params: { post_id: '1' } });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });

  it('does NOT redirect to an off-allowlist host (closes the open redirect)', async () => {
    poolReturning({ keyframe_base64: null, thumbnail_url: 'https://evil.example.com/phish.jpg', s3_thumbnail_url: null });
    const res = await keyframe(req(), { params: { post_id: '1' } });
    // Must not 3xx to the attacker URL.
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it('prefers our own re-hosted S3 thumbnail when present', async () => {
    poolReturning({
      keyframe_base64: null,
      thumbnail_url: 'https://evil.example.com/phish.jpg',
      s3_thumbnail_url: 'https://peakr-thumbs.s3.us-east-1.amazonaws.com/t/1.jpg',
    });
    const res = await keyframe(req(), { params: { post_id: '1' } });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('amazonaws.com');
  });
});
