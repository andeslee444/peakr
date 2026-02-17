import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') || 'viral_score';
    const platform = searchParams.get('platform');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

    const db = getDb();

    let orderBy: string;
    switch (sort) {
      case 'views': orderBy = 'p.views DESC'; break;
      case 'recent': orderBy = 'p.posted_at DESC'; break;
      default: orderBy = 'p.viral_score DESC';
    }

    let query = `
      SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
    `;
    const params: string[] = [];
    if (platform && platform !== 'all') {
      query += ' WHERE pr.platform = ?';
      params.push(platform);
    }
    query += ` ORDER BY ${orderBy} LIMIT ?`;
    params.push(String(limit));

    const posts = db.prepare(query).all(...params);
    return NextResponse.json({ posts });
  } catch {
    return NextResponse.json({ posts: [], error: 'Failed to fetch posts' }, { status: 500 });
  }
}
