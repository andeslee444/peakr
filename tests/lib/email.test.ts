import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendEmail } from '@/lib/email';

describe('sendEmail', () => {
  const orig = process.env.RESEND_API_KEY;
  afterEach(() => {
    if (orig === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = orig;
    vi.restoreAllMocks();
  });

  it('no-ops (does not call fetch) when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' });
    expect(res).toEqual({ sent: false, reason: 'no_api_key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to Resend with bearer auth when the key is set', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: '1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>x</p>' });
    expect(res.sent).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toContain('resend.com');
    expect(opts.headers.Authorization).toContain('test_key');
    expect(JSON.parse(opts.body)).toMatchObject({ to: 'a@b.com', subject: 'Hi' });
  });
});
