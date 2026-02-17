import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');

    const db = getDb();
    let query = `
      SELECT pr.*, COUNT(p.id) as post_count_actual, AVG(p.views) as avg_views_calc
      FROM profiles pr
      LEFT JOIN posts p ON p.profile_id = pr.id
    `;
    const params: string[] = [];
    if (platform && platform !== 'all') {
      query += ' WHERE pr.platform = ?';
      params.push(platform);
    }
    query += ' GROUP BY pr.id ORDER BY pr.last_scraped_at DESC';

    const profiles = db.prepare(query).all(...params);
    return NextResponse.json({ profiles });
  } catch {
    return NextResponse.json({ profiles: [], error: 'Failed to fetch profiles' }, { status: 500 });
  }
}
