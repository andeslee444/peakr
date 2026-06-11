/**
 * Shared hook-pattern stat recompute. Used by every path that links a post to a
 * pattern (manual save + saved/import) so a pattern's example_count / averages
 * never drift — previously only the manual-save route recomputed them.
 */
export const RECOMPUTE_PATTERN_STATS_SQL = `
  UPDATE hook_patterns SET
    example_count = sub.cnt,
    avg_viral_score = sub.avg_vs,
    avg_views = sub.avg_v,
    updated_at = NOW()
  FROM (
    SELECT COUNT(*) AS cnt,
           COALESCE(AVG(p.viral_score), 0) AS avg_vs,
           COALESCE(AVG(p.views), 0) AS avg_v
    FROM hook_pattern_posts hpp
    JOIN posts p ON hpp.post_id = p.id
    WHERE hpp.pattern_id = $1
  ) sub
  WHERE hook_patterns.id = $1
`;

interface Queryable {
  query: (sql: string, params: unknown[]) => Promise<unknown>;
}

export async function recomputePatternStats(client: Queryable, patternId: number): Promise<void> {
  await client.query(RECOMPUTE_PATTERN_STATS_SQL, [patternId]);
}
