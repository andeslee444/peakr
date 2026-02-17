'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { formatNumber, formatViralScore } from '@/lib/format';
import type { Post } from '@/lib/types';

const platformEmoji: Record<string, string> = { instagram: '📸', tiktok: '🎵' };

export default function ExplorePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [sortBy, setSortBy] = useState('viral_score');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [trackingUser, setTrackingUser] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: sortBy, limit: '50' });
      if (selectedPlatform !== 'all') params.set('platform', selectedPlatform);
      const res = await fetch(`/api/explore?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlatform, sortBy]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const filtered = posts.filter(p =>
    !searchQuery || p.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const trackUser = async (username: string, platform: string) => {
    const key = `${platform}:${username}`;
    setTrackingUser(key);
    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, platform }),
      });
    } finally {
      setTrackingUser(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Explore</h1>
        <p className="text-gray-600 mt-1">Discover trending content across all tracked profiles</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search trending creators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

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
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          <p className="mt-4 text-gray-500">Loading trending content...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-6xl">🔍</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No content found</h3>
          <p className="mt-2 text-gray-600">Track some profiles first, then their top posts will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const trackKey = `${item.platform}:${item.username}`;
            const isTracking = trackingUser === trackKey;
            return (
              <div
                key={item.id}
                onClick={() => item.post_url && window.open(item.post_url, '_blank')}
                className="bg-white rounded-2xl overflow-hidden card-shadow hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center overflow-hidden">
                  {item.thumbnail_url ? (
                    <Image src={item.thumbnail_url} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    <span className="text-6xl">{platformEmoji[item.platform] || '📱'}</span>
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
                    onClick={(e) => { e.stopPropagation(); trackUser(item.username, item.platform); }}
                    disabled={isTracking}
                    className="absolute bottom-3 left-3 bg-white/90 hover:bg-white px-3 py-1.5 rounded-full text-sm font-medium text-gray-700 transition-colors flex items-center space-x-1 disabled:opacity-50"
                  >
                    {isTracking ? (
                      <span className="flex items-center gap-1">
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full" />
                        <span>Tracking</span>
                      </span>
                    ) : (
                      <>
                        <span>+</span>
                        <span>Track</span>
                      </>
                    )}
                  </button>

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
                    <span className="text-xs">{platformEmoji[item.platform] || '📱'}</span>
                    <p className="font-medium text-gray-900 text-sm">@{item.username}</p>
                  </div>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span className="flex items-center space-x-1"><span>❤️</span><span>{formatNumber(item.likes)}</span></span>
                    <span className="flex items-center space-x-1"><span>💬</span><span>{formatNumber(item.comments)}</span></span>
                    <span className="flex items-center space-x-1"><span>↗️</span><span>{formatNumber(item.shares)}</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
