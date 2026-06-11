import { describe, it, expect } from 'vitest';
import { workerHealth } from '@/lib/worker-health';

const NOW = new Date('2026-06-10T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('workerHealth', () => {
  it('is dead with no heartbeat', () => {
    const h = workerHealth({ lastHeartbeatAt: null }, NOW);
    expect(h.alive).toBe(false);
    expect(h.healthy).toBe(false);
  });

  it('is alive + healthy with a fresh heartbeat and no scrape sample', () => {
    const h = workerHealth({ lastHeartbeatAt: ago(30_000) }, NOW);
    expect(h.alive).toBe(true);
    expect(h.degraded).toBe(false);
    expect(h.healthy).toBe(true);
  });

  it('is alive but DEGRADED when recent scrapes are all failing (green heartbeat, no fresh data)', () => {
    const h = workerHealth({ lastHeartbeatAt: ago(30_000), recentScrapes: { ok: 0, failed: 6 } }, NOW);
    expect(h.alive).toBe(true);
    expect(h.degraded).toBe(true);
    expect(h.healthy).toBe(false);
  });

  it('is healthy when some recent scrapes succeed', () => {
    const h = workerHealth({ lastHeartbeatAt: ago(30_000), recentScrapes: { ok: 2, failed: 4 } }, NOW);
    expect(h.degraded).toBe(false);
    expect(h.healthy).toBe(true);
  });

  it('does not flag degraded on a tiny sample (one failure is not a trend)', () => {
    const h = workerHealth({ lastHeartbeatAt: ago(30_000), recentScrapes: { ok: 0, failed: 1 } }, NOW);
    expect(h.degraded).toBe(false);
  });

  it('is not alive once the heartbeat is stale', () => {
    const h = workerHealth({ lastHeartbeatAt: ago(10 * 60_000) }, NOW);
    expect(h.alive).toBe(false);
    expect(h.healthy).toBe(false);
  });
});
