import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const USERNAME_RE = /^[a-zA-Z0-9_.]{1,30}$/;

export async function POST(req: NextRequest) {
  try {
    const { username, platform = 'tiktok', display_name, avatar_url, followers, post_count } = await req.json();
    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }
    if (!['tiktok', 'instagram'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be tiktok or instagram' }, { status: 400 });
    }

    const clean = username.replace(/^@/, '');
    if (!USERNAME_RE.test(clean)) {
      return NextResponse.json({ error: 'invalid username format' }, { status: 400 });
    }

    const pool = getPool();

    // Insert the profile with metadata from search, or update empty fields if it already exists.
    // The daemon on Mac Mini will pick up profiles with last_scraped_at IS NULL.
    await pool.query(
      `INSERT INTO profiles (username, platform, display_name, avatar_url, followers, post_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username, platform) DO UPDATE SET
         display_name = COALESCE(NULLIF(profiles.display_name, ''), EXCLUDED.display_name),
         avatar_url = COALESCE(NULLIF(profiles.avatar_url, ''), EXCLUDED.avatar_url),
         followers = GREATEST(profiles.followers, EXCLUDED.followers),
         post_count = GREATEST(profiles.post_count, EXCLUDED.post_count)`,
      [clean, platform, display_name || null, avatar_url || null, followers || 0, post_count || 0]
    );

    // Read back from DB
    const { rows: [profile] } = await pool.query(
      'SELECT * FROM profiles WHERE username = $1 AND platform = $2',
      [clean, platform]
    );

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Could not find this profile. Check the username and try again.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, profile });
  } catch {
    return NextResponse.json({ error: 'Failed to track profile' }, { status: 500 });
  }
}
