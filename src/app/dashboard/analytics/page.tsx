'use client';

import { useState, useEffect } from 'react';
import { formatNumber, formatViralScore } from '@/lib/format';
import { HookTypeBadge } from '@/components/HookBadge';

interface AccountStat {
  username: string;
  platform: string;
  followers: number;
  avatar_url: string | null;
  display_name: string | null;
  post_count: number;
  avg_views: number;
  avg_viral_score: number;
  max_viral_score: number;
  total_views: number;
  engagement_rate: number;
}

interface TopPost {
  id: number;
  username: string;
  platform: string;
  avatar_url: string | null;
  views: number;
  viral_score: number;
}

interface HookDistribution {
  hook_type: string;
  count: string;
  avg_viral_score: string;
  avg_hook_score: string;
}

interface TopHook {
  id: number;
  hook_type: string;
  hook_score: number;
  hook_text: string;
  hook_explanation: string;
  viral_score: number;
  views: number;
  post_url: string;
  username: string;
  platform: string;
}

interface HookData {
  distribution: HookDistribution[];
  topHooks: TopHook[];
  stats: {
    totalAnalyzed: number;
    avgHookScore: number;
    avgViralScore: number;
  };
}

interface ScheduleEntry {
  day?: number;
  hour?: number;
  count: number;
  avg_viral: number;
}

