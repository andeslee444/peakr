/**
 * TikTok URL parsing utilities.
 * Handles canonical URLs (@user/video/123) and short links (vm.tiktok.com).
 */

const TIKTOK_HOST_RE = /^(www\.)?tiktok\.com$/i;
const TIKTOK_SHORT_HOST_RE = /^vm\.tiktok\.com$/i;

/** Returns true if the string looks like a TikTok URL. */
export function isTikTokUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return TIKTOK_HOST_RE.test(url.hostname) || TIKTOK_SHORT_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

interface ParsedTikTok {
  username: string; // without @
  videoId: string;
}

/**
 * Extracts username + videoId from a canonical TikTok URL.
 * Returns null for short links — the caller should resolve those via oEmbed.
 *
 * Accepted formats:
 *   https://www.tiktok.com/@user/video/7123456789
 *   https://tiktok.com/@user/video/7123456789?query=...
 */
export function parseTikTokUrl(raw: string): ParsedTikTok | null {
  try {
    const url = new URL(raw.trim());

    // Short link — can't extract locally
    if (TIKTOK_SHORT_HOST_RE.test(url.hostname)) return null;

    const match = url.pathname.match(/^\/@([^/]+)\/video\/(\d+)/);
    if (!match) return null;

    return { username: match[1], videoId: match[2] };
  } catch {
    return null;
  }
}

/**
 * Extracts username + videoId from the canonical URL embedded in oEmbed HTML.
 * The `html` field contains an iframe whose `cite` attribute has the canonical URL.
 */
export function parseFromOEmbed(html: string, authorUrl: string): ParsedTikTok | null {
  // Try extracting from html cite attribute or src
  const citeMatch = html.match(/cite="https?:\/\/(?:www\.)?tiktok\.com\/@([^/]+)\/video\/(\d+)/);
  if (citeMatch) return { username: citeMatch[1], videoId: citeMatch[2] };

  // Fallback: try data-video-id or src in the embed
  const videoIdMatch = html.match(/\/video\/(\d+)/);
  const usernameMatch = authorUrl.match(/\/@([^/?]+)/);

  if (videoIdMatch && usernameMatch) {
    return { username: usernameMatch[1], videoId: videoIdMatch[1] };
  }

  return null;
}
