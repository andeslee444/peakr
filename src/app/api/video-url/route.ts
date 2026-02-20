import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { execFile } from 'child_process';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const pool = getPool();

    // Check cache (1-hour TTL)
    const { rows: cached } = await pool.query(
      'SELECT video_url, expires_at FROM video_url_cache WHERE post_url = $1 AND expires_at > NOW()',
      [url]
    );
    if (cached.length > 0) {
      return NextResponse.json({ video_url: cached[0].video_url, expires_at: cached[0].expires_at });
    }

    // Cache miss — run yt-dlp
    const videoUrl = await new Promise<string>((resolve, reject) => {
      execFile('yt-dlp', ['--get-url', '-f', 'best[ext=mp4]/best', url], { timeout: 5000 }, (err, stdout, stderr) => {
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
      [url, videoUrl, expiresAt]
    );

    return NextResponse.json({ video_url: videoUrl, expires_at: expiresAt });
  } catch (e) {
    console.error('video-url error:', e);
    return NextResponse.json({ error: 'Failed to resolve video URL' }, { status: 404 });
  }
}
