import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
import { GET } from '@/app/api/image-proxy/route';

const mockAuth = vi.mocked(auth);

function req(url: string) {
  return new NextRequest(`https://app.peakr.test/api/image-proxy?url=${encodeURIComponent(url)}`);
}

describe('GET /api/image-proxy', () => {
  beforeEach(() => mockAuth.mockReset());

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req('https://scontent.cdninstagram.com/v/a.jpg'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-allowlisted / unsafe url even when authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    const res = await GET(req('https://169.254.169.254/latest/meta-data/'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a private IP url', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    const res = await GET(req('http://10.0.0.5/x'));
    expect(res.status).toBe(400);
  });
});
