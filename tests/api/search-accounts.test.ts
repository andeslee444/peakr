import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn(() => ({ query: vi.fn(async () => ({ rows: [] })) })) }));
import { GET } from '@/app/api/search-accounts/route';
import { resetRateLimitStore } from '@/lib/rate-limit';

function req(q = 'someuser', platform = 'tiktok') {
  return new NextRequest(`https://app.peakr.test/api/search-accounts?q=${q}&platform=${platform}`);
}

describe('GET /api/search-accounts externalOk signal', () => {
  beforeEach(() => resetRateLimitStore());
  afterEach(() => vi.restoreAllMocks());

  it('reports externalOk=false when the external lookup fails (e.g. IP blocked)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 403 })));
    const data = await (await GET(req())).json();
    expect(data.externalOk).toBe(false);
  });

  it('reports externalOk=true when the lookup succeeds (even with no match)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const data = await (await GET(req())).json();
    expect(data.externalOk).toBe(true);
  });
});
