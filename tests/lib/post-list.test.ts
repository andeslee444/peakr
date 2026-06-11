import { describe, it, expect } from 'vitest';
import { stripHeavyFields } from '@/lib/post-list';

describe('stripHeavyFields', () => {
  it('drops the heavy keyframe_base64 blob from list rows', () => {
    const rows = [
      { id: 1, username: 'a', transcript: 'hi', keyframe_base64: 'X'.repeat(100_000), viral_score: 3 },
    ];
    const out = stripHeavyFields(rows);
    expect(out[0]).not.toHaveProperty('keyframe_base64');
    // keep everything else the cards actually use
    expect(out[0].transcript).toBe('hi');
    expect(out[0].id).toBe(1);
    expect(out[0].viral_score).toBe(3);
  });

  it('is a no-op safe on rows without the field', () => {
    const out = stripHeavyFields([{ id: 2, username: 'b' }]);
    expect(out[0]).toEqual({ id: 2, username: 'b' });
  });
});
