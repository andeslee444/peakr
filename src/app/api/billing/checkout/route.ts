import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getUserId, unauthorized } from '@/lib/api-auth';
import { enforceRateLimitFor } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();

  const limited = enforceRateLimitFor(`checkout:${userId}`, 10, 60_000);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 });
  }

  const { plan } = await request.json().catch(() => ({ plan: 'monthly' }));
  const priceId = plan === 'annual' ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
  if (!priceId) {
    return NextResponse.json({ error: 'Selected plan is not available' }, { status: 503 });
  }

  try {
    const pool = getPool();
    const { rows: [user] } = await pool.query(
      'SELECT email, stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    const base = process.env.AUTH_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer: user?.stripe_customer_id || undefined,
      customer_email: user?.stripe_customer_id ? undefined : user?.email || undefined,
      client_reference_id: String(userId),
      metadata: { userId: String(userId) },
      success_url: `${base}/dashboard?upgraded=1`,
      cancel_url: `${base}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[billing] checkout error', e);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }
}
