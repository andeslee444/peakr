import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

// List notifications (most recent first, max 20)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const pool = getPool();

  try {
    const { rows: notifications } = await pool.query(
      `SELECT id, type, title, body, link, read_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );

    return NextResponse.json({ notifications, unread_count: count });
  } catch (err) {
    console.error('notifications GET error:', err);
    return NextResponse.json({ notifications: [], unread_count: 0 });
  }
}

// Mark notifications as read
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const body = await request.json();
  const { notification_ids, mark_all } = body;

  const pool = getPool();

  try {
    if (mark_all) {
      await pool.query(
        `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
        [userId]
      );
    } else if (notification_ids && Array.isArray(notification_ids) && notification_ids.length > 0) {
      await pool.query(
        `UPDATE notifications SET read_at = NOW() WHERE id = ANY($1) AND user_id = $2 AND read_at IS NULL`,
        [notification_ids, userId]
      );
    } else {
      return NextResponse.json({ error: 'notification_ids or mark_all required' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('notifications PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
