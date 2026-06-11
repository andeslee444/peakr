import { describe, it, expect, vi } from 'vitest';
import { handleStripeEvent } from '@/lib/billing-events';
import type Stripe from 'stripe';

function fakeDb() {
  const seen = new Set<string>();
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO stripe_events')) {
      const id = String(params[0]);
      if (seen.has(id)) return { rows: [], rowCount: 0 };
      seen.add(id);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  return { db: { query }, calls };
}

function evt(type: string, object: Record<string, unknown>, id = 'evt_1'): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

function updates(calls: { sql: string; params: unknown[] }[]) {
  return calls.filter((c) => c.sql.includes('UPDATE users'));
}

describe('handleStripeEvent', () => {
  it('activates Pro on checkout.session.completed', async () => {
    const { db, calls } = fakeDb();
    const r = await handleStripeEvent(evt('checkout.session.completed', { metadata: { userId: '7' }, customer: 'cus_1' }), db);
    expect(r.handled).toBe(true);
    const u = updates(calls);
    expect(u.length).toBe(1);
    expect(u[0].params).toContain('pro');
    expect(u[0].params).toContain(7);
  });

  it('is idempotent — a replayed event id is a no-op', async () => {
    const { db, calls } = fakeDb();
    const e = evt('checkout.session.completed', { metadata: { userId: '7' }, customer: 'cus_1' }, 'evt_dup');
    await handleStripeEvent(e, db);
    const second = await handleStripeEvent(e, db);
    expect(second.handled).toBe(false);
    expect(second.reason).toBe('duplicate');
    // Only the first event applied an UPDATE.
    expect(updates(calls).length).toBe(1);
  });

  it('downgrades to free when a subscription goes past_due (plugs the dunning leak)', async () => {
    const { db, calls } = fakeDb();
    const r = await handleStripeEvent(evt('customer.subscription.updated', { customer: 'cus_9', status: 'past_due' }), db);
    expect(r.handled).toBe(true);
    expect(updates(calls)[0].params).toContain('free');
  });

  it('restores Pro when a subscription returns to active', async () => {
    const { db, calls } = fakeDb();
    await handleStripeEvent(evt('customer.subscription.updated', { customer: 'cus_9', status: 'active' }), db);
    expect(updates(calls)[0].params).toContain('pro');
  });

  it('downgrades to free on invoice.payment_failed', async () => {
    const { db, calls } = fakeDb();
    const r = await handleStripeEvent(evt('invoice.payment_failed', { customer: 'cus_3' }), db);
    expect(r.handled).toBe(true);
    expect(updates(calls)[0].params).toContain('free');
  });

  it('downgrades to free on subscription.deleted', async () => {
    const { db, calls } = fakeDb();
    await handleStripeEvent(evt('customer.subscription.deleted', { customer: 'cus_5' }), db);
    expect(updates(calls)[0].params).toContain('free');
  });

  it('falls back to stripe_customer_id when checkout has no user metadata', async () => {
    const { db, calls } = fakeDb();
    const r = await handleStripeEvent(evt('checkout.session.completed', { customer: 'cus_portal' }), db);
    expect(r.handled).toBe(true);
    const u = updates(calls)[0];
    expect(u.sql).toContain('stripe_customer_id');
    expect(u.params).toContain('cus_portal');
  });

  it('ignores unrelated event types (still recorded for idempotency)', async () => {
    const { db, calls } = fakeDb();
    const r = await handleStripeEvent(evt('charge.refunded', { id: 'ch_1' }), db);
    expect(r.handled).toBe(false);
    expect(updates(calls).length).toBe(0);
  });
});
