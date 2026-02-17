'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatNumber, formatViralScore } from '@/lib/format';

interface SavedPost {
  id: number;
  post_id: number;
  folder: string;
  saved_at: string;
  username: string;
  platform: string;
  views: number;
  likes: number;
  viral_score: number;
  thumbnail_url: string | null;
  post_url: string | null;
  description: string | null;
}

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedPost[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [loading, setLoading] = useState(true);
  const [newFolder, setNewFolder] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const fetchSaved = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedFolder !== 'All') params.set('folder', selectedFolder);
      const res = await fetch(`/api/saved?${params}`);
      const data = await res.json();
      setSaved(data.saved || []);
      setFolders(data.folders || []);
    } catch {
      setSaved([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFolder]);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const removeSaved = async (id: number) => {
    await fetch(`/api/saved/${id}`, { method: 'DELETE' });
    setSaved(prev => prev.filter(s => s.id !== id));
  };

  const allFolders = ['All', ...folders.filter(f => f !== 'All')];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Saved Content</h1>
        <button
          onClick={() => setShowNewFolder(!showNewFolder)}
          className="gradient-bg text-white px-4 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center space-x-2"
        >
          <span>+</span>
          <span>New Folder</span>
        </button>
      </div>

      {showNewFolder && (
        <div className="flex gap-2">
          <input
            value={newFolder}
            onChange={e => setNewFolder(e.target.value)}
            placeholder="Folder name..."
            className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => { if (newFolder) { setFolders(prev => [...prev, newFolder]); setNewFolder(''); setShowNewFolder(false); } }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {allFolders.map(folder => (
          <button
            key={folder}
            onClick={() => setSelectedFolder(folder)}
            className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition-colors ${
              selectedFolder === folder ? 'gradient-bg text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {folder}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
          <p className="mt-4 text-gray-500">Loading saved content...</p>
        </div>
      ) : saved.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-6xl">💾</span>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No saved content</h3>
          <p className="mt-2 text-gray-600">Start saving content from the Tracked or Explore pages</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {saved.map(item => (
            <div key={item.id} className="bg-white rounded-2xl overflow-hidden card-shadow hover:shadow-lg transition-shadow cursor-pointer group">
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

                <button
                  onClick={(e) => { e.stopPropagation(); removeSaved(item.id); }}
                  className="absolute bottom-3 right-3 bg-red-500 hover:bg-red-600 p-2 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs">{item.platform === 'instagram' ? '📸' : '🎵'}</span>
                    <p className="font-medium text-gray-900 text-sm">@{item.username}</p>
                  </div>
                  <span className="text-xs text-gray-500">{new Date(item.saved_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-2">
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{item.folder}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
