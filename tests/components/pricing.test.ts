import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { PRO_TRACK_LIMIT } from '@/lib/plan';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement('a', { href }, children as never),
}));

import Pricing from '@/components/Pricing';

describe('Pricing track limits', () => {
  it('derives the paid track-limit copy from the plan constants (single source of truth)', () => {
    const html = renderToString(createElement(Pricing));
    expect(html).toContain(`Track ${PRO_TRACK_LIMIT} accounts`);
    // The stale hardcoded "15" that contradicted what the code actually grants.
    expect(html).not.toContain('Track 15 accounts');
  });
});
