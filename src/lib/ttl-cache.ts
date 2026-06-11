/**
 * Tiny in-process TTL cache for expensive read-mostly computations (e.g. the
 * per-user analytics aggregations). Per-instance on serverless — it smooths
 * repeated hits to a warm function, not a shared cache. For cross-instance
 * sharing use a real store (Upstash/KV).
 */
interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();

export async function getCached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  nowMs: number = Date.now()
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > nowMs) {
    return hit.value as T;
  }
  const value = await fn();
  store.set(key, { value, expires: nowMs + ttlMs });
  return value;
}

/** Test/util hook to reset the cache. */
export function clearTtlCache(): void {
  store.clear();
}
