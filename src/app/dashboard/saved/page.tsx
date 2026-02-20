'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { formatNumber, formatViralScore, proxyImg } from '@/lib/format';
import type { SavedPost, HookAnalysis } from '@/lib/types';
import { HookOverlay, HookTextExcerpt } from '@/components/HookBadge';
import InsightsPanel from '@/components/InsightsPanel';

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedPost[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [loading, setLoading] = useState(true);
  const [newFolder, setNewFolder] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importFolder, setImportFolder] = useState('default');
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedPost, setSelectedPost] = useState<SavedPost | null>(null);

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

  // Sync import folder dropdown with active folder tab
  useEffect(() => {
    if (selectedFolder !== 'All') setImportFolder(selectedFolder);
  }, [selectedFolder]);

  const importTikTokLink = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportMsg(null);
    try {
      const res = await fetch('/api/saved/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim(), folder: importFolder }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportMsg({ type: 'error', text: data.error || 'Failed to import' });
        return;
      }
      if (data.already_saved) {
        setImportMsg({ type: 'success', text: 'Already saved to this folder!' });
      } else {
        setImportMsg({ type: 'success', text: 'Saved successfully!' });
      }
      setImportUrl('');
      fetchSaved();
    } catch {
      setImportMsg({ type: 'error', text: 'Network error — please try again' });
    } finally {
      setImportLoading(false);
    }
  };

  const removeSaved = async (id: number) => {
    try {
      const res = await fetch(`/api/saved/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSaved(prev => prev.filter(s => s.id !== id));
      }
    } catch {
      // Keep item in UI if delete failed
    }
  };

  const handlePostUpdate = useCallback((postId: number, updates: { hook_analysis: HookAnalysis; analyzed_at: string; transcript: string | null }) => {
    setSaved(prev => prev.map(s => s.post_id === postId ? { ...s, ...updates } : s));
    setSelectedPost(prev => prev && prev.post_id === postId ? { ...prev, ...updates } : prev);
  }, []);

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

      <div className="bg-white rounded-2xl p-4 card-shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Save Video Link</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={importUrl}
            onChange={e => { setImportUrl(e.target.value); setImportMsg(null); }}
            onKeyDown={e => e.key === 'Enter' && !importLoading && importTikTokLink()}
            placeholder="Paste TikTok or Instagram Reel URL..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <select
            value={importFolder}
            onChange={e => setImportFolder(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="default">default</option>
            {folders.filter(f => f !== 'default').map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <button
            onClick={importTikTokLink}
            disabled={importLoading || !importUrl.trim()}
            className="gradient-bg text-white px-5 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center space-x-2 text-sm whitespace-nowrap"
          >
            {importLoading ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <span>Save Link</span>
            )}
          </button>
        </div>
        {importMsg && (
          <p className={`mt-2 text-sm ${importMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {importMsg.text}
          </p>
        )}
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
            onClick={() => {
              if (newFolder && !folders.includes(newFolder)) {
                setFolders(prev => [...prev, newFolder]);
                setSelectedFolder(newFolder);
              }
              setNewFolder('');
              setShowNewFolder(false);
            }}
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
            <div
              key={item.id}
              className="bg-white rounded-2xl overflow-hidden card-shadow hover:shadow-lg transition-shadow group"
            >
              <div
                className="relative aspect-[9/16] bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={() => item.post_url && window.open(item.post_url, '_blank')}
              >
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

                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSaved(item.id); }}
                    className="bg-red-500 hover:bg-red-600 p-2 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setSelectedPost(item)}
              >
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
                {item.hook_analysis && item.analyzed_at && (
                  <HookTextExcerpt analysis={item.hook_analysis} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <InsightsPanel
        post={selectedPost}
        open={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        onPostUpdate={handlePostUpdate}
      />
    </div>
  );
}
