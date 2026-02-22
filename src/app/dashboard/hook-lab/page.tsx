'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Post, HookAnalysis } from '@/lib/types';
import HookCard from '@/components/HookCard';
import HookFilters, { DEFAULT_FILTERS, type HookFilterState } from '@/components/HookFilters';
import HookStats from '@/components/HookStats';
import InsightsPanel from '@/components/InsightsPanel';

const PAGE_SIZE = 24;

export default function HookLabPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<HookFilterState>(DEFAULT_FILTERS);
  const [allFlipped, setAllFlipped] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [savedPostIds, setSavedPostIds] = useState<Set<number>>(new Set());
  const [savingId, setSavingId] = useState<number | null>(null);

  const fetchPosts = useCallback(async (currentOffset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);

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
      if (!append) setPosts([]);
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
        // Find the user_hook that contains this post and unsave
        // We need to remove via the example endpoint
        // First get the user_hook_id for this post
        const hooksRes = await fetch('/api/user-hooks');
        const hooksData = await hooksRes.json();
        const hooks = hooksData.hooks || [];
        // Find which hook has this post as an example
        let targetHookId: number | null = null;
        for (const hook of hooks) {
          if (hook.example_thumbnails?.some((ex: { post_id: number }) => ex.post_id === postId)) {
            targetHookId = hook.id;
            break;
          }
          if (hook.top_example?.post_id === postId) {
            targetHookId = hook.id;
            break;
          }
        }
        if (targetHookId) {
          await fetch('/api/user-hooks/example', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_hook_id: targetHookId, post_id: postId }),
          });
        }
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hook Lab</h1>
        <p className="text-gray-600 mt-1">Study viral hooks, filter by type, and steal templates for your content</p>
      </div>

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
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-6xl">🪝</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No hooks found</h3>
          <p className="mt-2 text-gray-600">
            {filters.analyzed_only
              ? 'No analyzed posts match your filters. Try clearing filters or wait for more posts to be analyzed.'
              : 'Track some profiles and the scraper will start analyzing hooks automatically.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {posts.map(post => (
              <HookCard
                key={post.id}
                post={post}
                flipped={allFlipped ? true : undefined}
                isSaved={savedPostIds.has(post.id)}
                onSave={saveHook}
                onTrack={trackUser}
                onInfoClick={setSelectedPost}
                savingId={savingId}
              />
            ))}
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
