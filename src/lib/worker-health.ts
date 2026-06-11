/**
 * Decide scraper health from its heartbeat + recent scrape outcomes.
 *
 * `alive` is liveness (the process is heart-beating). `healthy` additionally
 * requires that it isn't silently failing — a green heartbeat while every recent
 * scrape errors (e.g. the IP got blocked) is "alive but degraded", which a
 * liveness-only check would miss.
 */
export const HEARTBEAT_STALE_AFTER_MS = 5 * 60_000;
const MIN_SCRAPE_SAMPLE = 3; // need a few attempts before calling a trend

export interface WorkerHealthInput {
  lastHeartbeatAt: string | null;
  recentScrapes?: { ok: number; failed: number };
}

export interface WorkerHealth {
  alive: boolean;
  degraded: boolean;
  healthy: boolean;
  secondsAgo: number | null;
}

export function workerHealth(input: WorkerHealthInput, nowMs: number): WorkerHealth {
  if (!input.lastHeartbeatAt) {
    return { alive: false, degraded: false, healthy: false, secondsAgo: null };
  }
  const ageMs = nowMs - new Date(input.lastHeartbeatAt).getTime();
  const alive = ageMs <= HEARTBEAT_STALE_AFTER_MS;

  const ok = input.recentScrapes?.ok ?? 0;
  const failed = input.recentScrapes?.failed ?? 0;
  const total = ok + failed;
  // Degraded: heart is beating but a meaningful sample of recent scrapes all failed.
  const degraded = alive && total >= MIN_SCRAPE_SAMPLE && ok === 0;

  return {
    alive,
    degraded,
    healthy: alive && !degraded,
    secondsAgo: Math.round(ageMs / 1000),
  };
}
