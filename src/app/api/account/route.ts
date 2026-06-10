import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';

// Delete the authenticated user and all of their data (GDPR/CCPA + TikTok review).
export async function DELETE() {
  const userId = await getUserId();
  if (userId === null) return unauthorized();

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Tables whose FKs lack ON DELETE CASCADE must be cleared before the user row;
    // the rest cascade from the final delete.
    await client.query('DELETE FROM saved_hooks WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM playbook_sections WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM creator_profiles WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM saved_posts WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[account] delete failed', e);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  } finally {
    client.release();
  }
}
