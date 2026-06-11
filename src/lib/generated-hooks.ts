/**
 * Persistence for AI-generated hooks so a user's generations survive a refresh /
 * navigation instead of being lost work. Best-effort: a storage failure never
 * blocks returning the freshly-generated hooks to the user.
 */
interface Queryable {
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
}

export async function persistGeneratedHooks(
  client: Queryable,
  userId: number,
  topic: string,
  hooks: unknown
): Promise<void> {
  try {
    await client.query(
      'INSERT INTO generated_hooks (user_id, topic, hooks) VALUES ($1, $2, $3)',
      [userId, topic, JSON.stringify(hooks)]
    );
  } catch {
    // best-effort — don't fail the generation because we couldn't save it
  }
}

export async function getRecentGenerations(
  client: Queryable,
  userId: number,
  limit = 20
): Promise<unknown[]> {
  const { rows } = await client.query(
    'SELECT id, topic, hooks, created_at FROM generated_hooks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return rows;
}
