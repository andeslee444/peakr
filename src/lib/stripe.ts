import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/** Returns a Stripe client, or null when STRIPE_SECRET_KEY is unset (billing off). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}
