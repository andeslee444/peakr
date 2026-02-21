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
    const platform = searchParams.get('platform');

    const pool = getPool();
    const params: (string | number)[] = [userId];
    let paramIndex = 2;

    let query = `
      SELECT pr.*,
        CASE WHEN COUNT(p.id) > 0 THEN COUNT(p.id) ELSE pr.post_count END as post_count_actual,
        CASE WHEN COUNT(p.id) > 0 THEN AVG(p.views) ELSE pr.avg_views END as avg_views_calc,
        utp.tracked_at
      FROM profiles pr
      JOIN user_tracked_profiles utp ON utp.profile_id = pr.id AND utp.user_id = $1
      LEFT JOIN posts p ON p.profile_id = pr.id
    `;

    if (platform && platform !== 'all') {
      query += ` WHERE pr.platform = $${paramIndex++}`;
      params.push(platform);
    }
    query += ' GROUP BY pr.id, utp.tracked_at ORDER BY utp.tracked_at DESC';

    const { rows: profiles } = await pool.query(query, params);
    return NextResponse.json({ profiles });
  } catch {
    return NextResponse.json({ profiles: [], error: 'Failed to fetch profiles' }, { status: 500 });
  }
}
