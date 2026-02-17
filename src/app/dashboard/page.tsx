'use client';

import { useState } from 'react';

// Mock data for tracked accounts
const trackedAccounts = [
  { id: 1, username: 'yukatsunami', platform: 'instagram', avatar: '🌊', posts: 45, avgViews: '125K' },
  { id: 2, username: 'remi.tswjourney', platform: 'instagram', avatar: '🎯', posts: 32, avgViews: '890K' },
  { id: 3, username: 'cheekyglo', platform: 'tiktok', avatar: '💫', posts: 67, avgViews: '234K' },
  { id: 4, username: 'midnightmischief', platform: 'tiktok', avatar: '🌙', posts: 28, avgViews: '56K' },
];

// Mock data for content
const contentItems = [
  { id: 1, username: 'yukatsunami', platform: 'instagram', viralScore: '2946.8x', views: '13.8M', likes: '764.4K', comments: '5.2K', shares: '397.8K', date: 'Oct 21', thumbnail: '🎬' },
  { id: 2, username: 'yukatsunami', platform: 'instagram', viralScore: '159.9x', views: '779.4K', likes: '52.3K', comments: '331', shares: '31.1K', date: 'Oct 26', thumbnail: '📱' },
  { id: 3, username: 'midnightmischief', platform: 'tiktok', viralScore: '32.1x', views: '98.9K', likes: '438', comments: '5', shares: '58', date: 'Jul 18', thumbnail: '✨' },
  { id: 4, username: 'cheekyglo', platform: 'tiktok', viralScore: '380.0x', views: '444.6K', likes: '9.6K', comments: '52', shares: '434', date: 'Sep 9', thumbnail: '🔥' },
  { id: 5, username: 'remi.tswjourney', platform: 'instagram', viralScore: '6.5x', views: '4.1M', likes: '67.3K', comments: '440', shares: '10.7K', date: 'Dec 7', thumbnail: '💎' },
  { id: 6, username: 'cheekyglo', platform: 'tiktok', viralScore: '280.0x', views: '314K', likes: '9.5K', comments: '33', shares: '106', date: 'Dec 30', thumbnail: '🎵' },
];

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'instagram' | 'tiktok'>('all');
  const [sortBy, setSortBy] = useState<'viral' | 'views' | 'recent'>('viral');

  const filteredContent = contentItems.filter(item => {
    if (selectedPlatform !== 'all' && item.platform !== selectedPlatform) return false;
    if (searchQuery && !item.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <svg
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search @username to track"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value as 'all' | 'instagram' | 'tiktok')}
            className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="all">All Platforms</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'viral' | 'views' | 'recent')}
            className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="viral">Sort by Viral Score</option>
            <option value="views">Sort by Views</option>
            <option value="recent">Sort by Recent</option>
          </select>
        </div>
      </div>

      {/* Tracked accounts */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Tracked Accounts</h2>
          <button className="text-indigo-600 text-sm font-medium hover:text-indigo-700">
            + Add Account
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {trackedAccounts.map((account) => (
            <div
              key={account.id}
              className="flex-shrink-0 bg-gray-50 rounded-xl p-4 min-w-[180px] hover:bg-gray-100 cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-2xl">
                  {account.avatar}
                </div>
                <div>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs">
                      {account.platform === 'instagram' ? '📸' : '🎵'}
                    </span>
                    <p className="font-medium text-gray-900 text-sm">@{account.username}</p>
                  </div>
                  <p className="text-xs text-gray-500">{account.posts} posts • {account.avgViews} avg</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Top Performing Content
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredContent.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl overflow-hidden card-shadow hover:shadow-lg transition-shadow cursor-pointer"
            >
              {/* Thumbnail */}
              <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <span className="text-6xl">{item.thumbnail}</span>
                
                {/* Viral score badge */}
                <div className="absolute top-3 left-3 viral-badge text-white text-xs font-bold px-2 py-1 rounded-full flex items-center space-x-1">
                  <span>🔥</span>
                  <span>{item.viralScore}</span>
                </div>

                {/* Views badge */}
                <div className="absolute top-3 right-3 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded-full flex items-center space-x-1">
                  <span>👁️</span>
                  <span>{item.views}</span>
                </div>

                {/* Save button */}
                <button className="absolute bottom-3 right-3 bg-white/90 hover:bg-white p-2 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              </div>

              {/* Content info */}
              <div className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-sm">
                    {item.thumbnail}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs">
                        {item.platform === 'instagram' ? '📸' : '🎵'}
                      </span>
                      <p className="font-medium text-gray-900 text-sm">@{item.username}</p>
                    </div>
                    <p className="text-xs text-gray-500">{item.platform === 'instagram' ? 'Instagram' : 'TikTok'} • {item.date}</p>
                  </div>
                </div>

                {/* Engagement stats */}
                <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                  <span className="flex items-center space-x-1">
                    <span>❤️</span>
                    <span>{item.likes}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span>💬</span>
                    <span>{item.comments}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span>↗️</span>
                    <span>{item.shares}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
