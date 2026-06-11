import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getPool } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { handleStripeEvent } from '@/lib/billing-events';

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
    await handleStripeEvent(event, getPool());
  } catch (e) {
    console.error('[billing] webhook handler error', e);
    // Return 200 so Stripe doesn't retry indefinitely on a non-signature error.
  }

  return NextResponse.json({ received: true });
}
