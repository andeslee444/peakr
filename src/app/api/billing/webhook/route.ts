import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getPool } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

// Stripe needs the raw request body to verify the signature.
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const pool = getPool();
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = Number(session.metadata?.userId || session.client_reference_id);
      const customer = typeof session.customer === 'string' ? session.customer : null;
      if (userId) {
        await pool.query(
          'UPDATE users SET plan = $1, stripe_customer_id = COALESCE($2, stripe_customer_id) WHERE id = $3',
          ['pro', customer, userId]
        );
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const customer = typeof sub.customer === 'string' ? sub.customer : null;
      if (customer) {
        await pool.query("UPDATE users SET plan = 'free' WHERE stripe_customer_id = $1", [customer]);
      }
    }
  } catch (e) {
    console.error('[billing] webhook handler error', e);
    // Return 200 so Stripe doesn't retry indefinitely on a non-signature error.
  }

  return NextResponse.json({ received: true });
}
