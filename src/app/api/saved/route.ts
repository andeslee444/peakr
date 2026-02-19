import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder');

    const pool = getPool();
    let query = `
      SELECT sp.*, p.views, p.likes, p.comments, p.shares, p.viral_score,
             p.thumbnail_url, p.post_url, p.description, p.posted_at,
             pr.username, pr.platform, pr.avatar_url
      FROM saved_posts sp
      JOIN posts p ON sp.post_id = p.id
      JOIN profiles pr ON p.profile_id = pr.id
    `;
    const params: string[] = [];
    if (folder && folder !== 'All') {
      query += ' WHERE sp.folder = $1';
      params.push(folder);
    }
    query += ' ORDER BY sp.saved_at DESC';

    const { rows: saved } = await pool.query(query, params);
    const { rows: folderRows } = await pool.query('SELECT DISTINCT folder FROM saved_posts ORDER BY folder');

    return NextResponse.json({ saved, folders: folderRows.map((f: { folder: string }) => f.folder) });
  } catch {
    return NextResponse.json({ saved: [], folders: [], error: 'Failed to fetch saved posts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { post_id, folder = 'default', notes = '' } = body;

    if (!post_id) {
      return NextResponse.json({ error: 'post_id required' }, { status: 400 });
    }

    const pool = getPool();
    const { rows: [row] } = await pool.query(
      'INSERT INTO saved_posts (post_id, folder, notes) VALUES ($1, $2, $3) RETURNING id',
      [post_id, folder, notes]
    );

    return NextResponse.json({ id: row.id });
  } catch {
    return NextResponse.json({ error: 'Failed to save post' }, { status: 500 });
  }
}
