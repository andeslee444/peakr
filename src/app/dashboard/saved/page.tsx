'use client';

import { useState } from 'react';

// Mock saved content
const savedContent = [
  { id: 1, username: 'yukatsunami', platform: 'instagram', viralScore: '2946.8x', views: '13.8M', savedAt: '2 days ago', thumbnail: '🎬', folder: 'Inspiration' },
  { id: 2, username: 'cheekyglo', platform: 'tiktok', viralScore: '380.0x', views: '444.6K', savedAt: '1 week ago', thumbnail: '🔥', folder: 'Hooks' },
  { id: 3, username: 'remi.tswjourney', platform: 'instagram', viralScore: '202x', views: '4.1M', savedAt: '3 days ago', thumbnail: '💎', folder: 'Formats' },
  { id: 4, username: 'midnightmischief', platform: 'tiktok', viralScore: '32.1x', views: '98.9K', savedAt: '5 days ago', thumbnail: '✨', folder: 'Inspiration' },
];

const folders = ['All', 'Inspiration', 'Hooks', 'Formats', 'Competitors'];

export default function SavedPage() {
  const [selectedFolder, setSelectedFolder] = useState('All');

  const filteredContent = selectedFolder === 'All' 
    ? savedContent 
    : savedContent.filter(item => item.folder === selectedFolder);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Saved Content</h1>
        <button className="gradient-bg text-white px-4 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center space-x-2">
          <span>+</span>
          <span>New Folder</span>
        </button>
      </div>

      {/* Folder tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {folders.map((folder) => (
          <button
            key={folder}
            onClick={() => setSelectedFolder(folder)}
            className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition-colors ${
              selectedFolder === folder
                ? 'gradient-bg text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {folder}
          </button>
        ))}
      </div>

      {/* Saved grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredContent.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-2xl overflow-hidden card-shadow hover:shadow-lg transition-shadow cursor-pointer group"
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

              {/* Remove from saved button */}
              <button className="absolute bottom-3 right-3 bg-red-500 hover:bg-red-600 p-2 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
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
                <span className="text-xs text-gray-500">{item.savedAt}</span>
              </div>
              <div className="mt-2">
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {item.folder}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredContent.length === 0 && (
        <div className="text-center py-16">
          <span className="text-6xl">💾</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No saved content</h3>
          <p className="mt-2 text-gray-600">Start saving content from the Tracked or Explore pages</p>
        </div>
      )}
    </div>
  );
}
