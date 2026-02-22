'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { formatNumber, proxyImg } from '@/lib/format';
import type { UserHook, HookAnalysis } from '@/lib/types';
import { HookTypeBadge, NicheBadge } from '@/components/HookBadge';
import InsightsPanel from '@/components/InsightsPanel';

interface UserHookWithThumbnails extends UserHook {
  example_thumbnails: Array<{
    post_id: number;
    thumbnail_url: string | null;
    s3_thumbnail_url: string | null;
  }>;
}

interface HookDetailExample {
  post_id: number;
  post_url: string | null;
  thumbnail_url: string | null;
  s3_thumbnail_url: string | null;
  description: string | null;
  views: number;
  likes: number;
  viral_score: number;
  username: string;
  platform: string;
  avatar_url: string | null;
  hook_analysis: HookAnalysis | null;
  added_at: string;
}

export default function MyHooksPage() {
  const [hooks, setHooks] = useState<UserHookWithThumbnails[]>([]);
  const [loading, setLoading] = useState(true);
  const [hookTypeFilter, setHookTypeFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedHookId, setExpandedHookId] = useState<number | null>(null);
  const [expandedExamples, setExpandedExamples] = useState<HookDetailExample[]>([]);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedInsightsPost, setSelectedInsightsPost] = useState<HookDetailExample | null>(null);

  const fetchHooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (hookTypeFilter) params.set('hook_type', hookTypeFilter);
      if (nicheFilter) params.set('niche', nicheFilter);
      const res = await fetch(`/api/user-hooks?${params}`);
      const data = await res.json();
      setHooks(data.hooks || []);
    } catch {
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }, [hookTypeFilter, nicheFilter]);

  useEffect(() => { fetchHooks(); }, [fetchHooks]);

  const loadExamples = async (hookId: number) => {
    if (expandedHookId === hookId) {
      setExpandedHookId(null);
      setExpandedExamples([]);
      return;
    }
    setExpandedHookId(hookId);
    setLoadingExamples(true);
    try {
      const res = await fetch(`/api/user-hooks/${hookId}`);
      const data = await res.json();
      setExpandedExamples(data.hook?.examples || []);
    } catch {
      setExpandedExamples([]);
    } finally {
      setLoadingExamples(false);
    }
  };

  const deleteHook = async (hookId: number) => {
    try {
      await fetch('/api/user-hooks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_hook_id: hookId }),
      });
      setHooks(prev => prev.filter(h => h.id !== hookId));
      if (expandedHookId === hookId) {
        setExpandedHookId(null);
        setExpandedExamples([]);
      }
    } catch { /* ignore */ }
  };

  const removeExample = async (hookId: number, postId: number) => {
    try {
      const res = await fetch('/api/user-hooks/example', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_hook_id: hookId, post_id: postId }),
      });
      const data = await res.json();
      if (data.hook_deleted) {
        setHooks(prev => prev.filter(h => h.id !== hookId));
        setExpandedHookId(null);
        setExpandedExamples([]);
      } else {
        setExpandedExamples(prev => prev.filter(e => e.post_id !== postId));
        setHooks(prev => prev.map(h =>
          h.id === hookId
            ? { ...h, example_count: h.example_count - 1 }
            : h
        ));
      }
    } catch { /* ignore */ }
  };

  const importLink = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportMsg(null);
    try {
      const res = await fetch('/api/saved/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportMsg({ type: 'error', text: data.error || 'Failed to import' });
        return;
      }
      if (data.already_saved) {
        setImportMsg({ type: 'success', text: 'Already in your hooks!' });
      } else {
        setImportMsg({ type: 'success', text: 'Saved! Pattern will appear after analysis.' });
      }
      setImportUrl('');
      fetchHooks();
    } catch {
      setImportMsg({ type: 'error', text: 'Network error' });
    } finally {
      setImportLoading(false);
    }
  };

  // Extract unique hook types and niches for filter dropdowns
  const hookTypes = [...new Set(hooks.map(h => h.hook_type).filter(Boolean))] as string[];
  const niches = [...new Set(hooks.map(h => h.niche).filter(Boolean))] as string[];

  // Client-side search filter
  const filteredHooks = search
    ? hooks.filter(h =>
        (h.display_name || h.canonical_template || '').toLowerCase().includes(search.toLowerCase()) ||
        (h.notes || '').toLowerCase().includes(search.toLowerCase())
      )
    : hooks;

  // Map example to InsightsPanel-compatible post shape
  const mapExampleToPost = (ex: HookDetailExample) => ({
    id: ex.post_id,
    post_id: ex.post_id,
    post_url: ex.post_url,
    thumbnail_url: ex.thumbnail_url,
    s3_thumbnail_url: ex.s3_thumbnail_url,
    description: ex.description,
    views: ex.views,
    likes: ex.likes,
    comments: 0,
    shares: 0,
    viral_score: ex.viral_score,
    username: ex.username,
    platform: ex.platform,
    avatar_url: ex.avatar_url,
    hook_analysis: ex.hook_analysis,
    analyzed_at: ex.hook_analysis ? 'yes' : null,
    transcript: null,
    platform_id: '',
    profile_id: 0,
    posted_at: null,
    duration_seconds: null,
    is_video: true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Hooks</h1>
        <p className="text-gray-600 mt-1">Your saved hook patterns, grouped by template</p>
      </div>

      {/* Import URL */}
      <div className="bg-white rounded-2xl p-4 card-shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Import Video</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={importUrl}
            onChange={e => { setImportUrl(e.target.value); setImportMsg(null); }}
            onKeyDown={e => e.key === 'Enter' && !importLoading && importLink()}
            placeholder="Paste TikTok or Instagram Reel URL..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            onClick={importLink}
            disabled={importLoading || !importUrl.trim()}
            className="gradient-bg text-white px-5 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center space-x-2 text-sm whitespace-nowrap"
          >
            {importLoading ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <span>Import</span>
            )}
          </button>
        </div>
        {importMsg && (
          <p className={`mt-2 text-sm ${importMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {importMsg.text}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={hookTypeFilter}
          onChange={e => setHookTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Types</option>
          {hookTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={nicheFilter}
          onChange={e => setNicheFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">All Niches</option>
          {niches.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search hooks..."
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-[150px]"
        />
      </div>

      {/* Hooks list */}
      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          <p className="mt-4 text-gray-500">Loading your hooks...</p>
        </div>
      ) : filteredHooks.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-6xl">🪝</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No saved hooks yet</h3>
          <p className="mt-2 text-gray-600">
            Save hooks from Hook Lab to build your collection
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHooks.map(hook => (
            <div
              key={hook.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden card-shadow"
            >
              {/* Hook header — clickable to expand */}
              <div
                className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => loadExamples(hook.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Template text */}
                    <p className="font-semibold text-gray-900 text-sm leading-relaxed">
                      {hook.display_name || hook.canonical_template || 'Pending analysis...'}
                    </p>

                    {/* Badges */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {hook.hook_type && <HookTypeBadge hookType={hook.hook_type} />}
                      {hook.niche && <NicheBadge niche={hook.niche} />}
                      <span className="text-xs text-gray-500">
                        {hook.example_count} {hook.example_count === 1 ? 'example' : 'examples'}
                      </span>
                    </div>

                    {/* Notes */}
                    {hook.notes && (
                      <p className="text-xs text-gray-500 mt-2 italic">
                        Note: {hook.notes}
                      </p>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteHook(hook.id); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    title="Delete pattern"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Example thumbnails row */}
                {hook.example_thumbnails && hook.example_thumbnails.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {hook.example_thumbnails.map((ex) => (
                      <div
                        key={ex.post_id}
                        className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0"
                      >
                        {(ex.thumbnail_url || ex.s3_thumbnail_url) ? (
                          <Image
                            src={proxyImg(ex.thumbnail_url, ex.s3_thumbnail_url)!}
                            alt=""
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">
                            🎵
                          </div>
                        )}
                      </div>
                    ))}
                    {hook.example_count > hook.example_thumbnails.length && (
                      <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                        +{hook.example_count - hook.example_thumbnails.length}
                      </div>
                    )}
                  </div>
                )}

                {/* Expand indicator */}
                <div className="flex items-center justify-center mt-2">
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expandedHookId === hook.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded examples */}
              {expandedHookId === hook.id && (
                <div className="border-t border-gray-100 bg-gray-50 p-4">
                  {loadingExamples ? (
                    <div className="flex items-center gap-2 justify-center py-4 text-gray-500 text-sm">
                      <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
                      Loading examples...
                    </div>
                  ) : expandedExamples.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No examples found</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {expandedExamples.map((ex) => (
                        <div
                          key={ex.post_id}
                          className="bg-white rounded-xl overflow-hidden border border-gray-200 group"
                        >
                          {/* Thumbnail */}
                          <div
                            className="relative aspect-video bg-gray-100 cursor-pointer"
                            onClick={() => setSelectedInsightsPost(ex)}
                          >
                            {(ex.thumbnail_url || ex.s3_thumbnail_url) ? (
                              <Image
                                src={proxyImg(ex.thumbnail_url, ex.s3_thumbnail_url)!}
                                alt=""
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">
                                {ex.platform === 'instagram' ? '📸' : '🎵'}
                              </div>
                            )}
                            {/* Remove button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); removeExample(hook.id, ex.post_id); }}
                              className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove example"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {/* Info */}
                          <div className="p-3">
                            <div className="flex items-center gap-2">
                              {ex.avatar_url && (
                                <div className="relative w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                                  <Image src={proxyImg(ex.avatar_url)!} alt="" fill className="object-cover" unoptimized />
                                </div>
                              )}
                              <span className="text-xs font-medium text-gray-700 truncate">@{ex.username}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                              <span>👁️ {formatNumber(ex.views)}</span>
                              <span>❤️ {formatNumber(ex.likes)}</span>
                              <span>🔥 {ex.viral_score?.toFixed(1)}x</span>
                            </div>
                            {ex.description && (
                              <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">{ex.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* InsightsPanel for example detail */}
      <InsightsPanel
        post={selectedInsightsPost ? mapExampleToPost(selectedInsightsPost) : null}
        open={!!selectedInsightsPost}
        onClose={() => setSelectedInsightsPost(null)}
      />
    </div>
  );
}
