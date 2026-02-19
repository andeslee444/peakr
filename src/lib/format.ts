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

/** Proxy Instagram CDN images through our API to avoid hotlink blocking */
export function proxyImg(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes('cdninstagram') || url.includes('instagram')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
