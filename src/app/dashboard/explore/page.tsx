'use client';

import { useState } from 'react';

// Mock trending content
const trendingContent = [
  { id: 1, username: 'fashionista', platform: 'instagram', viralScore: '1542.3x', views: '8.2M', likes: '543.2K', thumbnail: '👗', category: 'Fashion' },
  { id: 2, username: 'foodie.heaven', platform: 'tiktok', viralScore: '892.1x', views: '5.1M', likes: '321.5K', thumbnail: '🍕', category: 'Food' },
  { id: 3, username: 'fitnessguru', platform: 'instagram', viralScore: '456.7x', views: '2.8M', likes: '189.3K', thumbnail: '💪', category: 'Fitness' },
  { id: 4, username: 'techreviews', platform: 'tiktok', viralScore: '234.5x', views: '1.5M', likes: '98.7K', thumbnail: '📱', category: 'Tech' },
  { id: 5, username: 'beautytips', platform: 'instagram', viralScore: '678.9x', views: '3.9M', likes: '267.1K', thumbnail: '💄', category: 'Beauty' },
  { id: 6, username: 'traveler.diaries', platform: 'tiktok', viralScore: '345.2x', views: '2.1M', likes: '156.8K', thumbnail: '✈️', category: 'Travel' },
  { id: 7, username: 'comedyking', platform: 'tiktok', viralScore: '2103.4x', views: '12.3M', likes: '876.5K', thumbnail: '😂', category: 'Comedy' },
  { id: 8, username: 'musicvibes', platform: 'instagram', viralScore: '567.8x', views: '3.4M', likes: '234.6K', thumbnail: '🎵', category: 'Music' },
];

const categories = ['All', 'Fashion', 'Food', 'Fitness', 'Tech', 'Beauty', 'Travel', 'Comedy', 'Music'];

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'instagram' | 'tiktok'>('all');

  const filteredContent = trendingContent.filter(item => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
    if (selectedPlatform !== 'all' && item.platform !== selectedPlatform) return false;
    if (searchQuery && !item.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Explore</h1>
        <p className="text-gray-600 mt-1">Discover trending content and creators</p>
      </div>

      {/* Search */}
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
            placeholder="Search trending creators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value as 'all' | 'instagram' | 'tiktok')}
          className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition-colors ${
              selectedCategory === category
                ? 'gradient-bg text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Trending grid */}
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

              {/* Track button */}
              <button className="absolute bottom-3 left-3 bg-white/90 hover:bg-white px-3 py-1.5 rounded-full text-sm font-medium text-gray-700 transition-colors flex items-center space-x-1">
                <span>+</span>
                <span>Track</span>
              </button>

              {/* Save button */}
              <button className="absolute bottom-3 right-3 bg-white/90 hover:bg-white p-2 rounded-full transition-colors">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            </div>

            {/* Content info */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs">
                    {item.platform === 'instagram' ? '📸' : '🎵'}
                  </span>
                  <p className="font-medium text-gray-900 text-sm">@{item.username}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                  {item.category}
                </span>
                <span className="text-xs text-gray-500 flex items-center space-x-1">
                  <span>❤️</span>
                  <span>{item.likes}</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredContent.length === 0 && (
        <div className="text-center py-16">
          <span className="text-6xl">🔍</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No content found</h3>
          <p className="mt-2 text-gray-600">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}
