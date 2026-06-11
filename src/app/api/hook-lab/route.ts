import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { savedPostsClause } from '@/lib/saved-posts-sql';
import { stripHeavyFields } from '@/lib/post-list';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ? Number(session.user.id) : null;

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

    // Only show posts from seed creators or user-tracked profiles
    conditions.push(`(
      EXISTS (SELECT 1 FROM seed_creators sc WHERE sc.username = pr.username AND sc.platform = pr.platform AND sc.is_active = TRUE)
      OR EXISTS (SELECT 1 FROM user_tracked_profiles utp WHERE utp.profile_id = pr.id)
    )`);

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

    // Fetch posts. User-scoped is_saved (EXISTS) — never a fan-out join over
    // per-user saved_posts, which would duplicate rows and desync from COUNT(*).
    const saved = savedPostsClause(userId, paramIndex);
    params.push(...saved.params);
    paramIndex = saved.nextIndex;

    const isHookSavedSubquery = userId
      ? `, EXISTS (
            SELECT 1 FROM hook_pattern_posts hpp
            JOIN user_saved_patterns usp ON usp.pattern_id = hpp.pattern_id
            WHERE hpp.post_id = p.id AND usp.user_id = $${paramIndex++}
          ) AS is_hook_saved`
      : ', false AS is_hook_saved';
    if (userId) params.push(userId);

    const query = `
      SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name,
             ${saved.fragment}
             ${isHookSavedSubquery}
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(limit, offset);

    const { rows: posts } = await pool.query(query, params);
    return NextResponse.json({ posts: stripHeavyFields(posts), total });
  } catch (e) {
    console.error('hook-lab error:', e);
    return NextResponse.json({ posts: [], total: 0, error: 'Failed to fetch posts' }, { status: 500 });
  }
}
