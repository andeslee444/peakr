export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export function formatViralScore(n: number | null | undefined): string {
  if (n == null) return '0x';
  return n >= 10 ? Math.round(n) + 'x' : n.toFixed(1) + 'x';
}

/** Human freshness label for a profile's last_scraped_at, with an optional
 *  "stale" flag once it's older than the refresh SLA. */
export function formatFreshness(
  lastScrapedAt: string | null | undefined,
  now: number = Date.now(),
  opts: { staleAfterMs?: number } = {}
): string {
  if (!lastScrapedAt) return 'Fetching…';
  const ageMs = now - new Date(lastScrapedAt).getTime();
  let label: string;
  if (ageMs < 60_000) label = 'Updated just now';
  else if (ageMs < 3_600_000) label = `Updated ${Math.floor(ageMs / 60_000)}m ago`;
  else if (ageMs < 86_400_000) label = `Updated ${Math.floor(ageMs / 3_600_000)}h ago`;
  else label = `Updated ${Math.floor(ageMs / 86_400_000)}d ago`;
  if (opts.staleAfterMs && ageMs > opts.staleAfterMs) label += ' · stale';
  return label;
}

/** Proxy Instagram CDN images through our API to avoid hotlink blocking.
 *  Prefers S3 URL when available (permanent, no proxying needed). */
export function proxyImg(url: string | null | undefined, s3Url?: string | null): string | undefined {
  if (s3Url) return s3Url;
  if (!url) return undefined;
  if (url.includes('cdninstagram') || url.includes('instagram')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
