import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: { post_id: string } }
) {
  if ((await getUserId()) === null) return unauthorized();
  const postId = parseInt(params.post_id, 10);
  if (isNaN(postId)) {
    return NextResponse.json({ error: 'Invalid post_id' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT keyframe_base64, thumbnail_url FROM posts WHERE id = $1',
      [postId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { keyframe_base64, thumbnail_url } = rows[0];

    if (keyframe_base64) {
      const buffer = Buffer.from(keyframe_base64, 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    }

    // Fallback: redirect to thumbnail
    if (thumbnail_url) {
      return NextResponse.redirect(thumbnail_url);
    }

    return NextResponse.json({ error: 'No keyframe available' }, { status: 404 });
  } catch (e) {
    console.error('keyframe error:', e);
    return NextResponse.json({ error: 'Failed to fetch keyframe' }, { status: 500 });
  }
}
