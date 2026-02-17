import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
    ).get(username, platform) as any;

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const posts = db.prepare(
      'SELECT * FROM posts WHERE profile_id = ? ORDER BY viral_score DESC LIMIT 50'
    ).all(profile.id);

    return NextResponse.json({ profile, posts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
