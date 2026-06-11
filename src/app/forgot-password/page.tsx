'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      // Don't claim a link was sent if delivery is unavailable.
      if (res.status === 503 || data?.available === false) {
        setError(
          data?.message ||
            'Password reset is temporarily unavailable. Please contact support.'
        );
        return;
      }
      // Otherwise show the same confirmation regardless of whether the email exists.
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex justify-center items-center space-x-2">
          <div className="w-10 h-10 rounded-lg gradient-bg flex items-center justify-center">
            <span className="text-white font-bold text-xl">P</span>
          </div>
          <span className="font-bold text-2xl text-gray-900">Peakr</span>
        </Link>
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">Reset your password</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-2xl sm:px-10">
          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-gray-700">
                If an account exists for <span className="font-medium">{email}</span>, we&apos;ve
                sent a reset link. Check your inbox (and spam).
              </p>
              <Link href="/login" className="inline-block font-semibold text-indigo-600 hover:text-indigo-500">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="you@example.com"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white gradient-bg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isLoading ? 'Sending...' : 'Send reset link'}
              </button>
              <p className="text-center text-sm text-gray-600">
                <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
