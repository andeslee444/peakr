import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface ProfileRow {
  id: number;
  username: string;
  platform: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  followers: number;
  following: number;
  total_likes: number;
  post_count: number;
  avg_views: number;
  last_scraped_at: string | null;
  created_at: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'instagram';

    const db = getDb();
    const profile = db.prepare(
      'SELECT * FROM profiles WHERE username = ? AND platform = ?'
    ).get(username, platform) as ProfileRow | undefined;

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const posts = db.prepare(
      'SELECT * FROM posts WHERE profile_id = ? ORDER BY viral_score DESC LIMIT 50'
    ).all(profile.id);

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

    const db = getDb();
    const profile = db.prepare(
      'SELECT id FROM profiles WHERE username = ? AND platform = ?'
    ).get(username, platform) as { id: number } | undefined;

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Delete related data, then the profile
    db.prepare('DELETE FROM saved_posts WHERE post_id IN (SELECT id FROM posts WHERE profile_id = ?)').run(profile.id);
    db.prepare('DELETE FROM scrape_log WHERE profile_id = ?').run(profile.id);
    db.prepare('DELETE FROM posts WHERE profile_id = ?').run(profile.id);
    db.prepare('DELETE FROM profiles WHERE id = ?').run(profile.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
  }
}
