import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';

export async function GET(request: Request) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder');

    const pool = getPool();
    let query = `
      SELECT sp.*, p.views, p.likes, p.comments, p.shares, p.viral_score,
             p.thumbnail_url, p.post_url, p.description, p.posted_at,
             p.transcript, p.hook_analysis, p.analyzed_at,
             pr.username, pr.platform, pr.avatar_url
      FROM saved_posts sp
      JOIN posts p ON sp.post_id = p.id
      JOIN profiles pr ON p.profile_id = pr.id
      WHERE sp.user_id = $1
    `;
    const params: Array<string | number> = [userId];
    if (folder && folder !== 'All') {
      query += ' AND sp.folder = $2';
      params.push(folder);
    }
    query += ' ORDER BY sp.saved_at DESC';

    const { rows: saved } = await pool.query(query, params);
    const { rows: folderRows } = await pool.query(
      'SELECT DISTINCT folder FROM saved_posts WHERE user_id = $1 ORDER BY folder',
      [userId]
    );

    return NextResponse.json({ saved, folders: folderRows.map((f: { folder: string }) => f.folder) });
  } catch {
    return NextResponse.json({ saved: [], folders: [], error: 'Failed to fetch saved posts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();
  try {
    const body = await request.json();
    const { post_id, folder = 'default', notes = '' } = body;

    if (!post_id) {
      return NextResponse.json({ error: 'post_id required' }, { status: 400 });
    }

    const pool = getPool();
    const { rows: [row] } = await pool.query(
      `INSERT INTO saved_posts (user_id, post_id, folder, notes) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, post_id) DO UPDATE SET folder = EXCLUDED.folder, notes = EXCLUDED.notes
       RETURNING id`,
      [userId, post_id, folder, notes]
    );

    return NextResponse.json({ id: row.id });
  } catch {
    return NextResponse.json({ error: 'Failed to save post' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();
  try {
    const { post_id } = await request.json();
    if (!post_id) {
      return NextResponse.json({ error: 'post_id required' }, { status: 400 });
    }
    const pool = getPool();
    await pool.query('DELETE FROM saved_posts WHERE post_id = $1 AND user_id = $2', [post_id, userId]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to unsave post' }, { status: 500 });
  }
}
