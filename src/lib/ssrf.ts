/**
 * SSRF protection for server-side fetches of caller-supplied URLs.
 *
 * Defense in depth: (1) https only, (2) reject IP-literal hosts (blocks
 * skip-DNS attacks on internal addresses like the cloud metadata endpoint),
 * (3) require the hostname to match an explicit allowlist of suffixes. Because
 * only known platform/CDN domains are permitted, requests can never be steered
 * at internal infrastructure even via DNS games against unrelated domains.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4
  if (h.includes(':')) return true; // IPv6
  return false;
}

/**
 * Validate a caller-supplied URL against an allowlist of host suffixes.
 * Returns the parsed URL on success; throws {@link UnsafeUrlError} otherwise.
 *
 * A suffix `instagram.com` matches `instagram.com` and `*.instagram.com`, but
 * not `instagram.com.evil.com` or `evilinstagram.com`.
 */
export function assertSafeUrl(rawUrl: string, allowedHostSuffixes: string[]): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }

  if (u.protocol !== 'https:') {
    throw new UnsafeUrlError(`Disallowed scheme: ${u.protocol}`);
  }

  const host = u.hostname.toLowerCase();
  if (isIpLiteral(host)) {
    throw new UnsafeUrlError('IP-literal hosts are not allowed');
  }

  const allowed = allowedHostSuffixes.some(
    (s) => host === s || host.endsWith('.' + s)
  );
  if (!allowed) {
    throw new UnsafeUrlError(`Host not allowed: ${host}`);
  }

  return u;
}

/** Hosts permitted for Instagram image/thumbnail proxying. */
export const INSTAGRAM_IMAGE_HOSTS = [
  'cdninstagram.com',
  'fbcdn.net',
  'instagram.com',
];

/** Hosts permitted for video-URL resolution (post pages handed to yt-dlp). */
export const VIDEO_SOURCE_HOSTS = [
  'tiktok.com',
  'instagram.com',
];

/**
 * Hosts permitted as a `keyframe` redirect target: Instagram + TikTok image
 * CDNs, plus our own S3 bucket (re-hosted thumbnails). Prevents the keyframe
 * fallback from 302-ing the browser to an arbitrary scraped URL.
 */
export const THUMBNAIL_HOSTS = [
  // Instagram / Facebook CDNs
  'cdninstagram.com',
  'fbcdn.net',
  'instagram.com',
  // TikTok / ByteDance CDNs
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'ibyteimg.com',
  'byteimg.com',
  'muscdn.com',
  // Our own re-hosted thumbnails
  'amazonaws.com',
];
