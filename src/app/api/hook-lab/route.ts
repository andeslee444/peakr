import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hookType = searchParams.get('hook_type');
    const niche = searchParams.get('niche');
    const hookFormat = searchParams.get('hook_format');
    const emotionalTrigger = searchParams.get('emotional_trigger');
    const minScore = searchParams.get('min_score');
    const platform = searchParams.get('platform');
    const sort = searchParams.get('sort') || 'viral_score';
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10) || 24, 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;
    const analyzedOnly = searchParams.get('analyzed_only') !== 'false';

    const pool = getPool();
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (analyzedOnly) {
      conditions.push('p.analyzed_at IS NOT NULL');
    }

    if (hookType) {
      conditions.push(`p.hook_analysis->>'hook_type' = $${paramIndex++}`);
      params.push(hookType);
    }
    if (niche) {
      conditions.push(`p.hook_analysis->>'niche' = $${paramIndex++}`);
      params.push(niche);
    }
    if (hookFormat) {
      conditions.push(`p.hook_analysis->>'hook_format' = $${paramIndex++}`);
      params.push(hookFormat);
    }
    if (emotionalTrigger) {
      conditions.push(`p.hook_analysis->>'emotional_trigger' = $${paramIndex++}`);
      params.push(emotionalTrigger);
    }
    if (minScore) {
      conditions.push(`(p.hook_analysis->>'hook_score')::int >= $${paramIndex++}`);
      params.push(parseInt(minScore, 10));
    }
    if (platform && platform !== 'all') {
      conditions.push(`pr.platform = $${paramIndex++}`);
      params.push(platform);
    }
    if (search) {
      conditions.push(`(pr.username ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    let orderBy: string;
    switch (sort) {
      case 'views': orderBy = 'p.views DESC'; break;
      case 'recent': orderBy = 'p.posted_at DESC NULLS LAST'; break;
      case 'hook_score': orderBy = "(p.hook_analysis->>'hook_score')::int DESC NULLS LAST"; break;
      default: orderBy = 'p.viral_score DESC';
    }

    // Count total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      ${whereClause}
    `;
    const { rows: countRows } = await pool.query(countQuery, params);
    const total = parseInt(countRows[0].total, 10);

    // Fetch posts
    const query = `
      SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name,
             (sp.id IS NOT NULL) AS is_saved
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      LEFT JOIN saved_posts sp ON sp.post_id = p.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(limit, offset);

    const { rows: posts } = await pool.query(query, params);
    return NextResponse.json({ posts, total });
  } catch (e) {
    console.error('hook-lab error:', e);
    return NextResponse.json({ posts: [], total: 0, error: 'Failed to fetch posts' }, { status: 500 });
  }
}
