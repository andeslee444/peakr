'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatNumber, formatViralScore, proxyImg } from '@/lib/format';
import type { Profile, Post } from '@/lib/types';
import VideoHover from '@/components/VideoHover';

export default function TrackedPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [trackUsername, setTrackUsername] = useState('');
  const [trackPlatform, setTrackPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  const [trackStatus, setTrackStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [showAllProfiles, setShowAllProfiles] = useState(false);

  // Tracked posts state
  const [trackedPosts, setTrackedPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsTotal, setPostsTotal] = useState(0);

  // Autocomplete state
  const [searchResults, setSearchResults] = useState<{ username: string; display_name: string; avatar_url: string; followers: number; post_count: number; verified: boolean; is_tracked: boolean }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchExternalOk, setSearchExternalOk] = useState(true);
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
        const extOk = data.externalOk !== false;
        setSearchResults(results);
        setSearchExternalOk(extOk);
        // Keep the dropdown open to show the "couldn't reach platform" notice
        // when the live lookup failed and we have nothing local to show.
        if (results.length === 0 && extOk) setShowDropdown(false);
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
      const res = await fetch(`/api/profiles?platform=${selectedPlatform}`);
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlatform]);

  const fetchTrackedPosts = useCallback(async (offset = 0) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/tracked-posts?platform=${selectedPlatform}&limit=24&offset=${offset}`);
      const data = await res.json();
      if (offset === 0) {
        setTrackedPosts(data.posts || []);
      } else {
        setTrackedPosts(prev => [...prev, ...(data.posts || [])]);
      }
      setPostsTotal(data.total || 0);
    } catch {
      if (offset === 0) setTrackedPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, [selectedPlatform]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchTrackedPosts(0); }, [fetchTrackedPosts]);

  const trackUser = async () => {
    const clean = trackUsername.replace(/^@/, '').trim();
    if (!clean) return;

    // Try to find metadata from search results
    const match = searchResults.find(r => r.username.toLowerCase() === clean.toLowerCase());

    setTrackStatus({ type: 'loading' });
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: clean,
          platform: trackPlatform,
          display_name: match?.display_name,
          avatar_url: match?.avatar_url,
          followers: match?.followers,
          post_count: match?.post_count,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setTrackStatus({ type: 'error', message: data.error || 'Failed to track profile' });
      } else {
        setTrackStatus({ type: 'success', message: `Successfully tracking @${clean}!` });
        setTrackUsername('');
        await fetchData();
        fetchTrackedPosts(0);
      }
    } catch {
      setTrackStatus({ type: 'error', message: 'Network error. Please try again.' });
    }

    setTimeout(() => setTrackStatus({ type: 'idle' }), 3000);
  };

  const untrackUser = async (username: string, platform: string) => {
    if (!window.confirm(`Stop tracking @${username}?`)) return;
    await fetch(`/api/profiles/${encodeURIComponent(username)}?platform=${platform}`, {
      method: 'DELETE',
    });
    fetchData();
    fetchTrackedPosts(0);
  };

  const visibleProfiles = showAllProfiles ? profiles : profiles.slice(0, 5);

  return (
    <div className="space-y-6">

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
                ) : searchResults.length === 0 && !searchExternalOk ? (
                  <div className="px-4 py-3 text-sm text-amber-700">
                    Couldn&apos;t reach {trackPlatform} to look up that handle right now. You can still
                    type the exact username and track it directly.
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
                            body: JSON.stringify({
                              username: clean,
                              platform: trackPlatform,
                              display_name: result.display_name,
                              avatar_url: result.avatar_url,
                              followers: result.followers,
                              post_count: result.post_count,
                            }),
                          })
                            .then((res) => res.json())
                            .then((data) => {
                              if (data.success) {
                                setTrackStatus({ type: 'success', message: `Successfully tracking @${clean}!` });
                                setTrackUsername('');
                                fetchData();
                                fetchTrackedPosts(0);
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
                          <span className="text-white">&#x1F464;</span>
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

        {/* Account rows */}
        {loading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : profiles.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No tracked accounts yet. Add a username above to get started.</p>
        ) : (
          <div>
            <div className="divide-y divide-gray-100">
              {visibleProfiles.map(account => (
                <div key={account.id} className="flex items-center gap-3 py-2.5 group hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
                  {/* Avatar */}
                  <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {account.avatar_url ? (
                      <Image src={proxyImg(account.avatar_url)!} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <span className="text-white text-xs">&#x1F464;</span>
                    )}
                  </div>

                  {/* Platform emoji */}
                  <span className="text-sm flex-shrink-0">{account.platform === 'instagram' ? '📸' : '🎵'}</span>

                  {/* Username + display name */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/creator/${encodeURIComponent(account.username)}?platform=${account.platform}`}
                      className="font-medium text-gray-900 text-sm hover:text-indigo-600 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{account.username}
                    </Link>
                    {account.display_name && (
                      <span className="text-xs text-gray-400 ml-1.5 hidden sm:inline">{account.display_name}</span>
                    )}
                  </div>

                  {/* Stats */}
                  <span className="text-xs text-gray-500 hidden sm:inline">{formatNumber(account.followers)} followers</span>
                  <span className="text-xs text-gray-500 hidden md:inline">{account.post_count_actual ?? account.post_count} posts</span>
                  <span className="text-xs text-gray-500 hidden md:inline">{formatNumber(Math.round(account.avg_views_calc || account.avg_views || 0))} avg</span>

                  {/* Untrack button */}
                  <button
                    onClick={() => untrackUser(account.username, account.platform)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 flex-shrink-0"
                    title="Untrack"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {profiles.length > 5 && (
              <button
                onClick={() => setShowAllProfiles(!showAllProfiles)}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {showAllProfiles ? 'Show less' : `Show all (${profiles.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Posts from tracked accounts */}
      {profiles.length > 0 && (
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Posts from Tracked Accounts</h2>

          {postsLoading && trackedPosts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Loading posts...</div>
          ) : trackedPosts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No posts yet. Posts will appear after your tracked accounts are scraped.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {trackedPosts.map(post => (
                  <div
                    key={post.id}
                    className="group cursor-pointer"
                    onClick={() => post.post_url && window.open(post.post_url, '_blank')}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                      <VideoHover
                        thumbnailUrl={post.thumbnail_url}
                        s3ThumbnailUrl={post.s3_thumbnail_url}
                        postUrl={post.post_url}
                        isVideo={post.is_video}
                      />
                      {/* Viral score badge */}
                      {post.viral_score > 0 && (
                        <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs font-bold px-1.5 py-0.5 rounded-md z-20">
                          {formatViralScore(post.viral_score)}
                        </div>
                      )}
                      {/* Views badge */}
                      {post.views > 0 && (
                        <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-md z-20 flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                          {formatNumber(post.views)}
                        </div>
                      )}
                    </div>
                    {/* Post info */}
                    <div className="mt-1.5 px-0.5">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Link
                          href={`/dashboard/creator/${encodeURIComponent(post.username)}?platform=${post.platform || selectedPlatform}`}
                          className="font-medium text-gray-700 truncate hover:text-indigo-600 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          @{post.username}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span>{formatNumber(post.likes)} likes</span>
                        <span>{formatNumber(post.comments)} comments</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {trackedPosts.length < postsTotal && (
                <div className="text-center mt-4">
                  <button
                    onClick={() => fetchTrackedPosts(trackedPosts.length)}
                    disabled={postsLoading}
                    className="px-5 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
                  >
                    {postsLoading ? 'Loading...' : `Load more (${trackedPosts.length} of ${postsTotal})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Hook Lab CTA */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Hook Lab</h2>
            <p className="text-indigo-100 mt-1">Browse viral hooks, study what works, and steal templates for your content</p>
          </div>
          <Link
            href="/dashboard/hook-lab"
            className="bg-white text-indigo-600 font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors flex-shrink-0"
          >
            Open Hook Lab
          </Link>
        </div>
      </div>
    </div>
  );
}
