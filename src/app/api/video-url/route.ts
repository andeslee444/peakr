import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { assertSafeUrl, UnsafeUrlError, VIDEO_SOURCE_HOSTS } from '@/lib/ssrf';
import { execFile } from 'child_process';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let safe: URL;
  try {
    safe = assertSafeUrl(url, VIDEO_SOURCE_HOSTS);
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
    }
    throw e;
  }
  const safeUrl = safe.toString();

  try {
    const pool = getPool();

    // Check cache (1-hour TTL)
    const { rows: cached } = await pool.query(
      'SELECT video_url, expires_at FROM video_url_cache WHERE post_url = $1 AND expires_at > NOW()',
      [safeUrl]
    );
    if (cached.length > 0) {
      return NextResponse.json({ video_url: cached[0].video_url, expires_at: cached[0].expires_at });
    }

    // Cache miss — run yt-dlp on the validated URL
    const videoUrl = await new Promise<string>((resolve, reject) => {
      execFile('yt-dlp', ['--get-url', '-f', 'best[ext=mp4]/best', safeUrl], { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        const result = stdout.trim().split('\n')[0];
        if (!result) {
          reject(new Error('No URL returned'));
          return;
        }
        resolve(result);
      });
    });

    // Cache for 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await pool.query(
      `INSERT INTO video_url_cache (post_url, video_url, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_url) DO UPDATE SET video_url = $2, expires_at = $3`,
      [safeUrl, videoUrl, expiresAt]
    );

    return NextResponse.json({ video_url: videoUrl, expires_at: expiresAt });
  } catch (e) {
    console.error('video-url error:', e);
    return NextResponse.json({ error: 'Failed to resolve video URL' }, { status: 404 });
  }
}
