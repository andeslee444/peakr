import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10) || 24, 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const pool = getPool();

    // Count
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as total FROM posts p
       JOIN profiles pr ON p.profile_id = pr.id
       JOIN user_tracked_profiles utp ON utp.profile_id = pr.id AND utp.user_id = $1
       WHERE ($2 = 'all' OR pr.platform = $2)`,
      [userId, platform]
    );
    const total = parseInt(countRows[0].total, 10);

    // Posts
    const { rows: posts } = await pool.query(
      `SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name
       FROM posts p
       JOIN profiles pr ON p.profile_id = pr.id
       JOIN user_tracked_profiles utp ON utp.profile_id = pr.id AND utp.user_id = $1
       WHERE ($2 = 'all' OR pr.platform = $2)
       ORDER BY p.viral_score DESC
       LIMIT $3 OFFSET $4`,
      [userId, platform, limit, offset]
    );

    return NextResponse.json({ posts, total });
  } catch {
    return NextResponse.json({ posts: [], total: 0, error: 'Failed to fetch tracked posts' }, { status: 500 });
  }
}
