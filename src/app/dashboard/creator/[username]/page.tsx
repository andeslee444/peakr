'use client';

import { useState, useEffect, useCallback } from 'react';
import { isAnalyzed } from '@/lib/scrape-status';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { formatNumber, formatViralScore, proxyImg, formatFreshness } from '@/lib/format';
import type { Post, HookAnalysis } from '@/lib/types';
import { HookTypeBadge } from '@/components/HookBadge';
import InsightsPanel from '@/components/InsightsPanel';

interface ProfileStats {
  total_posts: number;
  analyzed_posts: number;
  avg_viral: number;
  max_viral: number;
  avg_views: number;
  max_views: number;
  viral_2x: number;
  viral_5x: number;
}

interface HookTypeBreakdown {
  hook_type: string;
  count: number;
}

export default function CreatorPage() {
  const params = useParams();
  const username = params.username as string;

  const [platform, setPlatform] = useState('');
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [hookTypes, setHookTypes] = useState<HookTypeBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [tab, setTab] = useState<'top' | 'analyzed'>('top');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('platform') || 'instagram';
    setPlatform(p);
  }, []);

  const fetchData = useCallback(async () => {
    if (!platform) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(username)}?platform=${platform}`);
      const data = await res.json();
      setProfile(data.profile || null);
      setPosts(data.posts || []);
      setStats(data.stats || null);
      setHookTypes(data.hook_types || []);
    } catch {
      setProfile(null);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [username, platform]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredPosts = tab === 'analyzed'
    ? posts.filter(isAnalyzed)
    : posts;

  // Viral score distribution buckets
  const distribution = posts.reduce((acc, p) => {
    if (p.viral_score < 1) acc['< 1x']++;
    else if (p.viral_score < 2) acc['1-2x']++;
    else if (p.viral_score < 3) acc['2-3x']++;
    else if (p.viral_score < 5) acc['3-5x']++;
    else acc['5x+']++;
    return acc;
  }, { '< 1x': 0, '1-2x': 0, '2-3x': 0, '3-5x': 0, '5x+': 0 } as Record<string, number>);
  const maxBucket = Math.max(...Object.values(distribution), 1);

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        <p className="mt-4 text-gray-500">Loading creator profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <span className="text-5xl">404</span>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Creator not found</h2>
        <Link href="/dashboard/tracked" className="mt-4 inline-block text-indigo-600 hover:text-indigo-700 font-medium">
          Back to Tracked
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/dashboard/tracked" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Tracked Accounts
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex-shrink-0 overflow-hidden">
            {(profile.avatar_url as string) ? (
              <Image src={proxyImg(profile.avatar_url as string)!} alt="" fill className="object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-2xl">&#x1F464;</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">@{username}</h1>
              <span className="text-lg">{platform === 'instagram' ? '📸' : '🎵'}</span>
            </div>
            {(profile.display_name as string) && (
              <p className="text-gray-500 text-sm">{profile.display_name as string}</p>
            )}
            <p className="text-gray-400 text-xs mt-0.5">
              {formatFreshness(profile.last_scraped_at as string | null, Date.now(), { staleAfterMs: 4 * 3600_000 })}
            </p>
            {(profile.bio as string) && (
              <p className="text-gray-600 text-sm mt-1 line-clamp-2">{profile.bio as string}</p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{formatNumber(profile.followers as number || 0)}</p>
            <p className="text-xs text-gray-500">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{stats?.total_posts || 0}</p>
            <p className="text-xs text-gray-500">Posts Tracked</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{formatNumber(Math.round(stats?.avg_views || 0))}</p>
            <p className="text-xs text-gray-500">Avg Views</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-indigo-600">{stats?.avg_viral?.toFixed(1) || '0.0'}x</p>
            <p className="text-xs text-gray-500">Avg Viral Score</p>
          </div>
        </div>
      </div>

      {/* Analytics cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Viral Score Distribution */}
        <div className="bg-white rounded-2xl p-5 card-shadow">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Viral Score Distribution</h3>
          <div className="space-y-2">
            {Object.entries(distribution).map(([label, count]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-10 text-right">{label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${label === '5x+' ? 'bg-amber-500' : label === '3-5x' ? 'bg-indigo-500' : label === '2-3x' ? 'bg-indigo-400' : 'bg-indigo-200'}`}
                    style={{ width: `${(count / maxBucket) * 100}%`, minWidth: count > 0 ? '8px' : '0' }}
                  />
                </div>
                <span className="text-xs text-gray-600 w-8">{count}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span>Peak: <strong className="text-gray-900">{stats?.max_viral?.toFixed(1)}x</strong></span>
            <span>2x+ hits: <strong className="text-gray-900">{stats?.viral_2x}</strong></span>
            <span>5x+ hits: <strong className="text-gray-900">{stats?.viral_5x}</strong></span>
          </div>
        </div>

        {/* Hook Types Used */}
        <div className="bg-white rounded-2xl p-5 card-shadow">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Hook Types Used</h3>
          {hookTypes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No analyzed posts yet</p>
          ) : (
            <div className="space-y-2">
              {hookTypes.slice(0, 6).map(ht => {
                const pct = Math.round((ht.count / (stats?.analyzed_posts || 1)) * 100);
                return (
                  <div key={ht.hook_type} className="flex items-center gap-3">
                    <HookTypeBadge hookType={ht.hook_type} />
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%`, minWidth: '8px' }} />
                    </div>
                    <span className="text-xs text-gray-600">{ht.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            {stats?.analyzed_posts || 0} of {stats?.total_posts || 0} posts analyzed
          </div>
        </div>
      </div>

      {/* Posts section */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Posts</h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setTab('top')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'top' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Top ({posts.length})
            </button>
            <button
              onClick={() => setTab('analyzed')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'analyzed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Analyzed ({posts.filter(isAnalyzed).length})
            </button>
          </div>
        </div>

        {filteredPosts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No posts to display</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredPosts.map(post => (
              <div
                key={post.id}
                className="group cursor-pointer"
                onClick={() => setSelectedPost(post)}
              >
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-100">
                  {(post.thumbnail_url || post.s3_thumbnail_url) ? (
                    <Image
                      src={proxyImg(post.thumbnail_url, post.s3_thumbnail_url)!}
                      alt=""
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-200"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">
                      {platform === 'instagram' ? '📸' : '🎵'}
                    </div>
                  )}
                  {/* Viral score */}
                  {post.viral_score > 0 && (
                    <div className={`absolute top-1.5 left-1.5 text-white text-xs font-bold px-1.5 py-0.5 rounded-md z-10 ${post.viral_score >= 3 ? 'bg-amber-500' : 'bg-black/60'}`}>
                      {formatViralScore(post.viral_score)}
                    </div>
                  )}
                  {/* Analyzed indicator */}
                  {isAnalyzed(post) && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center z-10">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {/* Views */}
                  {post.views > 0 && (
                    <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md z-10">
                      {formatNumber(post.views)}
                    </div>
                  )}
                </div>
                {/* Hook template preview */}
                {isAnalyzed(post) && (
                  <p className="text-[10px] text-gray-500 mt-1 line-clamp-2 px-0.5">
                    {(post.hook_analysis as HookAnalysis).hook_template || (post.hook_analysis as HookAnalysis).hook_type}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insights panel */}
      <InsightsPanel
        post={selectedPost}
        open={!!selectedPost}
        onClose={() => setSelectedPost(null)}
      />
    </div>
  );
}
