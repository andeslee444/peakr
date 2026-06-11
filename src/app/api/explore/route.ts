import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';
import { savedPostsClause } from '@/lib/saved-posts-sql';

export async function GET(request: NextRequest) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') || 'viral_score';
    const platform = searchParams.get('platform');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    const pool = getPool();

    let orderBy: string;
    switch (sort) {
      case 'views': orderBy = 'p.views DESC'; break;
      case 'recent': orderBy = 'p.posted_at DESC'; break;
      default: orderBy = 'p.viral_score DESC';
    }

    const params: (string | number)[] = [];
    let paramIndex = 1;

    // User-scoped is_saved (EXISTS) — never a fan-out join over per-user saved_posts.
    const saved = savedPostsClause(Number(userId), paramIndex);
    params.push(...saved.params);
    paramIndex = saved.nextIndex;

    let query = `
      SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name,
             ${saved.fragment}
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
    `;

    if (platform && platform !== 'all') {
      query += ` WHERE pr.platform = $${paramIndex++}`;
      params.push(platform);
    }
    query += ` ORDER BY ${orderBy} LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows: posts } = await pool.query(query, params);
    return NextResponse.json({ posts });
  } catch {
    return NextResponse.json({ posts: [], error: 'Failed to fetch posts' }, { status: 500 });
  }
}
