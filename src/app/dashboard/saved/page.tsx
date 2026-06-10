'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  linked_at: string;
}

interface Collection {
  id: number;
  name: string;
  pattern_count: number;
}

export default function MyHooksPage() {
  const [hooks, setHooks] = useState<UserHookWithThumbnails[]>([]);
  const [loading, setLoading] = useState(true);
  const [hookTypeFilter, setHookTypeFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [sortBy, setSortBy] = useState('saved_at');
  const [search, setSearch] = useState('');
  const [expandedPatternId, setExpandedPatternId] = useState<number | null>(null);
  const [expandedExamples, setExpandedExamples] = useState<HookDetailExample[]>([]);
  const [totalExamples, setTotalExamples] = useState(0);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [loadingMoreExamples, setLoadingMoreExamples] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedInsightsPost, setSelectedInsightsPost] = useState<HookDetailExample | null>(null);

  // Remix state
  const [remixPatternId, setRemixPatternId] = useState<number | null>(null);
  const [remixLoading, setRemixLoading] = useState(false);
  const [remixResults, setRemixResults] = useState<{ script: string; angle: string; why: string }[]>([]);
  const [remixPatternName, setRemixPatternName] = useState('');
  const [remixError, setRemixError] = useState<string | null>(null);

  const generateRemix = async (patternId: number) => {
    if (remixPatternId === patternId && remixResults.length > 0) {
      setRemixPatternId(null);
      setRemixResults([]);
      return;
    }
    setRemixPatternId(patternId);
    setRemixLoading(true);
    setRemixError(null);
    setRemixResults([]);
    try {
      const res = await fetch('/api/hooks/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern_id: patternId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRemixError(data.error || 'Failed to generate');
        return;
      }
      setRemixResults(data.variations || []);
      setRemixPatternName(data.pattern_name || '');
    } catch {
      setRemixError('Network error');
    } finally {
      setRemixLoading(false);
    }
  };

  // Collections state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [assignMenuPatternId, setAssignMenuPatternId] = useState<number | null>(null);
  const [patternCollections, setPatternCollections] = useState<Record<number, Set<number>>>({});

  // Close assign menu on outside click
  useEffect(() => {
    if (assignMenuPatternId === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-assign-menu]')) {
        setAssignMenuPatternId(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [assignMenuPatternId]);

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/collections');
      const data = await res.json();
      setCollections(data.collections || []);

      // Fetch which collections each pattern belongs to
      const colls = data.collections || [];
      if (colls.length > 0) {
        const map: Record<number, Set<number>> = {};
        for (const c of colls) {
          // We'll populate this from the hooks data below
          map[c.id] = new Set();
        }
        setPatternCollections(map);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchHooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (hookTypeFilter) params.set('hook_type', hookTypeFilter);
      if (nicheFilter) params.set('niche', nicheFilter);
      if (sortBy) params.set('sort', sortBy);
      if (activeCollectionId) params.set('collection_id', String(activeCollectionId));
      const res = await fetch(`/api/user-hooks?${params}`);
      const data = await res.json();
      setHooks(data.hooks || []);
    } catch {
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }, [hookTypeFilter, nicheFilter, sortBy, activeCollectionId]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);
  useEffect(() => { fetchHooks(); }, [fetchHooks]);

  const createCollection = async () => {
    if (!newCollectionName.trim()) return;
    setCreatingCollection(true);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCollectionName.trim() }),
      });
      if (res.ok) {
        setNewCollectionName('');
        setShowNewCollection(false);
        fetchCollections();
      }
    } catch { /* ignore */ }
    finally { setCreatingCollection(false); }
  };

  const deleteCollection = async (collectionId: number) => {
    if (!window.confirm('Delete this collection? This cannot be undone.')) return;
    try {
      await fetch('/api/collections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_id: collectionId }),
      });
      if (activeCollectionId === collectionId) setActiveCollectionId(null);
      fetchCollections();
    } catch { /* ignore */ }
  };

  const togglePatternInCollection = async (patternId: number, collectionId: number) => {
    const isIn = patternCollections[collectionId]?.has(patternId);
    const action = isIn ? 'remove' : 'add';

    // Optimistic update
    setPatternCollections(prev => {
      const next = { ...prev };
      const set = new Set(next[collectionId] || []);
      if (action === 'add') set.add(patternId);
      else set.delete(patternId);
      next[collectionId] = set;
      return next;
    });

    try {
      await fetch('/api/collections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_id: collectionId, pattern_id: patternId, action }),
      });
      fetchCollections();
    } catch {
      // Revert on error
      setPatternCollections(prev => {
        const next = { ...prev };
        const set = new Set(next[collectionId] || []);
        if (action === 'add') set.delete(patternId);
        else set.add(patternId);
        next[collectionId] = set;
        return next;
      });
    }
  };

  // Load pattern-collection memberships when assign menu opens
  const openAssignMenu = async (patternId: number) => {
    if (assignMenuPatternId === patternId) {
      setAssignMenuPatternId(null);
      return;
    }
    setAssignMenuPatternId(patternId);

    // Fetch which collections this pattern is in
    try {
      const res = await fetch(`/api/user-hooks/${patternId}`);
      const data = await res.json();
      const collIds: number[] = data.hook?.collection_ids || [];
      setPatternCollections(prev => {
        const next = { ...prev };
        for (const c of collections) {
          if (!next[c.id]) next[c.id] = new Set();
          if (collIds.includes(c.id)) next[c.id].add(patternId);
          else next[c.id].delete(patternId);
        }
        return next;
      });
    } catch { /* ignore */ }
  };

  const loadExamples = async (patternId: number) => {
    if (expandedPatternId === patternId) {
      setExpandedPatternId(null);
      setExpandedExamples([]);
      setTotalExamples(0);
      return;
    }
    setExpandedPatternId(patternId);
    setLoadingExamples(true);
    try {
      const res = await fetch(`/api/user-hooks/${patternId}`);
      const data = await res.json();
      setExpandedExamples(data.hook?.examples || []);
      setTotalExamples(data.hook?.total_examples || 0);
    } catch {
      setExpandedExamples([]);
      setTotalExamples(0);
    } finally {
      setLoadingExamples(false);
    }
  };

  const loadMoreExamples = async (patternId: number) => {
    setLoadingMoreExamples(true);
    try {
      const res = await fetch(`/api/user-hooks/${patternId}?offset=${expandedExamples.length}`);
      const data = await res.json();
      const newExamples = data.hook?.examples || [];
      setExpandedExamples(prev => [...prev, ...newExamples]);
    } catch { /* ignore */ }
    finally {
      setLoadingMoreExamples(false);
    }
  };

  const deleteHook = async (patternId: number) => {
    if (!window.confirm('Remove this hook from My Hooks?')) return;
    try {
      await fetch('/api/user-hooks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern_id: patternId }),
      });
      setHooks(prev => prev.filter(h => h.pattern_id !== patternId));
      if (expandedPatternId === patternId) {
        setExpandedPatternId(null);
        setExpandedExamples([]);
        setTotalExamples(0);
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
    audio_name: null,
    audio_author: null,
    duration_seconds: null,
    is_video: true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Hooks</h1>
        <p className="text-gray-600 mt-1">Your saved hook patterns with global analytics</p>
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

      {/* Collection tabs */}
      {collections.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCollectionId(null)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              activeCollectionId === null
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Hooks
          </button>
          {collections.map(c => (
            <div key={c.id} className="relative group flex-shrink-0">
              <button
                onClick={() => setActiveCollectionId(activeCollectionId === c.id ? null : c.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  activeCollectionId === c.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {c.name}
                <span className={`ml-1.5 text-xs ${activeCollectionId === c.id ? 'text-indigo-200' : 'text-gray-400'}`}>
                  {c.pattern_count}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteCollection(c.id); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-500"
              >
                &times;
              </button>
            </div>
          ))}
          {showNewCollection ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCollection()}
                placeholder="Collection name..."
                autoFocus
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
              />
              <button
                onClick={createCollection}
                disabled={creatingCollection || !newCollectionName.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowNewCollection(false); setNewCollectionName(''); }}
                className="px-2 py-2 text-gray-400 hover:text-gray-600 text-sm"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewCollection(true)}
              className="px-3 py-2 rounded-xl text-sm font-medium text-gray-400 border border-dashed border-gray-300 hover:border-indigo-300 hover:text-indigo-500 transition-colors whitespace-nowrap flex-shrink-0"
            >
              + New
            </button>
          )}
        </div>
      )}
      {collections.length === 0 && (
        <div className="flex items-center gap-2">
          {showNewCollection ? (
            <div className="flex items-center gap-1">
              <input
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCollection()}
                placeholder="Collection name..."
                autoFocus
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
              />
              <button
                onClick={createCollection}
                disabled={creatingCollection || !newCollectionName.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowNewCollection(false); setNewCollectionName(''); }}
                className="px-2 py-2 text-gray-400 hover:text-gray-600 text-sm"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewCollection(true)}
              className="px-3 py-2 rounded-xl text-sm font-medium text-gray-400 border border-dashed border-gray-300 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
            >
              + Create Collection
            </button>
          )}
        </div>
      )}

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
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="saved_at">Recently Saved</option>
          <option value="avg_viral_score">Avg Viral Score</option>
          <option value="example_count">Most Examples</option>
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
                onClick={() => loadExamples(hook.pattern_id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Template text */}
                    <p className="font-semibold text-gray-900 text-sm leading-relaxed">
                      {hook.display_name || hook.canonical_template || 'Pending analysis...'}
                    </p>

                    {/* Badges + global stats */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {hook.hook_type && <HookTypeBadge hookType={hook.hook_type} />}
                      {hook.niche && <NicheBadge niche={hook.niche} />}
                    </div>

                    {/* Global analytics */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>Avg {hook.avg_viral_score?.toFixed(1)}x viral</span>
                      <span>{formatNumber(Math.round(hook.avg_views || 0))} avg views</span>
                      <span>{hook.example_count} {hook.example_count === 1 ? 'example' : 'examples'}</span>
                    </div>

                    {/* Notes */}
                    {hook.notes && (
                      <p className="text-xs text-gray-500 mt-2 italic">
                        Note: {hook.notes}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Remix button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); generateRemix(hook.pattern_id); }}
                      disabled={remixLoading && remixPatternId === hook.pattern_id}
                      className={`p-1.5 rounded-lg transition-colors ${
                        remixPatternId === hook.pattern_id && remixResults.length > 0
                          ? 'text-indigo-600 bg-indigo-50'
                          : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                      }`}
                      title="Remix for your niche"
                    >
                      {remixLoading && remixPatternId === hook.pattern_id ? (
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </button>
                    {/* Assign to collection */}
                    {collections.length > 0 && (
                      <div className="relative" data-assign-menu>
                        <button
                          onClick={(e) => { e.stopPropagation(); openAssignMenu(hook.pattern_id); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                          title="Add to collection"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </button>
                        {assignMenuPatternId === hook.pattern_id && (
                          <div
                            className="absolute right-0 top-8 z-20 bg-white rounded-xl border border-gray-200 shadow-lg p-2 min-w-[180px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-xs font-medium text-gray-500 px-2 pb-1 mb-1 border-b border-gray-100">Collections</p>
                            {collections.map(c => {
                              const isIn = patternCollections[c.id]?.has(hook.pattern_id);
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => togglePatternInCollection(hook.pattern_id, c.id)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left hover:bg-gray-50 transition-colors"
                                >
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isIn ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'}`}>
                                    {isIn && (
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </span>
                                  <span className="truncate">{c.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Delete button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteHook(hook.pattern_id); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove from saved"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
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
                    className={`w-4 h-4 text-gray-400 transition-transform ${expandedPatternId === hook.pattern_id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded examples */}
              {expandedPatternId === hook.pattern_id && (
                <div className="border-t border-gray-100 bg-gray-50 p-4">
                  {loadingExamples ? (
                    <div className="flex items-center gap-2 justify-center py-4 text-gray-500 text-sm">
                      <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
                      Loading examples...
                    </div>
                  ) : expandedExamples.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No examples found</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {expandedExamples.map((ex) => (
                          <div
                            key={ex.post_id}
                            className="bg-white rounded-xl overflow-hidden border border-gray-200 group cursor-pointer"
                            onClick={() => setSelectedInsightsPost(ex)}
                          >
                            {/* Thumbnail */}
                            <div className="relative aspect-video bg-gray-100">
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
                      {/* Load more button */}
                      {expandedExamples.length < totalExamples && (
                        <div className="text-center mt-4">
                          <button
                            onClick={(e) => { e.stopPropagation(); loadMoreExamples(hook.pattern_id); }}
                            disabled={loadingMoreExamples}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                          >
                            {loadingMoreExamples ? (
                              <span className="flex items-center gap-2">
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                Loading...
                              </span>
                            ) : (
                              `Load More (${expandedExamples.length} of ${totalExamples})`
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Remix results */}
              {remixPatternId === hook.pattern_id && (remixResults.length > 0 || remixError) && (
                <div className="border-t border-gray-100 bg-gradient-to-b from-amber-50/50 to-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">✨</span>
                      <h4 className="text-sm font-semibold text-gray-900">
                        Remixed for Your Niche
                      </h4>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setRemixPatternId(null); setRemixResults([]); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Close
                    </button>
                  </div>
                  {remixError ? (
                    <p className="text-sm text-red-600">{remixError}</p>
                  ) : (
                    <div className="space-y-3">
                      {remixResults.map((v, i) => (
                        <div key={i} className="bg-white rounded-xl p-3 border border-gray-100">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-gray-800 font-medium leading-relaxed flex-1">
                              &ldquo;{v.script}&rdquo;
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(v.script);
                              }}
                              className="text-xs text-gray-400 hover:text-indigo-600 flex-shrink-0 p-1"
                              title="Copy"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                            <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">{v.angle}</span>
                            <span className="italic">{v.why}</span>
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
