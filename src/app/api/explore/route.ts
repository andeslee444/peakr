import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'peakr.db');

export async function GET() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json([]);
    }
    const db = new Database(DB_PATH, { readonly: true });
    const content = db.prepare(`
      SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name
      FROM posts p
      JOIN profiles pr ON p.profile_id = pr.id
      ORDER BY p.viral_score DESC
      LIMIT 20
    `).all();
    db.close();
    return NextResponse.json(content);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
