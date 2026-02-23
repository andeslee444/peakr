import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const pool = getPool();

  // Top trending sounds by number of posts using them, with avg engagement
  const { rows } = await pool.query(`
    SELECT
      p.audio_name,
      p.audio_author,
      COUNT(*) as post_count,
      ROUND(AVG(p.views)::numeric) as avg_views,
      ROUND(AVG(p.viral_score)::numeric, 2) as avg_viral,
      MAX(p.views) as max_views,
      MAX(p.viral_score) as max_viral
    FROM posts p
    WHERE p.audio_name IS NOT NULL
      AND p.audio_name != ''
      AND p.scraped_at > NOW() - INTERVAL '30 days'
    GROUP BY p.audio_name, p.audio_author
    ORDER BY post_count DESC, avg_viral DESC
    LIMIT 20
  `);

  return NextResponse.json({ sounds: rows });
}
