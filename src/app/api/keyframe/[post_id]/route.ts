import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';
import { assertSafeUrl, UnsafeUrlError, THUMBNAIL_HOSTS } from '@/lib/ssrf';

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
      'SELECT keyframe_base64, thumbnail_url, s3_thumbnail_url FROM posts WHERE id = $1',
      [postId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { keyframe_base64, thumbnail_url, s3_thumbnail_url } = rows[0];

    if (keyframe_base64) {
      const buffer = Buffer.from(keyframe_base64, 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    }

    // Fallback: redirect to a thumbnail. Prefer our own re-hosted S3 copy, then
    // the raw CDN URL — but only after validating the target against an
    // allowlist, so a tampered/scraped URL can't turn this into an open redirect.
    const candidate = s3_thumbnail_url || thumbnail_url;
    if (candidate) {
      try {
        const safe = assertSafeUrl(String(candidate), THUMBNAIL_HOSTS);
        return NextResponse.redirect(safe.toString());
      } catch (e) {
        if (!(e instanceof UnsafeUrlError)) throw e;
        // fall through to 404 for a disallowed host
      }
    }

    return NextResponse.json({ error: 'No keyframe available' }, { status: 404 });
  } catch (e) {
    console.error('keyframe error:', e);
    return NextResponse.json({ error: 'Failed to fetch keyframe' }, { status: 500 });
  }
}
