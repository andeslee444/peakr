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
