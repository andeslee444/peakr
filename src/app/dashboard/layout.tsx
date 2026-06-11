'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { isPro } from '@/lib/plan';

const navItems = [
  { name: 'Hook Lab', href: '/dashboard/hook-lab', icon: '🪝' },
  { name: 'Tracked', href: '/dashboard/tracked', icon: '📊' },
  { name: 'My Hooks', href: '/dashboard/saved', icon: '📌' },
  { name: 'Playbook', href: '/dashboard/playbook', icon: '📖' },
  { name: 'Analytics', href: '/dashboard/analytics', icon: '📈' },
  { name: 'Profile', href: '/dashboard/profile', icon: '👤' },
  { name: 'Account', href: '/dashboard/account', icon: '⚙️' },
];

// Bottom nav shows only the 5 most important items on mobile
const mobileNavItems = [
  { name: 'Lab', href: '/dashboard/hook-lab', icon: '🪝' },
  { name: 'Tracked', href: '/dashboard/tracked', icon: '📊' },
  { name: 'Hooks', href: '/dashboard/saved', icon: '📌' },
  { name: 'Playbook', href: '/dashboard/playbook', icon: '📖' },
  { name: 'More', href: '/dashboard/profile', icon: '⚙️' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { data: session } = useSession();
  const onboardingChecked = useRef(false);

  // Redirect new users to onboarding (profile setup)
  useEffect(() => {
    if (onboardingChecked.current || pathname === '/dashboard/profile') return;
    onboardingChecked.current = true;

    fetch('/api/creator-profile')
      .then(res => res.json())
      .then(data => {
        if (!data.profile || data.profile.onboarding_step !== 'complete') {
          router.replace('/dashboard/profile');
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  // Notifications
  interface Notification {
    id: number;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [workerAlive, setWorkerAlive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch('/api/worker-status')
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setWorkerAlive(d.alive !== false); })
        .catch(() => { /* leave unknown */ });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleUpgrade = useCallback(async () => {
    setUpgrading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error || 'Billing is not available yet. Please try again later.');
    } catch {
      alert('Something went wrong starting checkout.');
    } finally {
      setUpgrading(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // poll every 60s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showNotifications) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifications]);

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Shown only when there's no avatar image (see render below): the first letter
  // of the name, or '?' as a fallback. (Was a precedence bug: `a || b ? null : '?'`
  // parsed as `(a || b) ? null : '?'`, so it never showed the initial.)
  const userInitial = session?.user?.name?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="font-bold text-xl text-gray-900">Peakr</span>
          </Link>
        </div>

        <nav className="px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {!isPro((session?.user as { plan?: string } | undefined)?.plan) && (
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl p-4 text-white">
              <p className="font-semibold">Upgrade to Pro</p>
              <p className="text-sm text-indigo-100 mt-1">
                Track 50 accounts & more
              </p>
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="mt-3 w-full bg-white text-indigo-600 font-semibold py-2 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-60"
              >
                {upgrading ? 'Starting…' : 'Upgrade'}
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between">
          <button
            className="lg:hidden p-2 -ml-2"
            onClick={() => setIsSidebarOpen(true)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex-1 max-w-xl mx-4">
            {/* Search will be added per-page */}
          </div>

          <div className="flex items-center space-x-4">
            {/* Notifications bell */}
            <div className="relative" ref={notifRef}>
              <button
                className="p-2 text-gray-500 hover:text-gray-700 relative"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-11 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-400">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${!n.read_at ? 'bg-indigo-50/50' : ''}`}
                          onClick={() => {
                            if (n.link) router.push(n.link);
                            setShowNotifications(false);
                          }}
                        >
                          <p className={`text-sm ${!n.read_at ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            {session?.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white font-semibold">
                {userInitial}
              </div>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-sm text-gray-500 hover:text-gray-700 hidden sm:block"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 pb-24 lg:pb-6">
          {workerAlive === false && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Content updates are delayed right now — our scraper is catching up. Your data may not be the latest.
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 lg:hidden">
        <div className="flex items-center justify-around px-2 py-1">
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href ||
              pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors min-w-0 ${
                  isActive ? 'text-indigo-600' : 'text-gray-400'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px] font-medium mt-0.5">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
