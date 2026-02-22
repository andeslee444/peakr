import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const body = await request.json();
  const { user_hook_id, post_id } = body;

  if (!user_hook_id || !post_id) {
    return NextResponse.json({ error: 'user_hook_id and post_id are required' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify ownership
    const { rows: [hook] } = await client.query(
      'SELECT id FROM user_hooks WHERE id = $1 AND user_id = $2',
      [user_hook_id, userId]
    );

    if (!hook) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }

    // Delete the example
    await client.query(
      'DELETE FROM user_hook_examples WHERE user_hook_id = $1 AND post_id = $2',
      [user_hook_id, post_id]
    );

    // Check if any examples remain
    const { rows: [count] } = await client.query(
      'SELECT COUNT(*)::int AS cnt FROM user_hook_examples WHERE user_hook_id = $1',
      [user_hook_id]
    );

    if (count.cnt === 0) {
      // No more examples — delete the hook too
      await client.query('DELETE FROM user_hooks WHERE id = $1', [user_hook_id]);
    }

    await client.query('COMMIT');

    return NextResponse.json({ success: true, hook_deleted: count.cnt === 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('user-hooks example DELETE error:', err);
    return NextResponse.json({ error: 'Failed to remove example' }, { status: 500 });
  } finally {
    client.release();
  }
}
