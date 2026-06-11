import type Stripe from 'stripe';

/** Minimal DB surface so the handler is unit-testable with a fake. */
export interface DbLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface HandleResult {
  handled: boolean;
  reason: string;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * Apply a *verified* Stripe event to the DB.
 *
 * - Idempotent: the event id is recorded in `stripe_events`; a replay is skipped.
 * - Plan is driven by subscription state so the dunning leak is closed:
 *   active/trialing → pro, anything else (past_due/unpaid/canceled) → free,
 *   with automatic recovery when the subscription returns to active.
 * - checkout.session.completed maps by user metadata, falling back to the
 *   Stripe customer id (so portal/dashboard-created subscriptions still apply).
 */
export async function handleStripeEvent(event: Stripe.Event, db: DbLike): Promise<HandleResult> {
  // Idempotency gate — ON CONFLICT DO NOTHING returns rowCount 0 on replay.
  const ins = await db.query(
    'INSERT INTO stripe_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING',
    [event.id]
  );
  if (!ins.rowCount) {
    return { handled: false, reason: 'duplicate' };
  }

  const obj = event.data.object as unknown as Record<string, unknown>;

  switch (event.type) {
    case 'checkout.session.completed': {
      const metadata = obj.metadata as Record<string, unknown> | undefined;
      const userId = Number(metadata?.userId ?? obj.client_reference_id);
      const customer = asString(obj.customer);
      if (Number.isFinite(userId) && userId > 0) {
        await db.query(
          'UPDATE users SET plan = $1, stripe_customer_id = COALESCE($2, stripe_customer_id) WHERE id = $3',
          ['pro', customer, userId]
        );
        return { handled: true, reason: 'activated' };
      }
      // Fallback: no app user in metadata (e.g. created from the Stripe portal) —
      // map by customer id instead of silently granting nothing.
      if (customer) {
        await db.query('UPDATE users SET plan = $1 WHERE stripe_customer_id = $2', ['pro', customer]);
        return { handled: true, reason: 'activated_by_customer' };
      }
      return { handled: false, reason: 'no_user' };
    }

    case 'customer.subscription.updated': {
      const customer = asString(obj.customer);
      const status = String(obj.status ?? '');
      const plan = status === 'active' || status === 'trialing' ? 'pro' : 'free';
      if (customer) {
        await db.query('UPDATE users SET plan = $1 WHERE stripe_customer_id = $2', [plan, customer]);
        return { handled: true, reason: `status:${status}->${plan}` };
      }
      return { handled: false, reason: 'no_customer' };
    }

    case 'invoice.payment_failed': {
      const customer = asString(obj.customer);
      if (customer) {
        // Pause access; subscription.updated(active) restores it once paid.
        await db.query('UPDATE users SET plan = $1 WHERE stripe_customer_id = $2', ['free', customer]);
        return { handled: true, reason: 'payment_failed' };
      }
      return { handled: false, reason: 'no_customer' };
    }

    case 'customer.subscription.deleted': {
      const customer = asString(obj.customer);
      if (customer) {
        await db.query('UPDATE users SET plan = $1 WHERE stripe_customer_id = $2', ['free', customer]);
        return { handled: true, reason: 'deleted' };
      }
      return { handled: false, reason: 'no_customer' };
    }

    default:
      return { handled: false, reason: 'ignored' };
  }
}
