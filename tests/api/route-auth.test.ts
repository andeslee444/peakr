import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';

import { GET as explore } from '@/app/api/explore/route';
import { GET as exportData } from '@/app/api/export/route';
import { GET as search } from '@/app/api/search/route';
import { GET as hookStats } from '@/app/api/hook-lab/stats/route';
import { GET as hookTrending } from '@/app/api/hook-lab/trending/route';
import { GET as hookSounds } from '@/app/api/hook-lab/trending-sounds/route';
import { GET as keyframe } from '@/app/api/keyframe/[post_id]/route';
import { GET as profileGet } from '@/app/api/profiles/[username]/route';

const mockAuth = vi.mocked(auth);

function nreq(path = 'https://app.peakr.test/api/x') {
  return new NextRequest(path);
}

describe('dashboard API routes reject unauthenticated requests', () => {
  beforeEach(() => mockAuth.mockReset());

  it('all return 401 without a session', async () => {
    mockAuth.mockResolvedValue(null as never);
    const results = await Promise.all([
      explore(nreq()),
      exportData(new Request('https://app.peakr.test/api/export')),
      search(new Request('https://app.peakr.test/api/search?q=x')),
      hookStats(),
      hookTrending(),
      hookSounds(),
      keyframe(nreq(), { params: { post_id: '1' } }),
      profileGet(new Request('https://app.peakr.test/api/profiles/x'), { params: Promise.resolve({ username: 'x' }) }),
    ]);
    for (const res of results) {
      expect(res.status).toBe(401);
    }
  });
});
