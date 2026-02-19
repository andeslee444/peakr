/**
 * Instagram URL parsing utilities.
 * Accepts Reel URLs (/reel/, /reels/) and post URLs (/p/) since
 * Instagram often serves Reels under /p/ paths too.
 */

const INSTAGRAM_HOST_RE = /^(www\.)?instagram\.com$/i;

/** Returns true if the string looks like an Instagram post/reel URL. */
export function isInstagramReelUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (!INSTAGRAM_HOST_RE.test(url.hostname)) return false;
    return /^\/(reel|reels|p)\/[A-Za-z0-9_-]+/.test(url.pathname);
  } catch {
    return false;
  }
}

interface ParsedInstagramReel {
  shortcode: string;
}

/**
 * Extracts the shortcode from an Instagram post/reel URL.
 *
 * Accepted formats:
 *   https://www.instagram.com/reel/ABC123xyz/
 *   https://instagram.com/reels/ABC123xyz/?query=...
 *   https://www.instagram.com/p/ABC123xyz/
 */
export function parseInstagramReelUrl(raw: string): ParsedInstagramReel | null {
  try {
    const url = new URL(raw.trim());
    if (!INSTAGRAM_HOST_RE.test(url.hostname)) return null;

    const match = url.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
    if (!match) return null;

    return { shortcode: match[2] };
  } catch {
    return null;
  }
}
