'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { formatNumber, proxyImg } from '@/lib/format';
import type { Profile } from '@/lib/types';

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [trackUsername, setTrackUsername] = useState('');
  const [trackPlatform, setTrackPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  const [trackStatus, setTrackStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  // Autocomplete state
  const [searchResults, setSearchResults] = useState<{ username: string; display_name: string; avatar_url: string; followers: number; post_count: number; verified: boolean; is_tracked: boolean }[]>([]);
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
      const res = await fetch(`/api/profiles?platform=${selectedPlatform}`);
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlatform]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
                    <p className="text-xs text-gray-500">
                      {(account.post_count_actual ?? 0) > 0 ? `${account.post_count_actual} posts` : (account.followers ?? 0) > 0 ? `${formatNumber(account.followers)} followers` : '0 posts'}
                      {' • '}
                      {formatNumber(Math.round(account.avg_views_calc || 0))} avg
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
