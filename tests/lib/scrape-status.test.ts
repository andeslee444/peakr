import { describe, it, expect } from 'vitest';
import { profileScrapeState, isAnalysisPending, isAnalyzed } from '@/lib/scrape-status';

describe('profileScrapeState', () => {
  it('is "scraping" before the first scrape (daemon will fetch)', () => {
    expect(profileScrapeState({ last_scraped_at: null }, 0)).toBe('scraping');
  });
  it('is "ready" once scraped with posts', () => {
    expect(profileScrapeState({ last_scraped_at: '2026-06-10T00:00:00Z' }, 12)).toBe('ready');
  });
  it('is "empty" only after a scrape returned no posts', () => {
    expect(profileScrapeState({ last_scraped_at: '2026-06-10T00:00:00Z' }, 0)).toBe('empty');
  });
});

describe('isAnalysisPending', () => {
  it('true for the queued pending marker with no result yet', () => {
    expect(isAnalysisPending({ analyzed_at: null, hook_analysis: { status: 'pending' } as never })).toBe(true);
  });
  it('false once analyzed', () => {
    expect(isAnalysisPending({ analyzed_at: '2026-06-10T00:00:00Z', hook_analysis: { status: 'pending' } as never })).toBe(false);
  });
  it('false when there is no analysis at all', () => {
    expect(isAnalysisPending({ analyzed_at: null, hook_analysis: null })).toBe(false);
  });
});

describe('isAnalyzed', () => {
  it('true only with a real result + analyzed_at', () => {
    expect(isAnalyzed({ analyzed_at: '2026-06-10T00:00:00Z', hook_analysis: { hook_type: 'x' } as never })).toBe(true);
  });
  it('false for the pending marker even if analyzed_at somehow set (regression: showed "Analyzed" with blank hook)', () => {
    expect(isAnalyzed({ analyzed_at: null, hook_analysis: { status: 'pending' } as never })).toBe(false);
  });
  it('false when unanalyzed', () => {
    expect(isAnalyzed({ analyzed_at: null, hook_analysis: null })).toBe(false);
  });
});
