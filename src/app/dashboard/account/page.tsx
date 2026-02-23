'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { formatNumber } from '@/lib/format';

interface Overview {
  totalAccounts: number;
  totalPosts: number;
  totalViews: number;
}

export default function AccountPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Overview | null>(null);

  const name = session?.user?.name || 'User';
  const image = session?.user?.image;

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(data => setStats(data.overview || null))
      .catch(() => {});
  }, []);

  const trackedCount = stats?.totalAccounts ?? 0;
  const trackLimit = 15;

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }

    setPwLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || 'Failed to change password');
      } else {
        setPwSuccess('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setPwError('Something went wrong');
    } finally {
      setPwLoading(false);
    }
  };

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
          {image ? (
            <img
              src={image}
              alt={name}
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full gradient-bg flex items-center justify-center text-white text-3xl font-bold">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-gray-900">{name}</p>
            <p className="text-sm text-gray-500 mt-1">{session?.user?.email || 'Signed in via TikTok'}</p>
          </div>
        </div>
      </div>

      {/* Change Password section */}
      <div className="bg-white rounded-2xl p-6 card-shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="Leave blank if setting for the first time"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="Re-enter new password"
            />
          </div>
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-green-600">{pwSuccess}</p>}
          <button
            type="submit"
            disabled={pwLoading}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {pwLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
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
    </div>
  );
}
