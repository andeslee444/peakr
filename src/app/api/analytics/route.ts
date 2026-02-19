import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  try {
    const pool = getPool();

    const { rows: [{ count: totalAccounts }] } = await pool.query('SELECT COUNT(*) as count FROM profiles');
    const { rows: [{ count: totalPosts }] } = await pool.query('SELECT COUNT(*) as count FROM posts');
    const { rows: [{ avg: avgViral, max: maxViral }] } = await pool.query('SELECT AVG(viral_score) as avg, MAX(viral_score) as max FROM posts');
    const { rows: [{ total: totalViews }] } = await pool.query('SELECT SUM(views) as total FROM posts');
    const { rows: [{ count: viralPosts }] } = await pool.query('SELECT COUNT(*) as count FROM posts WHERE viral_score >= 100');

    const { rows: accountStats } = await pool.query(`
      SELECT pr.username, pr.platform, pr.followers, pr.avatar_url, pr.display_name,
             COUNT(p.id) as post_count,
             COALESCE(AVG(p.views), 0) as avg_views,
             COALESCE(AVG(p.viral_score), 0) as avg_viral_score,
             COALESCE(MAX(p.viral_score), 0) as max_viral_score,
             COALESCE(SUM(p.views), 0) as total_views,
             CASE WHEN SUM(p.views) > 0
               THEN CAST(SUM(p.likes) AS REAL) / SUM(p.views) * 100
               ELSE 0 END as engagement_rate
      FROM profiles pr
      LEFT JOIN posts p ON p.profile_id = pr.id
      GROUP BY pr.id
      ORDER BY avg_viral_score DESC
    `);

    const { rows: topPosts } = await pool.query(`
      SELECT p.*, pr.username, pr.platform, pr.avatar_url
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      ORDER BY p.viral_score DESC
      LIMIT 10
    `);

    return NextResponse.json({
      overview: {
        totalAccounts: Number(totalAccounts),
        totalPosts: Number(totalPosts),
        avgViralScore: Number(avgViral) || 0,
        topViralScore: Number(maxViral) || 0,
        totalViews: Number(totalViews) || 0,
        viralPostCount: Number(viralPosts),
      },
      accountStats,
      topPosts,
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
