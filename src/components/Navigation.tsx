'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: session } = useSession();

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setIsMenuOpen(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="font-bold text-xl text-gray-900">Peakr</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <button onClick={() => scrollTo('features')} className="text-gray-600 hover:text-gray-900 font-medium">
              About
            </button>
            <button onClick={() => scrollTo('pricing')} className="text-gray-600 hover:text-gray-900 font-medium">
              Pricing
            </button>
            {session ? (
              <Link
                href="/dashboard"
                className="gradient-bg text-white px-5 py-2 rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium">
                  Login
                </Link>
                <Link
                  href="/login"
                  className="gradient-bg text-white px-5 py-2 rounded-full font-medium hover:opacity-90 transition-opacity"
                >
                  Go Viral
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 space-y-4">
            <button onClick={() => scrollTo('features')} className="block w-full text-left text-gray-600 hover:text-gray-900 font-medium">
              About
            </button>
            <button onClick={() => scrollTo('pricing')} className="block w-full text-left text-gray-600 hover:text-gray-900 font-medium">
              Pricing
            </button>
            {session ? (
              <Link
                href="/dashboard"
                className="block text-center gradient-bg text-white px-5 py-2 rounded-full font-medium"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="block text-gray-600 hover:text-gray-900 font-medium">
                  Login
                </Link>
                <Link
                  href="/login"
                  className="block text-center gradient-bg text-white px-5 py-2 rounded-full font-medium"
                >
                  Go Viral
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
