import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'HASH') } }));
import { getPool } from '@/lib/db';
import { POST } from '@/app/api/auth/signup/route';
import { resetRateLimitStore } from '@/lib/rate-limit';

const mockGetPool = vi.mocked(getPool);

function poolWith(handler: (sql: string, params: unknown[]) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string, params: unknown[]) => handler(sql, params));
  mockGetPool.mockReturnValue({ query } as never);
  return query;
}

function req(body: unknown) {
  return new Request('https://app.peakr.test/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    mockGetPool.mockReset();
    resetRateLimitStore();
  });

  it('rejects an invalid email format', async () => {
    poolWith(() => ({ rows: [] }));
    const res = await POST(req({ email: 'not-an-email', password: 'hunter2pass' }));
    expect(res.status).toBe(400);
  });

  it('rejects a weak password', async () => {
    poolWith(() => ({ rows: [] }));
    const res = await POST(req({ email: 'a@b.com', password: 'abcdefgh' }));
    expect(res.status).toBe(400);
  });

  it('normalizes the email before checking existence and inserting', async () => {
    const query = poolWith((sql) => {
      if (sql.includes('SELECT id FROM users')) return { rows: [] };
      return { rows: [{ id: 1 }] };
    });
    const res = await POST(req({ email: '  Foo@Example.COM ', password: 'hunter2pass' }));
    expect(res.status).toBe(200);
    const selectCall = query.mock.calls.find((c) => String(c[0]).includes('SELECT id FROM users'));
    const insertCall = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'));
    expect((selectCall?.[1] as string[])[0]).toBe('foo@example.com');
    expect((insertCall?.[1] as string[])[0]).toBe('foo@example.com');
  });

  it('returns 409 when the (normalized) email already exists', async () => {
    poolWith((sql) => {
      if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 5 }] };
      return { rows: [] };
    });
    const res = await POST(req({ email: 'FOO@example.com', password: 'hunter2pass' }));
    expect(res.status).toBe(409);
  });

  it('rate-limits repeated signups from the same IP', async () => {
    poolWith(() => ({ rows: [] }));
    const fromIp = (body: unknown) =>
      new Request('https://app.peakr.test/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
        body: JSON.stringify(body),
      });
    let last: Response | undefined;
    for (let i = 0; i < 7; i++) {
      last = await POST(fromIp({ email: `u${i}@b.com`, password: 'hunter2pass' }));
    }
    expect(last!.status).toBe(429);
  });
});
