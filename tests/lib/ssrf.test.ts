import { describe, it, expect } from 'vitest';
import { assertSafeUrl, UnsafeUrlError } from '@/lib/ssrf';

const IG = ['instagram.com', 'cdninstagram.com', 'fbcdn.net'];
const TT = ['tiktok.com', 'instagram.com'];

describe('assertSafeUrl', () => {
  it('accepts an allowlisted CDN host over https', () => {
    const u = assertSafeUrl('https://scontent.cdninstagram.com/v/abc.jpg', IG);
    expect(u.hostname).toBe('scontent.cdninstagram.com');
  });

  it('accepts the apex allowlisted host', () => {
    expect(() => assertSafeUrl('https://instagram.com/p/x', IG)).not.toThrow();
  });

  it('accepts a tiktok post url for the video allowlist', () => {
    expect(() => assertSafeUrl('https://www.tiktok.com/@u/video/123', TT)).not.toThrow();
  });

  it('rejects non-https schemes', () => {
    expect(() => assertSafeUrl('http://instagram.com/p/x', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('file:///etc/passwd', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('ftp://instagram.com/x', IG)).toThrow(UnsafeUrlError);
  });

  it('rejects the cloud metadata IP', () => {
    expect(() => assertSafeUrl('https://169.254.169.254/latest/meta-data/', IG)).toThrow(UnsafeUrlError);
  });

  it('rejects loopback and private IP literals', () => {
    expect(() => assertSafeUrl('https://127.0.0.1/x', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('https://10.0.0.5/x', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('https://192.168.1.1/x', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('https://172.16.0.9/x', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('https://[::1]/x', IG)).toThrow(UnsafeUrlError);
  });

  it('rejects hosts not on the allowlist', () => {
    expect(() => assertSafeUrl('https://evil.com/x', IG)).toThrow(UnsafeUrlError);
  });

  it('rejects suffix-spoofing of an allowlisted host', () => {
    expect(() => assertSafeUrl('https://instagram.com.evil.com/x', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('https://evilinstagram.com/x', IG)).toThrow(UnsafeUrlError);
  });

  it('rejects malformed input', () => {
    expect(() => assertSafeUrl('not a url', IG)).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('', IG)).toThrow(UnsafeUrlError);
  });
});
