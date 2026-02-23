import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);

  try {
    const pool = getPool();

    // All overview stats scoped to user's tracked profiles
    const { rows: [overview] } = await pool.query(`
      SELECT
        COUNT(DISTINCT utp.profile_id) as total_accounts,
        COUNT(p.id) as total_posts,
        COALESCE(AVG(p.viral_score), 0) as avg_viral_score,
        COALESCE(MAX(p.viral_score), 0) as top_viral_score,
        COALESCE(SUM(p.views), 0) as total_views,
        COUNT(CASE WHEN p.viral_score >= 100 THEN 1 END) as viral_post_count
      FROM user_tracked_profiles utp
      LEFT JOIN posts p ON p.profile_id = utp.profile_id
      WHERE utp.user_id = $1
    `, [userId]);

    // Per-account stats scoped to user's tracked profiles
    const { rows: accountStats } = await pool.query(`
      SELECT pr.username, pr.platform, pr.followers, pr.avatar_url, pr.display_name,
             COUNT(p.id) as post_count,
             COALESCE(AVG(p.views), 0) as avg_views,
             COALESCE(AVG(p.viral_score), 0) as avg_viral_score,
             COALESCE(MAX(p.viral_score), 0) as max_viral_score,
             COALESCE(SUM(p.views), 0) as total_views,
             CASE WHEN SUM(p.views) > 0
               THEN LEAST(CAST(SUM(p.likes) AS REAL) / SUM(p.views) * 100, 100)
               ELSE 0 END as engagement_rate
      FROM user_tracked_profiles utp
      JOIN profiles pr ON pr.id = utp.profile_id
      LEFT JOIN posts p ON p.profile_id = pr.id
      WHERE utp.user_id = $1
      GROUP BY pr.id
      ORDER BY avg_viral_score DESC
    `, [userId]);

    // Top posts scoped to user's tracked profiles
    const { rows: topPosts } = await pool.query(`
      SELECT p.id, p.views, p.viral_score, p.post_url, pr.username, pr.platform, pr.avatar_url
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      JOIN user_tracked_profiles utp ON utp.profile_id = pr.id
      WHERE utp.user_id = $1
      ORDER BY p.viral_score DESC
      LIMIT 10
    `, [userId]);

    // Posting schedule: day-of-week and hour-of-day heatmap with viral correlation
    const { rows: scheduleByDay } = await pool.query(`
      SELECT EXTRACT(DOW FROM p.posted_at)::int AS day,
             COUNT(*)::int AS count,
             COALESCE(AVG(p.viral_score), 0) AS avg_viral
      FROM posts p
      JOIN user_tracked_profiles utp ON utp.profile_id = p.profile_id
      WHERE utp.user_id = $1 AND p.posted_at IS NOT NULL
      GROUP BY day ORDER BY day
    `, [userId]);

    const { rows: scheduleByHour } = await pool.query(`
      SELECT EXTRACT(HOUR FROM p.posted_at)::int AS hour,
             COUNT(*)::int AS count,
             COALESCE(AVG(p.viral_score), 0) AS avg_viral
      FROM posts p
      JOIN user_tracked_profiles utp ON utp.profile_id = p.profile_id
      WHERE utp.user_id = $1 AND p.posted_at IS NOT NULL
      GROUP BY hour ORDER BY hour
    `, [userId]);

    return NextResponse.json({
      overview: {
        totalAccounts: Number(overview.total_accounts),
        totalPosts: Number(overview.total_posts),
        avgViralScore: Number(overview.avg_viral_score) || 0,
        topViralScore: Number(overview.top_viral_score) || 0,
        totalViews: Number(overview.total_views) || 0,
        viralPostCount: Number(overview.viral_post_count),
      },
      accountStats,
      topPosts,
      schedule: {
        byDay: scheduleByDay,
        byHour: scheduleByHour,
      },
    });
  } catch {
    return NextResponse.json({
      error: 'Failed to fetch analytics',
      overview: { totalAccounts: 0, totalPosts: 0, avgViralScore: 0, topViralScore: 0, totalViews: 0, viralPostCount: 0 },
      accountStats: [],
      topPosts: [],
    }, { status: 500 });
  }
}
