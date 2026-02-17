import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    if (!q) return NextResponse.json({ profiles: [], posts: [] });

    const db = getDb();
    const username = q.replace(/^@/, '');

    const profiles = db.prepare(`
      SELECT pr.*, COUNT(p.id) as post_count_actual,
             AVG(p.viral_score) as avg_viral,
             SUM(p.views) as total_views
      FROM profiles pr
      LEFT JOIN posts p ON p.profile_id = pr.id
      WHERE pr.username LIKE ?
      GROUP BY pr.id
      ORDER BY pr.followers DESC
      LIMIT 10
    `).all(`%${username}%`);

    return NextResponse.json({ profiles, found: profiles.length > 0 });
  } catch {
    return NextResponse.json({ profiles: [], found: false, error: 'Search failed' }, { status: 500 });
  }
}
