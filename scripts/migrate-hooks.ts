/**
 * Two-step migration: global hook_patterns + user_saved_patterns
 *
 * Step 1 — Backfill global patterns: For every analyzed post with a hook_template,
 *          normalize and upsert into hook_patterns + link via hook_pattern_posts.
 * Step 2 — Migrate user saves: Convert user_hooks → user_saved_patterns.
 *
 * Run: DATABASE_URL=... npx tsx scripts/migrate-hooks.ts
 */

import pg from 'pg';

function normalizeTemplate(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}$/, '')
    .replace(/[.,!?]+$/, '')
    .trim();
}

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const client = await pool.connect();

  try {
    // ======= STEP 1: Backfill global hook_patterns from all analyzed posts =======
    console.log('\n=== Step 1: Backfill global hook_patterns ===\n');

    const { rows: analyzedPosts } = await client.query(`
      SELECT id, hook_analysis, viral_score, views
      FROM posts
      WHERE analyzed_at IS NOT NULL
        AND hook_analysis->>'hook_template' IS NOT NULL
    `);

    console.log(`Found ${analyzedPosts.length} analyzed posts with hook_templates`);

    await client.query('BEGIN');

    let patternsCreated = 0;
    let postsLinked = 0;

    for (const post of analyzedPosts) {
      const rawTemplate = post.hook_analysis?.hook_template;
      if (!rawTemplate) continue;

      const canonical = normalizeTemplate(String(rawTemplate));
      if (!canonical) continue;

      const hookType = post.hook_analysis?.hook_type || null;
      const niche = post.hook_analysis?.niche || null;

      // Upsert pattern
      const { rows: [pattern] } = await client.query(
        `INSERT INTO hook_patterns (canonical_template, display_name, hook_type, niche)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (canonical_template) DO UPDATE SET updated_at = NOW()
         RETURNING id, (xmax = 0) AS is_new`,
        [canonical, String(rawTemplate), hookType, niche]
      );

      if (pattern.is_new) patternsCreated++;

      // Link post to pattern
      const { rowCount } = await client.query(
        `INSERT INTO hook_pattern_posts (pattern_id, post_id)
         VALUES ($1, $2)
         ON CONFLICT (pattern_id, post_id) DO NOTHING`,
        [pattern.id, post.id]
      );

      if (rowCount && rowCount > 0) postsLinked++;
    }

    // Bulk recalculate all pattern stats
    await client.query(`
      UPDATE hook_patterns hp SET
        example_count = COALESCE(sub.cnt, 0),
        avg_viral_score = COALESCE(sub.avg_vs, 0),
        avg_views = COALESCE(sub.avg_v, 0),
        updated_at = NOW()
      FROM (
        SELECT hpp.pattern_id,
               COUNT(*) AS cnt,
               AVG(p.viral_score) AS avg_vs,
               AVG(p.views) AS avg_v
        FROM hook_pattern_posts hpp
        JOIN posts p ON hpp.post_id = p.id
        GROUP BY hpp.pattern_id
      ) sub
      WHERE hp.id = sub.pattern_id
    `);

    await client.query('COMMIT');

    console.log(`  Patterns created: ${patternsCreated}`);
    console.log(`  Posts linked: ${postsLinked}`);

    // ======= STEP 2: Migrate user saves (user_hooks → user_saved_patterns) =======
    console.log('\n=== Step 2: Migrate user saves ===\n');

    const { rows: userHooks } = await client.query(`
      SELECT uh.user_id, uh.canonical_template, uh.notes
      FROM user_hooks uh
      WHERE uh.canonical_template IS NOT NULL
    `);

    console.log(`Found ${userHooks.length} user_hooks rows with canonical_template`);

    await client.query('BEGIN');

    let savesMigrated = 0;
    let savesSkipped = 0;

    for (const uh of userHooks) {
      // Find matching global pattern
      const { rows: patterns } = await client.query(
        'SELECT id FROM hook_patterns WHERE canonical_template = $1',
        [uh.canonical_template]
      );

      if (patterns.length === 0) {
        savesSkipped++;
        continue;
      }

      const patternId = patterns[0].id;

      await client.query(
        `INSERT INTO user_saved_patterns (user_id, pattern_id, notes)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, pattern_id) DO NOTHING`,
        [uh.user_id, patternId, uh.notes]
      );

      savesMigrated++;
    }

    await client.query('COMMIT');

    console.log(`  Saves migrated: ${savesMigrated}`);
    console.log(`  Saves skipped (no pattern match): ${savesSkipped}`);

    console.log('\nMigration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
