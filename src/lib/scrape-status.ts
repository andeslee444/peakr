import type { Post, Profile } from './types';

/**
 * Helpers for distinguishing "still being fetched" from "genuinely empty",
 * so the first session doesn't look broken while the daemon catches up.
 */
export type ScrapeState = 'scraping' | 'ready' | 'empty';

/** First-scrape state for a tracked profile. */
export function profileScrapeState(profile: Pick<Profile, 'last_scraped_at'>, postCount: number): ScrapeState {
  if (!profile.last_scraped_at) return 'scraping'; // daemon hasn't fetched it yet
  return postCount > 0 ? 'ready' : 'empty'; // scraped, but really has no posts
}

type AnalyzableLike = { analyzed_at: Post['analyzed_at']; hook_analysis: Post['hook_analysis'] };

/** The post carries the queued "pending" marker but no result yet. */
export function isAnalysisPending(post: AnalyzableLike): boolean {
  if (post.analyzed_at) return false;
  const ha = post.hook_analysis as { status?: string } | null;
  return ha?.status === 'pending';
}

/**
 * The post has a *real* hook analysis. Guards against the pending marker
 * (`{status:'pending'}`), which is truthy and used to render a bogus
 * "Analyzed ✓" badge over a blank hook.
 */
export function isAnalyzed(post: AnalyzableLike): boolean {
  if (!post.analyzed_at) return false;
  const ha = post.hook_analysis as { status?: string } | null;
  return !!ha && ha.status !== 'pending';
}
