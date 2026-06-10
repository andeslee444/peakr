/**
 * Error monitoring, gated on SENTRY_DSN. When the DSN is unset, everything is a
 * logged no-op so dev/CI need no Sentry account. @sentry/node is imported lazily
 * so the no-DSN path pulls in no SDK code.
 */
type SentryModule = typeof import('@sentry/node');

let initialized = false;
let sentry: SentryModule | null = null;

export async function initSentry(): Promise<boolean> {
  if (initialized) return sentry !== null;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  try {
    const Sentry = (await import('@sentry/node')) as SentryModule;
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    });
    sentry = Sentry;
    return true;
  } catch (e) {
    console.error('[observability] Sentry init failed', e);
    return false;
  }
}

export async function captureError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!sentry) {
    if (!initialized) await initSentry();
  }
  if (sentry) {
    sentry.captureException(err, context ? { extra: context } : undefined);
  } else {
    console.error('[error]', err, context ?? '');
  }
}
