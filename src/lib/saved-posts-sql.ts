/**
 * Build a user-scoped `is_saved` SELECT fragment for post-list queries.
 *
 * `saved_posts` is per-user (`UNIQUE(user_id, post_id)`). A plain
 * `LEFT JOIN saved_posts sp ON sp.post_id = p.id` (the original code) is wrong on
 * two counts:
 *   1. Row fan-out — a post saved by N users returns N duplicate rows, desyncing
 *      the page from its `COUNT(*)` and breaking OFFSET pagination.
 *   2. Cross-user leak — `is_saved` becomes true if *anyone* saved the post.
 *
 * An `EXISTS` subquery scoped to the requesting user yields exactly one boolean
 * per post row and only ever reflects that user's own saves.
 */
export interface SavedClause {
  /** SQL fragment for the SELECT list, e.g. `EXISTS(...) AS is_saved`. */
  fragment: string;
  /** Bind params to push, in order (the user id, or none for anonymous). */
  params: number[];
  /** The next free positional-param index after this clause. */
  nextIndex: number;
}

export function savedPostsClause(userId: number | null | undefined, paramIndex: number): SavedClause {
  if (userId === null || userId === undefined) {
    return { fragment: 'false AS is_saved', params: [], nextIndex: paramIndex };
  }
  return {
    fragment: `EXISTS (SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = $${paramIndex}) AS is_saved`,
    params: [userId],
    nextIndex: paramIndex + 1,
  };
}
