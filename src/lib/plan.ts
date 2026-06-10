/** Subscription plan model + gating helpers. */
export type Plan = 'free' | 'pro';

export const FREE_TRACK_LIMIT = 5;
export const PRO_TRACK_LIMIT = 50;

export function normalizePlan(plan: unknown): Plan {
  return plan === 'pro' ? 'pro' : 'free';
}

export function isPro(plan: unknown): boolean {
  return normalizePlan(plan) === 'pro';
}

/** How many accounts a user on this plan may track. */
export function trackLimit(plan: unknown): number {
  return isPro(plan) ? PRO_TRACK_LIMIT : FREE_TRACK_LIMIT;
}
