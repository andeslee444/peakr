import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT sh.*, p.hook_analysis, p.description, p.views, p.likes, p.viral_score,
           p.post_url, p.thumbnail_url,
           pr.username, pr.platform, pr.avatar_url
    FROM saved_hooks sh
    JOIN posts p ON sh.post_id = p.id
    JOIN profiles pr ON p.profile_id = pr.id
    WHERE sh.user_id = $1
    ORDER BY sh.saved_at DESC
  `, [userId]);

  return NextResponse.json({ hooks: rows });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const { post_id, notes } = await request.json();

  if (!post_id) {
    return NextResponse.json({ error: 'post_id required' }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `INSERT INTO saved_hooks (user_id, post_id, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, post_id) DO UPDATE SET notes = COALESCE($3, saved_hooks.notes)`,
    [userId, post_id, notes || null]
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const { post_id } = await request.json();

  if (!post_id) {
    return NextResponse.json({ error: 'post_id required' }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    'DELETE FROM saved_hooks WHERE user_id = $1 AND post_id = $2',
    [userId, post_id]
  );

  return NextResponse.json({ success: true });
}
