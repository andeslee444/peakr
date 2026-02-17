import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface FolderRow {
  folder: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder');

    const db = getDb();
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
      query += ' WHERE sp.folder = ?';
      params.push(folder);
    }
    query += ' ORDER BY sp.saved_at DESC';

    const saved = db.prepare(query).all(...params);
    const folders = db.prepare('SELECT DISTINCT folder FROM saved_posts ORDER BY folder').all() as FolderRow[];

    return NextResponse.json({ saved, folders: folders.map(f => f.folder) });
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

    const db = getDb();
    const result = db.prepare(
      'INSERT INTO saved_posts (post_id, folder, notes) VALUES (?, ?, ?)'
    ).run(post_id, folder, notes);

    return NextResponse.json({ id: Number(result.lastInsertRowid) });
  } catch {
    return NextResponse.json({ error: 'Failed to save post' }, { status: 500 });
  }
}
