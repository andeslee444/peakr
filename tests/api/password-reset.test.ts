import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
  isEmailConfigured: vi.fn(() => true),
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'HASH') } }));
import { getPool } from '@/lib/db';
import { isEmailConfigured } from '@/lib/email';
import { POST as forgot } from '@/app/api/auth/forgot-password/route';
import { POST as reset } from '@/app/api/auth/reset-password/route';
import { resetRateLimitStore } from '@/lib/rate-limit';

const mockGetPool = vi.mocked(getPool);
const mockIsConfigured = vi.mocked(isEmailConfigured);

function poolWith(handler: (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  const query = vi.fn(async (sql: string, params: unknown[]) => handler(sql, params));
  mockGetPool.mockReturnValue({ query } as never);
  return query;
}

function postReq(body: unknown) {
  return new Request('https://app.peakr.test/api/auth/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    mockGetPool.mockReset();
    mockIsConfigured.mockReturnValue(true);
    resetRateLimitStore();
  });

  it('returns a generic 200 even for an unknown email (no enumeration)', async () => {
    poolWith(() => ({ rows: [] }));
    const res = await forgot(postReq({ email: 'nobody@nowhere.com' }));
    expect(res.status).toBe(200);
  });

  it('returns the same 200 when the email exists', async () => {
    poolWith((sql) => {
      if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    });
    const res = await forgot(postReq({ email: 'real@user.com' }));
    expect(res.status).toBe(200);
  });

  it('honestly reports unavailability when email delivery is not configured', async () => {
    // The old bug: the route claimed "we sent a link" even though sendEmail
    // no-ops without RESEND_API_KEY, permanently locking out credentials users.
    mockIsConfigured.mockReturnValue(false);
    const query = poolWith((sql) => {
      if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    });
    const res = await forgot(postReq({ email: 'real@user.com' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.available).toBe(false);
    // Must not falsely claim a link was sent.
    expect(JSON.stringify(body)).not.toMatch(/sent/i);
    // Global gate — decided before any user lookup, so it can't enumerate.
    expect(query).not.toHaveBeenCalled();
  });

  it('gives the SAME unavailable response for unknown emails (no enumeration via the gate)', async () => {
    mockIsConfigured.mockReturnValue(false);
    poolWith(() => ({ rows: [] }));
    const res = await forgot(postReq({ email: 'nobody@nowhere.com' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.available).toBe(false);
  });
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    mockGetPool.mockReset();
    resetRateLimitStore();
  });

  it('rejects an invalid / expired / used token', async () => {
    poolWith((sql) => {
      if (sql.includes('FROM password_reset_tokens')) return { rows: [] };
      return { rows: [] };
    });
    const res = await reset(postReq({ token: 'deadbeef', password: 'hunter2pass' }));
    expect(res.status).toBe(400);
  });

  it('rejects a weak new password', async () => {
    poolWith(() => ({ rows: [{ user_id: 1, id: 9 }] }));
    const res = await reset(postReq({ token: 'deadbeef', password: 'short' }));
    expect(res.status).toBe(400);
  });

  it('updates the password and consumes the token on success', async () => {
    const query = poolWith((sql) => {
      if (sql.includes('FROM password_reset_tokens')) return { rows: [{ id: 9, user_id: 1 }] };
      return { rows: [] };
    });
    const res = await reset(postReq({ token: 'deadbeef', password: 'hunter2pass' }));
    expect(res.status).toBe(200);
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('UPDATE users SET password_hash'))).toBe(true);
    expect(sqls.some((s) => s.includes('used_at'))).toBe(true);
  });
});
