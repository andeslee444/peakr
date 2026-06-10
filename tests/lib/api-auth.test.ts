import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
import { getUserId, unauthorized } from '@/lib/api-auth';

const mockAuth = vi.mocked(auth);

describe('getUserId', () => {
  beforeEach(() => mockAuth.mockReset());

  it('returns the numeric user id when a session exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: '42' } } as never);
    expect(await getUserId()).toBe(42);
  });

  it('returns null when there is no session', async () => {
    mockAuth.mockResolvedValue(null as never);
    expect(await getUserId()).toBeNull();
  });

  it('returns null when the session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} } as never);
    expect(await getUserId()).toBeNull();
  });
});

describe('unauthorized', () => {
  it('returns a 401 JSON response', async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});
