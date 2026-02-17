'use client';

import { useState, useEffect } from 'react';
import { formatNumber } from '@/lib/format';

interface Overview {
  totalAccounts: number;
  totalPosts: number;
  totalViews: number;
}

export default function AccountPage() {
  const [name, setName] = useState('Yuka Tsunashima');
  const [email, setEmail] = useState('yuka@example.com');
  const [stats, setStats] = useState<Overview | null>(null);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(data => setStats(data.overview || null))
      .catch(() => {});
  }, []);

  const trackedCount = stats?.totalAccounts ?? 0;
  const trackLimit = 15;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-600 mt-1">Manage your profile and subscription</p>
      </div>

      {/* Profile section */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>

        <div className="flex items-center space-x-4 mb-6">
          <div className="w-20 h-20 rounded-full gradient-bg flex items-center justify-center text-white text-3xl font-bold">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900">{name}</p>
            <p className="text-sm text-gray-500 mt-1">{email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <p className="text-xs text-gray-400">Account settings will be functional once authentication is implemented.</p>
        </div>
      </div>

      {/* Subscription section */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription</h2>

        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl p-6 text-white mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm">Current Plan</p>
              <p className="text-2xl font-bold mt-1">Monthly</p>
            </div>
            <div className="text-right">
              <p className="text-indigo-100 text-sm">Usage</p>
              <p className="font-semibold mt-1">{formatNumber(stats?.totalPosts ?? 0)} posts scraped</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center justify-between text-sm">
              <span>{trackLimit} tracked accounts</span>
              <span>{trackedCount} / {trackLimit} used</span>
            </div>
            <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${Math.min((trackedCount / trackLimit) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Password section */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Password</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm new password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <p className="text-xs text-gray-400">Password management will be functional once authentication is implemented.</p>
        </div>
      </div>
    </div>
  );
}