interface AnalyticsData {
  overview: {
    totalAccounts: number;
    totalPosts: number;
    avgViralScore: number;
    topViralScore: number;
    totalViews: number;
    viralPostCount: number;
  };
  accountStats: AccountStat[];
  topPosts: TopPost[];
  schedule?: {
    byDay: ScheduleEntry[];
    byHour: ScheduleEntry[];
  };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [hookData, setHookData] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics').then(r => r.json()),
      fetch('/api/analytics/hooks').then(r => r.json()),
    ])
      .then(([analyticsData, hooksData]) => {
        setData(analyticsData);
        setHookData(hooksData);
      })
      .catch(() => { setData(null); setHookData(null); })
      .finally(() => setLoading(false));
  }, []);

  const exportCSV = () => {
    window.open('/api/export?format=csv', '_blank');
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        <p className="mt-4 text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  const o = data?.overview || { totalAccounts: 0, totalPosts: 0, avgViralScore: 0, topViralScore: 0, totalViews: 0, viralPostCount: 0 };

  if (o.totalAccounts === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Track performance across your accounts</p>
        </div>
        <div className="bg-white rounded-2xl p-12 card-shadow text-center">
          <span className="text-4xl">📊</span>
          <h2 className="text-lg font-semibold text-gray-900 mt-4">No tracked accounts yet</h2>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            Start tracking Instagram and TikTok creators to see analytics on their performance, viral scores, and hook patterns.
          </p>
          <a
            href="/dashboard/tracked"
            className="inline-block mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
          >
            Track Your First Account
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Track performance across your accounts</p>
        </div>
        <button
          onClick={exportCSV}
          className="gradient-bg text-white px-4 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center space-x-2"
        >
          <span>📥</span>
          <span>Export CSV</span>
        </button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <span className="text-2xl">📊</span>
          <p className="mt-4 text-3xl font-bold text-gray-900">{o.totalAccounts}</p>
          <p className="text-gray-600 text-sm">Tracked Accounts</p>
        </div>
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <span className="text-2xl">👁️</span>
          <p className="mt-4 text-3xl font-bold text-gray-900">{formatNumber(o.totalViews)}</p>
          <p className="text-gray-600 text-sm">Total Views Tracked</p>
        </div>
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <span className="text-2xl">🔥</span>
          <p className="mt-4 text-3xl font-bold text-gray-900">{o.viralPostCount}</p>
          <p className="text-gray-600 text-sm">Viral Posts (100x+)</p>
        </div>
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <span className="text-2xl">⚡</span>
          <p className="mt-4 text-3xl font-bold text-gray-900">{formatViralScore(o.topViralScore)}</p>
          <p className="text-gray-600 text-sm">Top Viral Score</p>
        </div>
      </div>

      {/* Account comparison */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Comparison</h2>
        {(data?.accountStats?.length || 0) === 0 ? (
          <p className="text-gray-500 text-center py-8">No tracked accounts yet. Add profiles to see comparison.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Account</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Platform</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Followers</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Avg Views</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Engagement</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Avg Viral</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Posts</th>
                </tr>
              </thead>
              <tbody>
                {data!.accountStats.map((a, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-4 px-4 font-medium text-gray-900">@{a.username}</td>
                    <td className="py-4 px-4 text-gray-600">{a.platform === 'instagram' ? '📸' : '🎵'} {a.platform}</td>
                    <td className="py-4 px-4 text-gray-600">{formatNumber(a.followers)}</td>
                    <td className="py-4 px-4 text-gray-600">{formatNumber(Math.round(a.avg_views || 0))}</td>
                    <td className="py-4 px-4 text-gray-600">{(a.engagement_rate || 0).toFixed(1)}%</td>
                    <td className="py-4 px-4">
                      <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
                        {formatViralScore(a.avg_viral_score)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-600">{a.post_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top performing content */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Top Performing Content</h2>
          <button onClick={exportCSV} className="text-indigo-600 text-sm font-medium hover:text-indigo-700">Export CSV</button>
        </div>
        {(data?.topPosts?.length || 0) === 0 ? (
          <p className="text-gray-500 text-center py-8">No posts tracked yet.</p>
        ) : (
          <div className="space-y-3">
            {data!.topPosts.map((post, i) => (
              <div key={post.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex items-center space-x-4">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                    i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'
                  }`}>{i + 1}</span>
                  <div>
                    <p className="font-medium text-gray-900">@{post.username}</p>
                    <p className="text-sm text-gray-500">{post.platform === 'instagram' ? '📸 Instagram' : '🎵 TikTok'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatNumber(post.views)}</p>
                    <p className="text-xs text-gray-500">views</p>
                  </div>
                  <div className="viral-badge text-white text-sm font-bold px-3 py-1 rounded-full">
                    🔥 {formatViralScore(post.viral_score)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Posting Schedule Insights */}
      {data?.schedule && (data.schedule.byDay.length > 0 || data.schedule.byHour.length > 0) && (() => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const byDay = data.schedule!.byDay;
        const byHour = data.schedule!.byHour;
        const maxDayCount = Math.max(...byDay.map(d => d.count), 1);
        const maxHourCount = Math.max(...byHour.map(h => h.count), 1);

        // Find best day and best hour
        const bestDay = byDay.length > 0 ? byDay.reduce((a, b) => (Number(b.avg_viral) > Number(a.avg_viral) ? b : a)) : null;
        const bestHour = byHour.length > 0 ? byHour.reduce((a, b) => (Number(b.avg_viral) > Number(a.avg_viral) ? b : a)) : null;

        const formatHour = (h: number) => {
          if (h === 0) return '12am';
          if (h === 12) return '12pm';
          return h < 12 ? `${h}am` : `${h - 12}pm`;
        };

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Day of Week */}
            <div className="bg-white rounded-2xl p-6 card-shadow">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Posting by Day</h2>
              <p className="text-xs text-gray-500 mb-4">When tracked creators post, and which days go viral</p>
              <div className="space-y-2">
                {dayNames.map((name, i) => {
                  const entry = byDay.find(d => d.day === i);
                  const count = entry?.count || 0;
                  const avgViral = Number(entry?.avg_viral || 0);
                  const isBest = bestDay && bestDay.day === i;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`text-xs w-8 text-right ${isBest ? 'font-bold text-indigo-600' : 'text-gray-500'}`}>{name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden relative">
                        <div
                          className={`h-full rounded-full ${isBest ? 'bg-indigo-500' : 'bg-indigo-300'}`}
                          style={{ width: `${(count / maxDayCount) * 100}%`, minWidth: count > 0 ? '8px' : '0' }}
                        />
                        {count > 0 && (
                          <span className="absolute inset-0 flex items-center px-2 text-[10px] text-gray-700 font-medium">
                            {count} posts
                          </span>
                        )}
                      </div>
                      <span className={`text-xs w-12 text-right ${isBest ? 'font-bold text-indigo-600' : 'text-gray-500'}`}>
                        {avgViral > 0 ? `${avgViral.toFixed(1)}x` : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {bestDay && (
                <p className="text-xs text-indigo-600 font-medium mt-3 pt-3 border-t border-gray-100">
                  Best day: {dayNames[bestDay.day!]} ({Number(bestDay.avg_viral).toFixed(1)}x avg viral)
                </p>
              )}
            </div>

            {/* By Hour of Day */}
            <div className="bg-white rounded-2xl p-6 card-shadow">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Posting by Hour</h2>
              <p className="text-xs text-gray-500 mb-4">Post times and their viral performance</p>
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 24 }, (_, h) => {
                  const entry = byHour.find(e => e.hour === h);
                  const count = entry?.count || 0;
                  const avgViral = Number(entry?.avg_viral || 0);
                  const intensity = count / maxHourCount;
                  const isBest = bestHour && bestHour.hour === h;
                  return (
                    <div
                      key={h}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center relative group cursor-default ${
                        isBest ? 'ring-2 ring-indigo-500' : ''
                      }`}
                      style={{
                        backgroundColor: count > 0
                          ? `rgba(99, 102, 241, ${0.1 + intensity * 0.7})`
                          : '#f3f4f6',
                      }}
                      title={`${formatHour(h)}: ${count} posts, ${avgViral.toFixed(1)}x avg viral`}
                    >
                      <span className={`text-[9px] font-medium ${intensity > 0.5 ? 'text-white' : 'text-gray-600'}`}>
                        {formatHour(h)}
                      </span>
                      {count > 0 && (
                        <span className={`text-[8px] ${intensity > 0.5 ? 'text-indigo-100' : 'text-gray-500'}`}>
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {bestHour && (
                <p className="text-xs text-indigo-600 font-medium mt-3 pt-3 border-t border-gray-100">
                  Best hour: {formatHour(bestHour.hour!)} ({Number(bestHour.avg_viral).toFixed(1)}x avg viral)
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Hook Analysis Section */}
      {hookData && hookData.stats.totalAnalyzed > 0 && (
        <>
          <div className="bg-white rounded-2xl p-6 card-shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Hook Analysis</h2>
            <p className="text-sm text-gray-500 mb-4">{hookData.stats.totalAnalyzed} videos analyzed | Avg hook score: {hookData.stats.avgHookScore.toFixed(1)}/10</p>

            {hookData.distribution.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {hookData.distribution.map(d => (
                  <div key={d.hook_type} className="bg-gray-50 rounded-xl p-3">
                    <HookTypeBadge hookType={d.hook_type} />
                    <p className="mt-2 text-2xl font-bold text-gray-900">{d.count}</p>
                    <p className="text-xs text-gray-500">Avg viral: {formatViralScore(parseFloat(d.avg_viral_score))}</p>
                    <p className="text-xs text-gray-500">Avg score: {parseFloat(d.avg_hook_score).toFixed(1)}/10</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hookData.topHooks.length > 0 && (
            <div className="bg-white rounded-2xl p-6 card-shadow">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Hooks</h2>
              <div className="space-y-3">
                {hookData.topHooks.map((hook, i) => (
                  <div
                    key={hook.id}
                    onClick={() => hook.post_url && window.open(hook.post_url, '_blank')}
                    className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                      i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <HookTypeBadge hookType={hook.hook_type} />
                        <span className="text-sm font-bold text-gray-900">{hook.hook_score}/10</span>
                        <span className="text-xs text-gray-500">@{hook.username}</span>
                      </div>
                      {hook.hook_text && (
                        <p className="text-sm text-gray-700 italic line-clamp-2">&ldquo;{hook.hook_text}&rdquo;</p>
                      )}
                      {hook.hook_explanation && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{hook.hook_explanation}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-gray-900">{formatNumber(hook.views)}</p>
                      <p className="text-xs text-gray-500">views</p>
                      <div className="viral-badge text-white text-xs font-bold px-2 py-0.5 rounded-full mt-1">
                        {formatViralScore(hook.viral_score)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
