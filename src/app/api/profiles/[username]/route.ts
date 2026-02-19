import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'instagram';

    const pool = getPool();
    const { rows: [profile] } = await pool.query(
      'SELECT * FROM profiles WHERE username = $1 AND platform = $2',
      [username, platform]
    );

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { rows: posts } = await pool.query(
      'SELECT * FROM posts WHERE profile_id = $1 ORDER BY viral_score DESC LIMIT 50',
      [profile.id]
    );

    return NextResponse.json({ profile, posts });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'instagram';

    const pool = getPool();
    const { rows: [profile] } = await pool.query(
      'SELECT id FROM profiles WHERE username = $1 AND platform = $2',
      [username, platform]
    );

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await pool.query('DELETE FROM saved_posts WHERE post_id IN (SELECT id FROM posts WHERE profile_id = $1)', [profile.id]);
    await pool.query('DELETE FROM scrape_log WHERE profile_id = $1', [profile.id]);
    await pool.query('DELETE FROM posts WHERE profile_id = $1', [profile.id]);
    await pool.query('DELETE FROM profiles WHERE id = $1', [profile.id]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
  }
}
