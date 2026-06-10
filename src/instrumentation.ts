/**
 * Next.js instrumentation hook — runs once when the server boots. Initializes
 * Sentry for the Node.js runtime (no-op without SENTRY_DSN).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('./lib/observability');
    await initSentry();
  }
}
