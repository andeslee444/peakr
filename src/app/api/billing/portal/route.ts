import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getUserId, unauthorized } from '@/lib/api-auth';
import { enforceRateLimitFor } from '@/lib/rate-limit';

/**
 * Open the Stripe Customer Portal so a subscriber can update payment, switch
 * plan, or cancel — self-serve, no support ticket (and avoids click-to-cancel
 * legal exposure from having no in-app cancel path).
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();

  const limited = enforceRateLimitFor(`portal:${userId}`, 10, 60_000);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 });
  }

  try {
    const pool = getPool();
    const { rows: [user] } = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );
    if (!user?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription to manage.' },
        { status: 400 }
      );
    }

    const base = process.env.AUTH_URL || new URL(request.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${base}/dashboard/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[billing] portal error', e);
    return NextResponse.json({ error: 'Could not open the billing portal' }, { status: 500 });
  }
}
