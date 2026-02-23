import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  try {
    const pool = getPool();

    // Get the most recent date with daily_top_hooks data
    const { rows: dateRows } = await pool.query(
      'SELECT MAX(date) as latest FROM daily_top_hooks'
    );
    const latestDate = dateRows[0]?.latest;

    if (!latestDate) {
      // Fallback: return recently analyzed posts with high scores
      const { rows: posts } = await pool.query(`
        SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name
        FROM posts p
        JOIN profiles pr ON p.profile_id = pr.id
        WHERE p.analyzed_at IS NOT NULL
          AND p.hook_analysis IS NOT NULL
          AND (p.hook_analysis->>'hook_score')::int >= 7
        ORDER BY p.analyzed_at DESC, p.viral_score DESC
        LIMIT 8
      `);
      return NextResponse.json({ posts, source: 'recent' });
    }

    // Get top hooks from the most recent date
    const { rows: posts } = await pool.query(`
      SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name,
             dth.rank
      FROM daily_top_hooks dth
      JOIN posts p ON p.id = dth.post_id
      JOIN profiles pr ON p.profile_id = pr.id
      WHERE dth.date = $1
      ORDER BY dth.rank ASC
      LIMIT 8
    `, [latestDate]);

    return NextResponse.json({ posts, date: latestDate, source: 'daily_top_hooks' });
  } catch (e) {
    console.error('trending error:', e);
    return NextResponse.json({ posts: [], error: 'Failed to fetch trending' }, { status: 500 });
  }
}
