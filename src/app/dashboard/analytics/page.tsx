'use client';

import { useState } from 'react';

// Mock analytics data
const accountStats = [
  { username: 'yukatsunami', avgViews: '125K', avgEngagement: '8.2%', bestDay: 'Tuesday', topFormat: 'Reels', growth: '+12.5%' },
  { username: 'remi.tswjourney', avgViews: '890K', avgEngagement: '5.7%', bestDay: 'Thursday', topFormat: 'Reels', growth: '+23.1%' },
  { username: 'cheekyglo', avgViews: '234K', avgEngagement: '4.3%', bestDay: 'Saturday', topFormat: 'Duets', growth: '+8.9%' },
  { username: 'midnightmischief', avgViews: '56K', avgEngagement: '6.1%', bestDay: 'Wednesday', topFormat: 'Original', growth: '+15.2%' },
];

const topPerformingContent = [
  { rank: 1, username: 'yukatsunami', views: '13.8M', viralScore: '2946.8x', format: 'Reel' },
  { rank: 2, username: 'remi.tswjourney', views: '4.1M', viralScore: '202x', format: 'Reel' },
  { rank: 3, username: 'cheekyglo', views: '444.6K', viralScore: '380x', format: 'TikTok' },
  { rank: 4, username: 'midnightmischief', views: '98.9K', viralScore: '32.1x', format: 'TikTok' },
];

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Track performance across your accounts</p>
        </div>
        
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === range
                  ? 'gradient-bg text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-2xl">📊</span>
            <span className="text-green-500 text-sm font-medium">+15.3%</span>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">4</p>
          <p className="text-gray-600 text-sm">Tracked Accounts</p>
        </div>

        <div className="bg-white rounded-2xl p-6 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-2xl">👁️</span>
            <span className="text-green-500 text-sm font-medium">+23.7%</span>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">18.5M</p>
          <p className="text-gray-600 text-sm">Total Views Tracked</p>
        </div>

        <div className="bg-white rounded-2xl p-6 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-2xl">🔥</span>
            <span className="text-green-500 text-sm font-medium">+8.2%</span>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">12</p>
          <p className="text-gray-600 text-sm">Viral Posts (100x+)</p>
        </div>

        <div className="bg-white rounded-2xl p-6 card-shadow">
          <div className="flex items-center justify-between">
            <span className="text-2xl">💾</span>
            <span className="text-gray-500 text-sm font-medium">+4</span>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">28</p>
          <p className="text-gray-600 text-sm">Saved Content</p>
        </div>
      </div>

      {/* Account comparison */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Account</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Avg Views</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Engagement</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Best Day</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Top Format</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Growth</th>
              </tr>
            </thead>
            <tbody>
              {accountStats.map((account, index) => (
                <tr key={index} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-4 px-4">
                    <span className="font-medium text-gray-900">@{account.username}</span>
                  </td>
                  <td className="py-4 px-4 text-gray-600">{account.avgViews}</td>
                  <td className="py-4 px-4 text-gray-600">{account.avgEngagement}</td>
                  <td className="py-4 px-4 text-gray-600">{account.bestDay}</td>
                  <td className="py-4 px-4">
                    <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
                      {account.topFormat}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-green-500 font-medium">{account.growth}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top performing content */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Top Performing Content</h2>
          <button className="text-indigo-600 text-sm font-medium hover:text-indigo-700">
            Export CSV
          </button>
        </div>
        <div className="space-y-3">
          {topPerformingContent.map((content) => (
            <div
              key={content.rank}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-4">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                  content.rank === 1 ? 'bg-yellow-500' :
                  content.rank === 2 ? 'bg-gray-400' :
                  content.rank === 3 ? 'bg-amber-600' : 'bg-gray-300'
                }`}>
                  {content.rank}
                </span>
                <div>
                  <p className="font-medium text-gray-900">@{content.username}</p>
                  <p className="text-sm text-gray-500">{content.format}</p>
                </div>
              </div>
              <div className="flex items-center space-x-6">
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{content.views}</p>
                  <p className="text-xs text-gray-500">views</p>
                </div>
                <div className="viral-badge text-white text-sm font-bold px-3 py-1 rounded-full">
                  🔥 {content.viralScore}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Views Over Time</h2>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl">
          <div className="text-center">
            <span className="text-4xl">📈</span>
            <p className="mt-2 text-gray-500">Chart visualization would go here</p>
            <p className="text-sm text-gray-400">Integrate with Chart.js or Recharts</p>
          </div>
        </div>
      </div>
    </div>
  );
}
