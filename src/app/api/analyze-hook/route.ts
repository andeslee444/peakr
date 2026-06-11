import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';
import { DAILY_MANUAL_ANALYSIS_CAP } from '@/lib/analysis-limits';

export async function POST(request: Request) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();

  try {
    const { post_id } = await request.json();
    if (!post_id) {
      return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
    }

    const pool = getPool();

    // Ownership: the post must belong to a profile this user actually tracks.
    // (Also avoids leaking the existence of posts the user can't see.)
    const { rows: [post] } = await pool.query(
      `SELECT p.id, p.post_url, p.analyzed_at, p.hook_analysis
       FROM posts p
       JOIN user_tracked_profiles utp ON utp.profile_id = p.profile_id
       WHERE p.id = $1 AND utp.user_id = $2`,
      [post_id, userId]
    );

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    if (!post.post_url) {
      return NextResponse.json({ error: 'Post has no URL' }, { status: 400 });
    }

    if (post.analyzed_at) {
      const { rows: [existing] } = await pool.query(
        'SELECT transcript, hook_analysis, analyzed_at FROM posts WHERE id = $1',
        [post_id]
      );
      return NextResponse.json({ status: 'already_analyzed', ...existing });
    }

    // Already queued: a prior request flagged this post pending but the daemon
    // hasn't finished yet (so analyzed_at is still null). Re-requesting must be a
    // no-op — otherwise reopening the post inserts another analysis_requests row
    // and silently burns a second unit of the user's daily cap.
    if (post.hook_analysis && typeof post.hook_analysis === 'object' && post.hook_analysis.status === 'pending') {
      return NextResponse.json({ status: 'queued', post_id, alreadyQueued: true });
    }

    // Per-user daily cap on the (paid) manual analysis pipeline.
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM analysis_requests
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
      [userId]
    );
    if (count >= DAILY_MANUAL_ANALYSIS_CAP) {
      return NextResponse.json(
        { error: 'Daily analysis limit reached. Try again tomorrow.' },
        { status: 429 }
      );
    }

    // Record the request and flag the post for the Mac Mini daemon to pick up.
    await pool.query(
      'INSERT INTO analysis_requests (user_id, post_id) VALUES ($1, $2)',
      [userId, post_id]
    );
    await pool.query(
      "UPDATE posts SET hook_analysis = '{\"status\": \"pending\"}' WHERE id = $1 AND analyzed_at IS NULL",
      [post_id]
    );

    return NextResponse.json({ status: 'queued', post_id });
  } catch {
    return NextResponse.json({ error: 'Failed to queue analysis' }, { status: 500 });
  }
}
