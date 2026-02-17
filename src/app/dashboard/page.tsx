'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { formatNumber, formatViralScore } from '@/lib/format';
import type { Profile, Post } from '@/lib/types';

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
          <input
            type="text"
            placeholder="Enter username..."
            value={trackUsername}
            onChange={(e) => setTrackUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && trackStatus.type !== 'loading') trackUser(); }}
            disabled={trackStatus.type === 'loading'}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
          />
          <select
            value={trackPlatform}
            onChange={(e) => setTrackPlatform(e.target.value as 'instagram' | 'tiktok')}
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
                      <Image src={account.avatar_url} alt="" fill className="object-cover" unoptimized />
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
                    <Image src={item.thumbnail_url} alt="" fill className="object-cover" unoptimized />
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

                  <button
                    onClick={(e) => { e.stopPropagation(); savePost(item.id); }}
                    disabled={savingId === item.id}
                    className="absolute bottom-3 right-3 bg-white/90 hover:bg-white p-2 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-700" fill={savingId === item.id ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>

                <div className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-sm overflow-hidden">
                      {item.avatar_url ? (
                        <Image src={item.avatar_url} alt="" fill className="object-cover" unoptimized />
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
