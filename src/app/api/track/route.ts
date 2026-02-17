import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { getDb } from '@/lib/db';

const USERNAME_RE = /^[a-zA-Z0-9_.]{1,30}$/;

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
    if (!USERNAME_RE.test(clean)) {
      return NextResponse.json({ error: 'invalid username format' }, { status: 400 });
    }

    // Trigger the appropriate Python scraper
    const scraperModule = platform === 'instagram' ? 'scraper.instagram' : 'scraper.tiktok';
    try {
      execFileSync('python3', ['-m', scraperModule, clean], {
        timeout: 90000,
        stdio: 'pipe',
        cwd: process.cwd(),
      });
    } catch (e: unknown) {
      const stderr = e instanceof Error && 'stderr' in e ? (e as NodeJS.ErrnoException & { stderr?: Buffer }).stderr : null;
      console.error('Scraper error:', stderr?.toString());
    }

    // Read back from DB
    const db = getDb();
    const profile = db.prepare('SELECT * FROM profiles WHERE username = ? AND platform = ?').get(clean, platform);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Could not find this profile. Check the username and try again.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, profile });
  } catch {
    return NextResponse.json({ error: 'Failed to track profile' }, { status: 500 });
  }
}
