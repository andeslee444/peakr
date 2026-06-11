import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

// Render without JSX so this stays a .test.ts file (matches vitest include glob).
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement('a', { href }, children as never),
}));

import Navigation from '@/components/Navigation';

describe('Navigation primary CTA', () => {
  it('routes "Go Viral" to /signup, not /login', () => {
    const html = renderToString(createElement(Navigation));
    expect(html).toContain('Go Viral');

    // Every anchor whose text is the primary CTA must go to /signup.
    const goViralAnchors = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>Go Viral<\/a>/g)];
    expect(goViralAnchors.length).toBeGreaterThan(0);
    for (const m of goViralAnchors) {
      expect(m[1]).toBe('/signup');
    }
    // And the bug guard: no "Go Viral" CTA may point at /login.
    expect(html).not.toMatch(/href="\/login"[^>]*>Go Viral<\/a>/);
  });

  it('still sends the secondary "Login" link to /login', () => {
    const html = renderToString(createElement(Navigation));
    expect(html).toMatch(/href="\/login"[^>]*>Login<\/a>/);
  });
});
