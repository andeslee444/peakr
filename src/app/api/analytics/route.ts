import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface CountRow { count: number }
interface AvgRow { avg: number | null; max: number | null }
interface TotalRow { total: number | null }

export async function GET() {
  try {
    const db = getDb();

    const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM profiles').get() as CountRow;
    const totalPosts = db.prepare('SELECT COUNT(*) as count FROM posts').get() as CountRow;
    const avgViral = db.prepare('SELECT AVG(viral_score) as avg, MAX(viral_score) as max FROM posts').get() as AvgRow;
    const totalViews = db.prepare('SELECT SUM(views) as total FROM posts').get() as TotalRow;
    const viralPosts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE viral_score >= 100').get() as CountRow;

    // Per-account stats
    const accountStats = db.prepare(`
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
    `).all();

    // Top performing posts
    const topPosts = db.prepare(`
      SELECT p.*, pr.username, pr.platform, pr.avatar_url
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      ORDER BY p.viral_score DESC
      LIMIT 10
    `).all();

    return NextResponse.json({
      overview: {
        totalAccounts: totalAccounts.count,
        totalPosts: totalPosts.count,
        avgViralScore: avgViral.avg || 0,
        topViralScore: avgViral.max || 0,
        totalViews: totalViews.total || 0,
        viralPostCount: viralPosts.count,
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
