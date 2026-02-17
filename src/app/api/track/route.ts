import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { username, platform = 'tiktok' } = await req.json();
    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }
    if (!['tiktok', 'instagram'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be tiktok or instagram' }, { status: 400 });
    }

    const clean = username.replace(/^@/, '');

    // Trigger the appropriate Python scraper
    const scraperModule = platform === 'instagram' ? 'scraper.instagram' : 'scraper.tiktok';
    try {
      execSync(
        `cd ${process.cwd()} && python3 -m ${scraperModule} ${clean}`,
        { timeout: 90000, stdio: 'pipe' }
      );
    } catch (e: any) {
      console.error('Scraper error:', e.stderr?.toString());
    }

    // Read back from DB
    const db = getDb();
    const profile = db.prepare('SELECT * FROM profiles WHERE username = ? AND platform = ?').get(clean, platform);

    return NextResponse.json({ success: true, profile });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
