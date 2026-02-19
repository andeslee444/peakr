import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const USERNAME_RE = /^[a-zA-Z0-9_.]{1,30}$/;

export async function POST(req: NextRequest) {
  try {
    const { username, platform = 'tiktok' } = await req.json();
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

    // Insert the profile (or do nothing if it already exists).
    // The daemon on Mac Mini will pick up profiles with last_scraped_at IS NULL.
    await pool.query(
      `INSERT INTO profiles (username, platform) VALUES ($1, $2) ON CONFLICT (username, platform) DO NOTHING`,
      [clean, platform]
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
