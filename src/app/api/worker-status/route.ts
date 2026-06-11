import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { workerHealth } from '@/lib/worker-health';

export const dynamic = 'force-dynamic';

// Health of the Mac Mini scraper daemon. Public + minimal so uptime monitors can
// poll it. "alive" = a fresh heartbeat (process running); "healthy" also requires
// it isn't silently failing (recent scrapes aren't all errors).
export async function GET() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT worker_id, last_heartbeat_at, status FROM worker_heartbeats ORDER BY last_heartbeat_at DESC LIMIT 1'
    );
    const hb = rows[0];

    // Recent scrape outcomes drive the freshness signal.
    const { rows: scrapeRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'success')::int AS ok,
         COUNT(*) FILTER (WHERE status <> 'success')::int AS failed
       FROM scrape_log
       WHERE scraped_at > NOW() - INTERVAL '1 hour'`
    );
    const recentScrapes = { ok: scrapeRows[0]?.ok ?? 0, failed: scrapeRows[0]?.failed ?? 0 };

    const health = workerHealth(
      { lastHeartbeatAt: hb?.last_heartbeat_at ?? null, recentScrapes },
      Date.now()
    );

    return NextResponse.json({
      alive: health.alive,
      healthy: health.healthy,
      degraded: health.degraded,
      last_heartbeat_at: hb?.last_heartbeat_at ?? null,
      seconds_ago: health.secondsAgo,
      status: hb?.status ?? null,
      recent_scrapes: recentScrapes,
    });
  } catch {
    return NextResponse.json({ alive: false, healthy: false, error: 'status unavailable' }, { status: 200 });
  }
}
