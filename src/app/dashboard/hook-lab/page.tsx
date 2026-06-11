'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Post, HookAnalysis } from '@/lib/types';
import { formatNumber, formatViralScore } from '@/lib/format';
import HookCard from '@/components/HookCard';
import HookFilters, { DEFAULT_FILTERS, hasActiveFilters, type HookFilterState } from '@/components/HookFilters';
import Link from 'next/link';
import HookStats from '@/components/HookStats';
import InsightsPanel from '@/components/InsightsPanel';

const PAGE_SIZE = 24;

export default function HookLabPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<HookFilterState>(DEFAULT_FILTERS);
  const [nicheSource, setNicheSource] = useState<'url' | 'profile' | null>(null);

  // Apply niche from URL params or user's profile
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nicheParam = params.get('niche');
    if (nicheParam) {
      setFilters(prev => ({ ...prev, niche: nicheParam }));
      setNicheSource('url');
    } else {
      fetch('/api/creator-profile')
        .then(res => res.json())
        .then(data => {
          if (data.profile?.niche) {
            setFilters(prev => ({ ...prev, niche: data.profile.niche }));
            setNicheSource('profile');
          }
        })
        .catch(() => {});
    }
  }, []);
  const [allFlipped, setAllFlipped] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Set<number>>(new Set());
  const [savingId, setSavingId] = useState<number | null>(null);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);

  // Trending sounds
  interface TrendingSound {
    audio_name: string;
    audio_author: string | null;
    post_count: number;
    avg_views: number;
    avg_viral: number;
    max_views: number;
    max_viral: number;
  }
  const [trendingSounds, setTrendingSounds] = useState<TrendingSound[]>([]);
  const [showAllSounds, setShowAllSounds] = useState(false);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosts, setComparePosts] = useState<Post[]>([]);
  const [showComparePanel, setShowComparePanel] = useState(false);

  // Esc closes the comparison modal (keyboard accessibility).
  useEffect(() => {
    if (!showComparePanel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowComparePanel(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showComparePanel]);

  const toggleCompare = (post: Post) => {
    setComparePosts(prev => {
      const exists = prev.find(p => p.id === post.id);
      if (exists) return prev.filter(p => p.id !== post.id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, post];
    });
  };

  // Fetch trending hooks + sounds
  useEffect(() => {
    fetch('/api/hook-lab/trending')
      .then(res => res.json())
      .then(data => { if (data.posts) setTrendingPosts(data.posts); })
      .catch(() => {});
    fetch('/api/hook-lab/trending-sounds')
      .then(res => res.json())
      .then(data => { if (data.sounds) setTrendingSounds(data.sounds); })
      .catch(() => {});
  }, []);

  const fetchPosts = useCallback(async (currentOffset: number, append: boolean) => {
    if (append) setLoadingMore(true); else { setLoading(true); setLoadError(false); }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(currentOffset));
      params.set('sort', filters.sort);
      params.set('analyzed_only', String(filters.analyzed_only));
      if (filters.hook_type) params.set('hook_type', filters.hook_type);
      if (filters.niche) params.set('niche', filters.niche);
      if (filters.hook_format) params.set('hook_format', filters.hook_format);
      if (filters.emotional_trigger) params.set('emotional_trigger', filters.emotional_trigger);
      if (filters.min_score) params.set('min_score', filters.min_score);
      if (filters.platform && filters.platform !== 'all') params.set('platform', filters.platform);
      if (filters.search) params.set('search', filters.search);

      const res = await fetch(`/api/hook-lab?${params}`);
      if (!res.ok) throw new Error(`hook-lab ${res.status}`);
      const data = await res.json();
      const fetchedPosts = data.posts || [];

      if (append) {
        setPosts(prev => [...prev, ...fetchedPosts]);
      } else {
        setPosts(fetchedPosts);
        // Populate saved state from is_hook_saved flag
        setSavedPostIds(new Set(
          fetchedPosts
            .filter((p: Post & { is_hook_saved?: boolean }) => p.is_hook_saved)
            .map((p: Post) => p.id)
        ));
      }
      setTotal(data.total || 0);
    } catch {
      if (!append) { setPosts([]); setLoadError(true); }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  // Fetch on filter change
  useEffect(() => {
    setOffset(0);
    fetchPosts(0, false);
  }, [fetchPosts]);

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchPosts(newOffset, true);
  };

  const saveHook = async (postId: number) => {
    setSavingId(postId);
    const alreadySaved = savedPostIds.has(postId);
    try {
      if (alreadySaved) {
        // Unsave via post_id — API handles the pattern lookup
        await fetch('/api/user-hooks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: postId }),
        });
        setSavedPostIds(prev => { const next = new Set(prev); next.delete(postId); return next; });
      } else {
        await fetch('/api/user-hooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: postId }),
        });
        setSavedPostIds(prev => new Set(prev).add(postId));
      }
    } catch { /* ignore */ }
    finally {
      setSavingId(null);
    }
  };

  const trackUser = async (username: string, platform: string) => {
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, platform }),
    });
  };

  const handlePostUpdate = useCallback((postId: number, updates: { hook_analysis: HookAnalysis; analyzed_at: string; transcript: string | null }) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p));
    setSelectedPost(prev => prev && prev.id === postId ? { ...prev, ...updates } : prev);
  }, []);

  const hasMore = posts.length < total;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hook Lab</h1>
          <p className="text-gray-600 mt-1">Study viral hooks, filter by type, and steal templates for your content</p>
        </div>
        <button
          onClick={() => { setCompareMode(m => !m); if (compareMode) { setComparePosts([]); setShowComparePanel(false); } }}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
            compareMode ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          {compareMode ? 'Exit Compare' : 'Compare'}
        </button>
      </div>

      {/* Trending This Week */}
      {trendingPosts.length > 0 && (
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <h2 className="text-lg font-semibold text-gray-900">Trending This Week</h2>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {trendingPosts.map(post => {
              const analysis = post.hook_analysis as HookAnalysis | null;
              return (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="flex-shrink-0 w-56 bg-gray-50 rounded-xl p-3 hover:bg-indigo-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {analysis?.hook_type && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
                        {analysis.hook_type}
                      </span>
                    )}
                    {analysis?.hook_score && (
                      <span className="text-[10px] font-bold text-amber-600">{analysis.hook_score}/10</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2 font-medium">
                    &ldquo;{analysis?.hook_text || post.description?.slice(0, 80) || 'Untitled'}&rdquo;
                  </p>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span>@{post.username}</span>
                    <span className="font-semibold text-indigo-600">{post.viral_score ? `${post.viral_score.toFixed(1)}x` : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Trending Sounds */}
      {trendingSounds.length > 0 && (
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎵</span>
              <h2 className="text-lg font-semibold text-gray-900">Trending Sounds</h2>
              <span className="text-xs text-gray-400 ml-1">Last 30 days</span>
            </div>
            {trendingSounds.length > 6 && (
              <button
                onClick={() => setShowAllSounds(s => !s)}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                {showAllSounds ? 'Show less' : `View all (${trendingSounds.length})`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(showAllSounds ? trendingSounds : trendingSounds.slice(0, 6)).map((sound, idx) => (
              <div
                key={`${sound.audio_name}-${idx}`}
                className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 hover:bg-indigo-50 transition-colors"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{sound.audio_name}</p>
                  {sound.audio_author && (
                    <p className="text-xs text-gray-500 truncate">{sound.audio_author}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-gray-900">{sound.post_count}</p>
                  <p className="text-[10px] text-gray-400">posts</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-semibold text-indigo-600">{formatNumber(sound.avg_views)}</p>
                  <p className="text-[10px] text-gray-400">avg views</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Niche filter banner */}
      {nicheSource === 'profile' && filters.niche && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <p className="text-sm text-indigo-700">
            Showing hooks in your niche: <span className="font-semibold capitalize">{filters.niche}</span>
          </p>
          <button
            onClick={() => { setFilters(prev => ({ ...prev, niche: '' })); setNicheSource(null); }}
            className="text-sm text-indigo-500 hover:text-indigo-700 font-medium"
          >
            Show all
          </button>
        </div>
      )}

      <HookStats />

      <HookFilters
        filters={filters}
        onChange={setFilters}
        onFlipAll={() => setAllFlipped(f => !f)}
        allFlipped={allFlipped}
      />

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          <p className="mt-4 text-gray-500">Loading hooks...</p>
        </div>
      ) : loadError ? (
        <div className="text-center py-16">
          <span className="text-6xl">⚠️</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Couldn&apos;t load hooks</h3>
          <p className="mt-2 text-gray-600">Something went wrong fetching hooks. This is on us, not you.</p>
          <button
            onClick={() => fetchPosts(0, false)}
            className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-6xl">🪝</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No hooks found</h3>
          <p className="mt-2 text-gray-600">
            {hasActiveFilters(filters)
              ? 'No hooks match your current filters.'
              : 'Track some accounts and the scraper will start analyzing their hooks automatically.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {hasActiveFilters(filters) && (
              <button
                onClick={() => { setFilters(DEFAULT_FILTERS); setNicheSource(null); }}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Clear filters
              </button>
            )}
            <Link
              href="/dashboard/tracked"
              className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Track accounts
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {posts.map(post => {
              const isSelected = comparePosts.some(p => p.id === post.id);
              return (
                <div key={post.id} className="relative">
                  {compareMode && (
                    <button
                      onClick={() => toggleCompare(post)}
                      className={`absolute top-2 right-2 z-30 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'bg-white/90 text-gray-400 hover:bg-indigo-100 hover:text-indigo-600 shadow'
                      }`}
                    >
                      {isSelected ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-sm font-bold">+</span>
                      )}
                    </button>
                  )}
                  {compareMode && isSelected && (
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-indigo-500 z-20 pointer-events-none" />
                  )}
                  <HookCard
                    post={post}
                    flipped={allFlipped ? true : undefined}
                    isSaved={savedPostIds.has(post.id)}
                    onSave={saveHook}
                    onTrack={trackUser}
                    onInfoClick={compareMode ? () => toggleCompare(post) : setSelectedPost}
                    savingId={savingId}
                  />
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Loading...
                  </span>
                ) : (
                  `Load More (${posts.length} of ${total})`
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Compare floating bar */}
      {compareMode && comparePosts.length > 0 && !showComparePanel && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl border border-gray-200 px-5 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            {comparePosts.map(p => (
              <div key={p.id} className="flex items-center gap-1 bg-indigo-50 rounded-lg px-2 py-1">
                <span className="text-xs font-medium text-indigo-700 truncate max-w-[100px]">@{p.username}</span>
                <button onClick={() => toggleCompare(p)} aria-label={`Remove @${p.username} from comparison`} className="text-indigo-400 hover:text-indigo-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {comparePosts.length < 3 && (
              <span className="text-xs text-gray-400">Select up to {3 - comparePosts.length} more</span>
            )}
          </div>
          <button
            onClick={() => setShowComparePanel(true)}
            disabled={comparePosts.length < 2}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Compare ({comparePosts.length})
          </button>
        </div>
      )}

      {/* Comparison panel */}
      {showComparePanel && comparePosts.length >= 2 && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Hook comparison"
          onClick={() => setShowComparePanel(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900">Hook Comparison</h2>
              <button
                onClick={() => setShowComparePanel(false)}
                aria-label="Close comparison"
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className={`grid gap-4 ${comparePosts.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {comparePosts.map(post => {
                  const a = post.hook_analysis as HookAnalysis | null;
                  return (
                    <div key={post.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      {/* Creator header */}
                      <div className="bg-gray-50 px-4 py-3 flex items-center gap-2 border-b border-gray-100">
                        <span className="text-xs">{post.platform === 'instagram' ? '📸' : '🎵'}</span>
                        <span className="text-sm font-medium text-gray-900">@{post.username}</span>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 border-b border-gray-100">
                        <div className="p-3 text-center border-r border-gray-100">
                          <p className="text-lg font-bold text-gray-900">{formatViralScore(post.viral_score)}</p>
                          <p className="text-[10px] text-gray-500">Viral Score</p>
                        </div>
                        <div className="p-3 text-center border-r border-gray-100">
                          <p className="text-lg font-bold text-gray-900">{formatNumber(post.views)}</p>
                          <p className="text-[10px] text-gray-500">Views</p>
                        </div>
                        <div className="p-3 text-center">
                          <p className="text-lg font-bold text-gray-900">{a?.hook_score || '-'}<span className="text-xs text-gray-400">/10</span></p>
                          <p className="text-[10px] text-gray-500">Hook Score</p>
                        </div>
                      </div>

                      {/* Analysis */}
                      <div className="p-4 space-y-3">
                        {/* Hook type */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Hook Type</p>
                          {a?.hook_type ? (
                            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
                              {a.hook_type}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Not analyzed</span>
                          )}
                        </div>

                        {/* Hook template */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Template</p>
                          <p className="text-sm text-gray-800 font-medium leading-relaxed">
                            {a?.hook_template || 'No template'}
                          </p>
                        </div>

                        {/* Opening words */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Opening Words</p>
                          <p className="text-xs text-gray-700 italic">
                            {a?.hook_text ? `"${a.hook_text}"` : '-'}
                          </p>
                        </div>

                        {/* Why it works */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Why It Works</p>
                          <p className="text-xs text-gray-600">
                            {a?.hook_explanation || '-'}
                          </p>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1">
                          {a?.emotional_trigger && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-600">
                              {a.emotional_trigger}
                            </span>
                          )}
                          {a?.hook_format && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {a.hook_format}
                            </span>
                          )}
                          {a?.niche && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">
                              {a.niche}
                            </span>
                          )}
                        </div>

                        {/* Engagement */}
                        <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs text-gray-500">
                          <span>❤️ {formatNumber(post.likes)}</span>
                          <span>💬 {formatNumber(post.comments)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <InsightsPanel
        post={selectedPost}
        open={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        onPostUpdate={handlePostUpdate}
        isSaved={selectedPost ? savedPostIds.has(selectedPost.id) : false}
        onSave={saveHook}
      />
    </div>
  );
}
