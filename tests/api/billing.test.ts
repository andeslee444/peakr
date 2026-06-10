import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }));
import { auth } from '@/lib/auth';
import { POST as checkout } from '@/app/api/billing/checkout/route';
import { POST as webhook } from '@/app/api/billing/webhook/route';
import { resetRateLimitStore } from '@/lib/rate-limit';

const mockAuth = vi.mocked(auth);

function postReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.peakr.test/api/billing/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('billing routes without Stripe configured', () => {
  const origKey = process.env.STRIPE_SECRET_KEY;
  const origHook = process.env.STRIPE_WEBHOOK_SECRET;
  beforeEach(() => {
    mockAuth.mockReset();
    resetRateLimitStore();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = origKey;
    if (origHook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = origHook;
  });

  it('checkout requires auth', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await checkout(postReq({ plan: 'monthly' }));
    expect(res.status).toBe(401);
  });

  it('checkout returns 503 when billing is not configured', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } } as never);
    const res = await checkout(postReq({ plan: 'monthly' }));
    expect(res.status).toBe(503);
  });

  it('webhook returns 503 when not configured', async () => {
    const res = await webhook(postReq({}, { 'stripe-signature': 'sig' }));
    expect(res.status).toBe(503);
  });
});

describe('billing webhook with secret but bad signature', () => {
  const origKey = process.env.STRIPE_SECRET_KEY;
  const origHook = process.env.STRIPE_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = origKey;
    if (origHook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = origHook;
  });

  it('rejects a request with no stripe-signature header (400)', async () => {
    const res = await webhook(postReq({}));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature (400)', async () => {
    const res = await webhook(postReq({ id: 'evt' }, { 'stripe-signature': 'bogus' }));
    expect(res.status).toBe(400);
  });
});
