import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if ((await getUserId()) === null) return unauthorized();
  try {
    const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total_analyzed,
        AVG((hook_analysis->>'hook_score')::int) as avg_score
      FROM posts
      WHERE analyzed_at IS NOT NULL AND hook_analysis IS NOT NULL
    `);

    const totalAnalyzed = parseInt(rows[0].total_analyzed, 10);
    const avgScore = rows[0].avg_score ? parseFloat(rows[0].avg_score).toFixed(1) : '0';

    // Hook type counts
    const { rows: hookTypes } = await pool.query(`
      SELECT hook_analysis->>'hook_type' as hook_type, COUNT(*) as count,
             AVG((hook_analysis->>'hook_score')::int) as avg_score
      FROM posts
      WHERE analyzed_at IS NOT NULL AND hook_analysis IS NOT NULL
      GROUP BY hook_analysis->>'hook_type'
      ORDER BY count DESC
    `);

    // Niche counts
    const { rows: niches } = await pool.query(`
      SELECT hook_analysis->>'niche' as niche, COUNT(*) as count
      FROM posts
      WHERE analyzed_at IS NOT NULL AND hook_analysis IS NOT NULL
        AND hook_analysis->>'niche' IS NOT NULL
      GROUP BY hook_analysis->>'niche'
      ORDER BY count DESC
    `);

    const hookTypeCounts = hookTypes.map(r => ({
      hook_type: r.hook_type,
      count: parseInt(r.count, 10),
      avg_score: parseFloat(r.avg_score).toFixed(1),
    }));

    const nicheCounts = niches.map(r => ({
      niche: r.niche,
      count: parseInt(r.count, 10),
    }));

    return NextResponse.json({
      total_analyzed: totalAnalyzed,
      avg_score: avgScore,
      top_hook_type: hookTypeCounts[0] || null,
      top_niche: nicheCounts[0] || null,
      hook_type_counts: hookTypeCounts,
      niche_counts: nicheCounts,
    });
  } catch (e) {
    console.error('hook-lab stats error:', e);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
