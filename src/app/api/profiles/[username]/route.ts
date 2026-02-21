import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);

    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'instagram';

    const pool = getPool();

    // Remove just the user-profile link; profile and posts remain for others / Hook Lab
    await pool.query(
      `DELETE FROM user_tracked_profiles
       WHERE user_id = $1 AND profile_id = (
         SELECT id FROM profiles WHERE username = $2 AND platform = $3
       )`,
      [userId, username, platform]
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to untrack profile' }, { status: 500 });
  }
}
