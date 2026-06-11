import { NextResponse } from 'next/server';
import { auth } from './auth';
import { getPool } from './db';
import { normalizePlan, isPro, type Plan } from './plan';

/**
 * Returns the authenticated user's numeric id, or null if there is no session.
 * Use with {@link unauthorized} at the top of every API route that touches
 * user-owned data:
 *
 *   const userId = await getUserId();
 *   if (userId === null) return unauthorized();
 */
export async function getUserId(): Promise<number | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? Number(id) : null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Read the user's current (live) subscription plan from the DB. */
export async function getUserPlan(userId: number): Promise<Plan> {
  const pool = getPool();
  const { rows: [u] } = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
  return normalizePlan(u?.plan);
}

/** 402 response steering a free user to upgrade. */
export function upgradeRequired(message = 'This feature requires the Pro plan.'): NextResponse {
  return NextResponse.json({ error: message, upgrade: true }, { status: 402 });
}

/**
 * Gate a route behind Pro. Returns an `upgradeRequired()` response for free
 * users, or `null` to proceed.
 *
 *   const gate = await requirePro(userId, 'Exporting is a Pro feature.');
 *   if (gate) return gate;
 */
export async function requirePro(userId: number, message?: string): Promise<NextResponse | null> {
  const plan = await getUserPlan(userId);
  return isPro(plan) ? null : upgradeRequired(message);
}
