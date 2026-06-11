import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement('a', { href }, children as never),
}));

import Hero from '@/components/Hero';

describe('Hero', () => {
  it('leads with the AI Hook Lab moat, not a generic "competitive insights" pitch', () => {
    const html = renderToString(createElement(Hero));
    expect(html.toLowerCase()).toContain('hook');
  });

  it('does not show fabricated, implausible viral scores', () => {
    const html = renderToString(createElement(Hero));
    expect(html).not.toContain('3090x');
    expect(html).not.toContain('202x');
  });

  it('primary CTA points to /signup', () => {
    const html = renderToString(createElement(Hero));
    expect(html).toMatch(/href="\/signup"/);
  });
});
