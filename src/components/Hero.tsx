'use client';

import Link from 'next/link';

const sampleContent = [
  { username: '@midnightmischiefsleepwear', score: '4.9x', image: '🌙' },
  { username: '@xixiplease', score: '3090x', image: '✨' },
  { username: '@yukatsunami', score: '3.8x', image: '🌊' },
  { username: '@remi.tswjourney', score: '202x', image: '🎯' },
  { username: '@cheekyglo', score: '181x', image: '💫' },
];

export default function Hero() {
  return (
    <section className="pt-24 pb-16 px-4 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Text */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              <span className="gradient-text">Go viral</span>
              <br />
              with Competitive Insights
            </h1>
            <p className="mt-6 text-lg text-gray-600 max-w-xl mx-auto lg:mx-0">
              Track any public Instagram or TikTok account to see which content,
              creators, and formats are actually performing.
            </p>
            <div className="mt-8">
              <Link
                href="/signup"
                className="inline-block gradient-bg text-white px-8 py-4 rounded-full font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg"
              >
                Go Viral
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-500">
              Trusted by creators and brands
            </p>
          </div>

          {/* Right side - Animated cards */}
          <div className="relative h-[400px] lg:h-[500px]">
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Animated scrolling content */}
              <div className="relative w-full max-w-md">
                {sampleContent.map((item, index) => (
                  <div
                    key={index}
                    className="absolute bg-white rounded-2xl shadow-xl p-4 transform transition-all duration-500 hover:scale-105"
                    style={{
                      top: `${index * 60}px`,
                      left: `${(index % 2) * 40}px`,
                      zIndex: sampleContent.length - index,
                      transform: `rotate(${(index % 2 === 0 ? -1 : 1) * 3}deg)`,
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-2xl">
                        {item.image}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="viral-badge text-white text-xs font-bold px-2 py-1 rounded-full">
                            🔥 {item.score}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{item.username}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
