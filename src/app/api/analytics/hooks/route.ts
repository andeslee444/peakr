import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  try {
    const pool = getPool();

    // Hook type distribution with avg viral score
    const { rows: distribution } = await pool.query(`
      SELECT
        hook_analysis->>'hook_type' as hook_type,
        COUNT(*) as count,
        AVG(viral_score) as avg_viral_score,
        AVG((hook_analysis->>'hook_score')::int) as avg_hook_score
      FROM posts
      WHERE analyzed_at IS NOT NULL AND hook_analysis IS NOT NULL
      GROUP BY hook_analysis->>'hook_type'
      ORDER BY count DESC
    `);

    // Top hooks by score
    const { rows: topHooks } = await pool.query(`
      SELECT
        p.id,
        p.hook_analysis->>'hook_type' as hook_type,
        (p.hook_analysis->>'hook_score')::int as hook_score,
        p.hook_analysis->>'hook_text' as hook_text,
        p.hook_analysis->>'hook_explanation' as hook_explanation,
        p.viral_score,
        p.views,
        p.post_url,
        pr.username,
        pr.platform
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      WHERE p.analyzed_at IS NOT NULL AND p.hook_analysis IS NOT NULL
      ORDER BY (p.hook_analysis->>'hook_score')::int DESC, p.viral_score DESC
      LIMIT 10
    `);

    // Overall stats
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) as total_analyzed,
        AVG((hook_analysis->>'hook_score')::int) as avg_hook_score,
        AVG(viral_score) as avg_viral_score
      FROM posts
      WHERE analyzed_at IS NOT NULL AND hook_analysis IS NOT NULL
    `);

    return NextResponse.json({
      distribution,
      topHooks,
      stats: {
        totalAnalyzed: parseInt(stats?.total_analyzed || '0'),
        avgHookScore: parseFloat(stats?.avg_hook_score || '0'),
        avgViralScore: parseFloat(stats?.avg_viral_score || '0'),
      },
    });
  } catch {
    return NextResponse.json({ distribution: [], topHooks: [], stats: { totalAnalyzed: 0, avgHookScore: 0, avgViralScore: 0 } }, { status: 500 });
  }
}
