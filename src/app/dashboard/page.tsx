'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { formatNumber, formatViralScore, proxyImg } from '@/lib/format';
import type { Profile, Post } from '@/lib/types';
import { HookOverlay, HookTextExcerpt } from '@/components/HookBadge';

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [sortBy, setSortBy] = useState('viral_score');
  const [trackUsername, setTrackUsername] = useState('');
  const [trackPlatform, setTrackPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  const [trackStatus, setTrackStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [savingId, setSavingId] = useState<number | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  // Autocomplete state
  const [searchResults, setSearchResults] = useState<{ username: string; display_name: string; avatar_url: string; followers: number; verified: boolean; is_tracked: boolean }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const searchAccounts = useCallback((query: string, platform: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.replace(/^@/, '').trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setSearchLoading(true);
    setShowDropdown(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-accounts?q=${encodeURIComponent(query.replace(/^@/, '').trim())}&platform=${platform}`);
        const data = await res.json();
        const results = data.results || [];
        setSearchResults(results);
        if (results.length === 0) setShowDropdown(false);
      } catch {
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, postsRes] = await Promise.all([
        fetch(`/api/profiles?platform=${selectedPlatform}`),
        fetch(`/api/explore?sort=${sortBy}&platform=${selectedPlatform}&limit=50`),
      ]);
      const profilesData = await profilesRes.json();
      const postsData = await postsRes.json();
      setProfiles(profilesData.profiles || []);
      setPosts(postsData.posts || []);
    } catch {
      setProfiles([]);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlatform, sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const trackUser = async () => {
    const clean = trackUsername.replace(/^@/, '').trim();
    if (!clean) return;

    setTrackStatus({ type: 'loading' });
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: clean, platform: trackPlatform }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setTrackStatus({ type: 'error', message: data.error || 'Failed to track profile' });
      } else {
        setTrackStatus({ type: 'success', message: `Successfully tracking @${clean}!` });
        setTrackUsername('');
        await fetchData();
      }
    } catch {
      setTrackStatus({ type: 'error', message: 'Network error. Please try again.' });
    }

    setTimeout(() => setTrackStatus({ type: 'idle' }), 3000);
  };

  const untrackUser = async (username: string, platform: string) => {
    await fetch(`/api/profiles/${encodeURIComponent(username)}?platform=${platform}`, {
      method: 'DELETE',
    });
    fetchData();
  };

  const savePost = async (postId: number) => {
    setSavingId(postId);
    try {
      await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, folder: 'default' }),
      });
    } finally {
      setSavingId(null);
    }
  };

  const analyzeHook = async (postId: number) => {
    setAnalyzingId(postId);
    try {
      const res = await fetch('/api/analyze-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      });
      const data = await res.json();
      if (data.status === 'already_analyzed') {
        // Update the post in state with the analysis
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, hook_analysis: data.hook_analysis, analyzed_at: data.analyzed_at, transcript: data.transcript } : p
        ));
      }
      // For 'queued' status, the analysis happens async on the daemon
    } finally {
      setAnalyzingId(null);
    }
  };

  const filteredPosts = posts.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.username?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
  });

  const exportCSV = () => window.open('/api/export?format=csv', '_blank');

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter posts by username or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="all">All Platforms</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="viral_score">Sort by Viral Score</option>
            <option value="views">Sort by Views</option>
            <option value="recent">Sort by Recent</option>
          </select>

          <button
            onClick={exportCSV}
            className="px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 font-medium"
          >
            Export
          </button>
        </div>
      </div>

      {/* Tracked accounts */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tracked Accounts</h2>

        {/* Inline track form */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Enter username..."
              value={trackUsername}
              onChange={(e) => {
                setTrackUsername(e.target.value);
                searchAccounts(e.target.value, trackPlatform);
              }}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && trackStatus.type !== 'loading') { setShowDropdown(false); trackUser(); } }}
              disabled={trackStatus.type === 'loading'}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            />

            {/* Autocomplete dropdown */}
            {showDropdown && (
              <div ref={dropdownRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                {searchLoading && searchResults.length === 0 ? (
                  <div className="flex items-center justify-center py-4 text-gray-400 text-sm">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full mr-2" />
                    Searching...
                  </div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.username}
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 transition-colors text-left"
                      onClick={() => {
                        setTrackUsername(result.username);
                        setShowDropdown(false);
                        // Auto-track after selection
                        setTimeout(() => {
                          const clean = result.username.replace(/^@/, '').trim();
                          if (!clean) return;
                          setTrackStatus({ type: 'loading' });
                          fetch('/api/track', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: clean, platform: trackPlatform }),
                          })
                            .then((res) => res.json())
                            .then((data) => {
                              if (data.success) {
                                setTrackStatus({ type: 'success', message: `Successfully tracking @${clean}!` });
                                setTrackUsername('');
                                fetchData();
                              } else {
                                setTrackStatus({ type: 'error', message: data.error || 'Failed to track profile' });
                              }
                            })
                            .catch(() => setTrackStatus({ type: 'error', message: 'Network error. Please try again.' }))
                            .finally(() => setTimeout(() => setTrackStatus({ type: 'idle' }), 3000));
                        }, 0);
                      }}
                    >
                      <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex-shrink-0 overflow-hidden flex items-center justify-center text-sm">
                        {result.avatar_url ? (
                          <Image src={proxyImg(result.avatar_url)!} alt="" fill className="object-cover" unoptimized />
                        ) : (
                          <span className="text-white">👤</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-gray-900 text-sm truncate">@{result.username}</span>
                          {result.verified && (
                            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                          {result.is_tracked && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full flex-shrink-0">Tracked</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {result.display_name}{result.followers > 0 ? ` · ${formatNumber(result.followers)} followers` : ''}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <select
            value={trackPlatform}
            onChange={(e) => {
              const p = e.target.value as 'instagram' | 'tiktok';
              setTrackPlatform(p);
              if (trackUsername.trim().length >= 2) searchAccounts(trackUsername, p);
            }}
            disabled={trackStatus.type === 'loading'}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-50"
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
          <button
            onClick={trackUser}
            disabled={trackStatus.type === 'loading' || !trackUsername.trim()}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {trackStatus.type === 'loading' ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Tracking...
              </>
            ) : (
              'Track'
            )}
          </button>
        </div>

        {/* Status banner */}
        {trackStatus.type === 'success' && (
          <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {trackStatus.message}
          </div>
        )}
        {trackStatus.type === 'error' && (
          <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {trackStatus.message}
          </div>
        )}

        {loading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : profiles.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No tracked accounts yet. Add a username above to get started.</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {profiles.map(account => (
              <div key={account.id} className="relative flex-shrink-0 bg-gray-50 rounded-xl p-4 min-w-[180px] hover:bg-gray-100 transition-colors group">
                <button
                  onClick={() => untrackUser(account.username, account.platform)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1"
                  title="Untrack"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex items-center space-x-3">
                  <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-2xl overflow-hidden">
                    {account.avatar_url ? (
                      <Image src={proxyImg(account.avatar_url)!} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      '👤'
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs">{account.platform === 'instagram' ? '📸' : '🎵'}</span>
                      <p className="font-medium text-gray-900 text-sm">@{account.username}</p>
                    </div>
                    <p className="text-xs text-gray-500">{account.post_count_actual} posts • {formatNumber(Math.round(account.avg_views_calc || 0))} avg</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Content</h2>
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-6xl">📊</span>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">No content yet</h3>
            <p className="mt-2 text-gray-600">Track profiles and run the scraper to see content here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPosts.map(item => (
              <div
                key={item.id}
                onClick={() => item.post_url && window.open(item.post_url, '_blank')}
                className="bg-white rounded-2xl overflow-hidden card-shadow hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center overflow-hidden">
                  {item.thumbnail_url ? (
                    <Image src={proxyImg(item.thumbnail_url)!} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    <span className="text-6xl">{item.platform === 'instagram' ? '📸' : '🎵'}</span>
                  )}

                  <div className="absolute top-3 left-3 viral-badge text-white text-xs font-bold px-2 py-1 rounded-full flex items-center space-x-1">
                    <span>🔥</span>
                    <span>{formatViralScore(item.viral_score)}</span>
                  </div>

                  <div className="absolute top-3 right-3 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded-full flex items-center space-x-1">
                    <span>👁️</span>
                    <span>{formatNumber(item.views)}</span>
                  </div>

                  {item.hook_analysis && item.analyzed_at && (
                    <HookOverlay analysis={item.hook_analysis} />
                  )}

                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                    {!item.analyzed_at && (
                      <button
                        onClick={(e) => { e.stopPropagation(); analyzeHook(item.id); }}
                        disabled={analyzingId === item.id}
                        className="bg-white/90 hover:bg-white p-2 rounded-full transition-colors"
                        title="Analyze hook with AI"
                      >
                        {analyzingId === item.id ? (
                          <span className="block w-5 h-5 animate-spin border-2 border-indigo-500 border-t-transparent rounded-full" />
                        ) : (
                          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); savePost(item.id); }}
                      disabled={savingId === item.id}
                      className="bg-white/90 hover:bg-white p-2 rounded-full transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-700" fill={savingId === item.id ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-sm overflow-hidden">
                      {item.avatar_url ? (
                        <Image src={proxyImg(item.avatar_url)!} alt="" fill className="object-cover" unoptimized />
                      ) : (
                        '👤'
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1">
                        <span className="text-xs">{item.platform === 'instagram' ? '📸' : '🎵'}</span>
                        <p className="font-medium text-gray-900 text-sm">@{item.username}</p>
                      </div>
                      <p className="text-xs text-gray-500">{item.platform === 'instagram' ? 'Instagram' : 'TikTok'}{item.posted_at ? ` • ${new Date(item.posted_at).toLocaleDateString()}` : ''}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                    <span className="flex items-center space-x-1"><span>❤️</span><span>{formatNumber(item.likes)}</span></span>
                    <span className="flex items-center space-x-1"><span>💬</span><span>{formatNumber(item.comments)}</span></span>
                    <span className="flex items-center space-x-1"><span>↗️</span><span>{formatNumber(item.shares)}</span></span>
                  </div>

                  {item.hook_analysis && item.analyzed_at && (
                    <HookTextExcerpt analysis={item.hook_analysis} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
