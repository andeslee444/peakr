/**
 * One-time migration: saved_hooks → user_hooks + user_hook_examples
 *
 * Run: npx tsx scripts/migrate-hooks.ts
 *
 * Requires DATABASE_URL in env.
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
    // Get all saved_hooks joined with posts
    const { rows: savedHooks } = await client.query(`
      SELECT sh.user_id, sh.post_id, sh.notes,
             p.hook_analysis, p.id AS post_id_check
      FROM saved_hooks sh
      JOIN posts p ON sh.post_id = p.id
      ORDER BY sh.user_id, sh.saved_at
    `);

    console.log(`Found ${savedHooks.length} saved_hooks rows to migrate`);

    // Group by (user_id, normalized template)
    const groups = new Map<string, { user_id: number; canonical: string | null; template: string | null; hook_type: string | null; niche: string | null; notes: string | null; post_ids: number[] }>();

    for (const sh of savedHooks) {
      const analysis = sh.hook_analysis;
      const rawTemplate = analysis?.hook_template ? String(analysis.hook_template) : null;
      const canonical = rawTemplate ? normalizeTemplate(rawTemplate) : null;
      const hookType = analysis?.hook_type || null;
      const niche = analysis?.niche || null;

      // Group key: user_id + canonical (or unique per null entry)
      const key = canonical
        ? `${sh.user_id}::${canonical}`
        : `${sh.user_id}::null::${sh.post_id}`;

      if (!groups.has(key)) {
        groups.set(key, {
          user_id: sh.user_id,
          canonical,
          template: rawTemplate,
          hook_type: hookType,
          niche,
          notes: sh.notes,
          post_ids: [],
        });
      }
      groups.get(key)!.post_ids.push(sh.post_id);
    }

    console.log(`Grouped into ${groups.size} patterns`);

    let migrated = 0;
    let skipped = 0;

    await client.query('BEGIN');

    for (const group of groups.values()) {
      try {
        // Check if pattern already exists
        let hookId: number;

        if (group.canonical) {
          const { rows: existing } = await client.query(
            `SELECT id FROM user_hooks WHERE user_id = $1 AND canonical_template = $2`,
            [group.user_id, group.canonical]
          );

          if (existing.length > 0) {
            hookId = existing[0].id;
          } else {
            const { rows: [newHook] } = await client.query(
              `INSERT INTO user_hooks (user_id, canonical_template, display_name, hook_type, niche, notes)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id`,
              [group.user_id, group.canonical, group.template, group.hook_type, group.niche, group.notes]
            );
            hookId = newHook.id;
          }
        } else {
          const { rows: [newHook] } = await client.query(
            `INSERT INTO user_hooks (user_id, canonical_template, display_name, hook_type, niche, notes)
             VALUES ($1, NULL, NULL, $2, $3, $4)
             RETURNING id`,
            [group.user_id, group.hook_type, group.niche, group.notes]
          );
          hookId = newHook.id;
        }

        // Add examples
        for (const postId of group.post_ids) {
          await client.query(
            `INSERT INTO user_hook_examples (user_hook_id, post_id)
             VALUES ($1, $2)
             ON CONFLICT (user_hook_id, post_id) DO NOTHING`,
            [hookId, postId]
          );
        }

        migrated++;
      } catch (err) {
        console.error(`Error migrating group for user ${group.user_id}:`, err);
        skipped++;
      }
    }

    await client.query('COMMIT');

    console.log(`\nMigration complete:`);
    console.log(`  Patterns migrated: ${migrated}`);
    console.log(`  Skipped (errors): ${skipped}`);
    console.log(`  Total examples: ${savedHooks.length}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
