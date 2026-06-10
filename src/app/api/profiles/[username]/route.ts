import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'instagram';

    const pool = getPool();
    const { rows: [profile] } = await pool.query(
      'SELECT * FROM profiles WHERE username = $1 AND platform = $2',
      [username, platform]
    );

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { rows: posts } = await pool.query(
      'SELECT * FROM posts WHERE profile_id = $1 ORDER BY viral_score DESC LIMIT 50',
      [profile.id]
    );

    // Hook type breakdown
    const { rows: hookTypes } = await pool.query(`
      SELECT p.hook_analysis->>'hook_type' AS hook_type, COUNT(*)::int AS count
      FROM posts p
      WHERE p.profile_id = $1 AND p.hook_analysis->>'hook_type' IS NOT NULL
      GROUP BY p.hook_analysis->>'hook_type'
      ORDER BY count DESC
    `, [profile.id]);

    // Viral score stats
    const { rows: [stats] } = await pool.query(`
      SELECT COUNT(*)::int AS total_posts,
             COUNT(CASE WHEN analyzed_at IS NOT NULL THEN 1 END)::int AS analyzed_posts,
             COALESCE(AVG(viral_score), 0) AS avg_viral,
             COALESCE(MAX(viral_score), 0) AS max_viral,
             COALESCE(AVG(views), 0) AS avg_views,
             COALESCE(MAX(views), 0) AS max_views,
             COUNT(CASE WHEN viral_score >= 2 THEN 1 END)::int AS viral_2x,
             COUNT(CASE WHEN viral_score >= 5 THEN 1 END)::int AS viral_5x
      FROM posts WHERE profile_id = $1
    `, [profile.id]);

    return NextResponse.json({ profile, posts, hook_types: hookTypes, stats });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);

    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'instagram';

    const pool = getPool();

    // Remove just the user-profile link; profile and posts remain for others / Hook Lab
    await pool.query(
      `DELETE FROM user_tracked_profiles
       WHERE user_id = $1 AND profile_id = (
         SELECT id FROM profiles WHERE username = $2 AND platform = $3
       )`,
      [userId, username, platform]
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to untrack profile' }, { status: 500 });
  }
}
