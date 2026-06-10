import { describe, it, expect } from 'vitest';
import { validatePlaybookSection } from '@/lib/playbook-schema';

const valid = {
  title: 'Curiosity Hooks for Fitness',
  templates: [
    { script: 'What if [X]?', example_filled: 'What if you never skipped leg day?' },
    { script: 'Nobody tells you [Y]', example_filled: 'Nobody tells you about recovery' },
  ],
  why_it_works: 'They open a loop the viewer needs closed.',
};

describe('validatePlaybookSection', () => {
  it('accepts a well-formed section', () => {
    expect(validatePlaybookSection(valid)).toEqual(valid);
  });

  it('rejects a missing/empty title', () => {
    expect(validatePlaybookSection({ ...valid, title: '' })).toBeNull();
    expect(validatePlaybookSection({ ...valid, title: undefined })).toBeNull();
  });

  it('rejects when templates is not a non-empty array', () => {
    expect(validatePlaybookSection({ ...valid, templates: [] })).toBeNull();
    expect(validatePlaybookSection({ ...valid, templates: 'nope' })).toBeNull();
  });

  it('rejects a template missing script or example_filled', () => {
    expect(validatePlaybookSection({ ...valid, templates: [{ script: 'x' }] })).toBeNull();
    expect(validatePlaybookSection({ ...valid, templates: [{ example_filled: 'x' }] })).toBeNull();
  });

  it('rejects a missing why_it_works', () => {
    expect(validatePlaybookSection({ ...valid, why_it_works: undefined })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(validatePlaybookSection(null)).toBeNull();
    expect(validatePlaybookSection('string')).toBeNull();
  });
});
