import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Liveness of the Mac Mini scraper daemon. Public + minimal so uptime monitors
// can poll it. "alive" means a heartbeat within the staleness window.
const STALE_AFTER_MS = 5 * 60_000;

export async function GET() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT worker_id, last_heartbeat_at, status FROM worker_heartbeats ORDER BY last_heartbeat_at DESC LIMIT 1'
    );
    const hb = rows[0];
    if (!hb) {
      return NextResponse.json({ alive: false, last_heartbeat_at: null });
    }
    const ageMs = Date.now() - new Date(hb.last_heartbeat_at).getTime();
    return NextResponse.json({
      alive: ageMs <= STALE_AFTER_MS,
      last_heartbeat_at: hb.last_heartbeat_at,
      seconds_ago: Math.round(ageMs / 1000),
      status: hb.status ?? null,
    });
  } catch {
    return NextResponse.json({ alive: false, error: 'status unavailable' }, { status: 200 });
  }
}
