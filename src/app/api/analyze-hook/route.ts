import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { post_id } = await request.json();

    if (!post_id) {
      return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
    }

    const pool = getPool();

    // Verify the post exists and is a video
    const { rows: [post] } = await pool.query(
      'SELECT id, post_url, analyzed_at FROM posts WHERE id = $1',
      [post_id]
    );

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (!post.post_url) {
      return NextResponse.json({ error: 'Post has no URL' }, { status: 400 });
    }

    if (post.analyzed_at) {
      // Already analyzed — return existing analysis
      const { rows: [existing] } = await pool.query(
        'SELECT transcript, hook_analysis, analyzed_at FROM posts WHERE id = $1',
        [post_id]
      );
      return NextResponse.json({ status: 'already_analyzed', ...existing });
    }

    // Queue the post for analysis by marking it with a special flag
    // The actual analysis happens on the Mac Mini via the Python scraper
    // We set a placeholder to signal "analysis requested"
    await pool.query(
      "UPDATE posts SET hook_analysis = '{\"status\": \"pending\"}' WHERE id = $1 AND analyzed_at IS NULL",
      [post_id]
    );

    return NextResponse.json({ status: 'queued', post_id });
  } catch {
    return NextResponse.json({ error: 'Failed to queue analysis' }, { status: 500 });
  }
}
