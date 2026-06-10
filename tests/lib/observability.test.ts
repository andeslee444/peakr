import { describe, it, expect, afterEach } from 'vitest';
import { initSentry, captureError } from '@/lib/observability';

describe('observability', () => {
  const orig = process.env.SENTRY_DSN;
  afterEach(() => {
    if (orig === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = orig;
  });

  it('initSentry returns false (no-op) when SENTRY_DSN is unset', async () => {
    delete process.env.SENTRY_DSN;
    expect(await initSentry()).toBe(false);
  });

  it('captureError never throws when Sentry is not configured', async () => {
    delete process.env.SENTRY_DSN;
    await expect(captureError(new Error('boom'), { route: 'test' })).resolves.toBeUndefined();
  });
});
