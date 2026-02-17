'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatNumber, formatViralScore } from '@/lib/format';

interface Profile {
  id: number;
  username: string;
  platform: string;
  avatar_url: string | null;
  followers: number;
  post_count_actual: number;
  avg_views_calc: number;
}

interface Post {
  id: number;
  username: string;
  platform: string;
  avatar_url: string | null;
  thumbnail_url: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  viral_score: number;
  posted_at: string | null;
  description: string | null;
}

const avatarEmoji: Record<string, string> = {
  yukatsunami: '🌊', 'remi.tswjourney': '🎯', cheekyglo: '💫', midnightmischief: '🌙',
};

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('viral_score');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

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

  // Real-time search
  useEffect(() => {
    if (!searchQuery || !searchQuery.startsWith('@')) {
      setSearchResults(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.profiles || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const trackUser = async (username: string, platform: string) => {
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, platform }),
    });
    fetchData();
    setSearchQuery('');
    setSearchResults(null);
  };

  const filteredPosts = posts.filter(p =>
    !searchQuery || searchQuery.startsWith('@') || p.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            placeholder="Search @username to track..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          {/* Search dropdown */}
          {searchQuery.startsWith('@') && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
              {searching ? (
                <div className="p-4 text-center text-gray-500">Searching...</div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-50">
                    <div>
                      <p className="font-medium text-gray-900">@{p.username}</p>
                      <p className="text-xs text-gray-500">{p.platform} • {formatNumber(p.followers)} followers • {formatNumber(Math.round(p.total_views || 0))} total views</p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Tracked</span>
                  </div>
                ))
              ) : searchResults !== null ? (
                <div className="p-4">
                  <p className="text-gray-600 text-sm">Not tracked yet.</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => trackUser(searchQuery.replace('@', ''), 'instagram')}
                      className="text-xs bg-pink-100 text-pink-700 px-3 py-1.5 rounded-full hover:bg-pink-200"
                    >
                      📸 Track on Instagram
                    </button>
                    <button
                      onClick={() => trackUser(searchQuery.replace('@', ''), 'tiktok')}
                      className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-200"
                    >
                      🎵 Track on TikTok
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
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
            📥 Export
          </button>
        </div>
      </div>

      {/* Tracked accounts */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Tracked Accounts</h2>
          <button
            onClick={() => setSearchQuery('@')}
            className="text-indigo-600 text-sm font-medium hover:text-indigo-700"
          >
            + Add Account
          </button>
        </div>
        {loading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : profiles.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No tracked accounts. Search @username above to add one.</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {profiles.map(account => (
              <div key={account.id} className="flex-shrink-0 bg-gray-50 rounded-xl p-4 min-w-[180px] hover:bg-gray-100 cursor-pointer transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-2xl overflow-hidden">
                    {account.avatar_url ? (
                      <img src={account.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      avatarEmoji[account.username] || '👤'
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
              <div key={item.id} className="bg-white rounded-2xl overflow-hidden card-shadow hover:shadow-lg transition-shadow cursor-pointer">
                <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center overflow-hidden">
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
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

                  <button className="absolute bottom-3 right-3 bg-white/90 hover:bg-white p-2 rounded-full transition-colors">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>

                <div className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-sm overflow-hidden">
                      {item.avatar_url ? (
                        <img src={item.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        avatarEmoji[item.username] || '👤'
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
