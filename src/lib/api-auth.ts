import { NextResponse } from 'next/server';
import { auth } from './auth';

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
