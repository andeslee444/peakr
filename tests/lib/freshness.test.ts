import { describe, it, expect } from 'vitest';
import { formatFreshness } from '@/lib/format';

const NOW = new Date('2026-06-10T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('formatFreshness', () => {
  it('says "Fetching…" before the first scrape', () => {
    expect(formatFreshness(null, NOW)).toBe('Fetching…');
  });

  it('says "just now" for very recent scrapes', () => {
    expect(formatFreshness(ago(30 * 1000), NOW)).toBe('Updated just now');
  });

  it('renders minutes / hours / days ago', () => {
    expect(formatFreshness(ago(5 * 60_000), NOW)).toBe('Updated 5m ago');
    expect(formatFreshness(ago(3 * 3600_000), NOW)).toBe('Updated 3h ago');
    expect(formatFreshness(ago(2 * 86_400_000), NOW)).toBe('Updated 2d ago');
  });

  it('flags stale data (older than the 4h SLA)', () => {
    expect(formatFreshness(ago(9 * 3600_000), NOW, { staleAfterMs: 4 * 3600_000 }).endsWith('· stale')).toBe(true);
  });
});
