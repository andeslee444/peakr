/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ['pg', '@sentry/node'],
  experimental: {
    // Enable the instrumentation.ts hook (stable in Next 15; flagged in 14.2).
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
