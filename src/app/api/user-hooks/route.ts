import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { normalizeTemplate } from '@/lib/normalize-template';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const body = await request.json();
  const { post_id, notes } = body;

  if (!post_id || typeof post_id !== 'number') {
    return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch the post and its hook_analysis
    const { rows: [post] } = await client.query(
      `SELECT p.id, p.hook_analysis, p.views, pr.username, pr.platform
       FROM posts p
       JOIN profiles pr ON p.profile_id = pr.id
       WHERE p.id = $1`,
      [post_id]
    );

    if (!post) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const analysis = post.hook_analysis;
    const template = analysis?.hook_template ? String(analysis.hook_template) : null;
    const canonical = template ? normalizeTemplate(template) : null;
    const hookType = analysis?.hook_type || null;
    const niche = analysis?.niche || null;
    const displayName = template || null;

    let userHookId: number;
    let isNewPattern = false;

    if (canonical) {
      // Check for existing pattern
      const { rows: existing } = await client.query(
        `SELECT id FROM user_hooks WHERE user_id = $1 AND canonical_template = $2`,
        [userId, canonical]
      );

      if (existing.length > 0) {
        userHookId = existing[0].id;
      } else {
        const { rows: [newHook] } = await client.query(
          `INSERT INTO user_hooks (user_id, canonical_template, display_name, hook_type, niche, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [userId, canonical, displayName, hookType, niche, notes || null]
        );
        userHookId = newHook.id;
        isNewPattern = true;
      }
    } else {
      // No template — create a pending hook entry
      const { rows: [newHook] } = await client.query(
        `INSERT INTO user_hooks (user_id, canonical_template, display_name, hook_type, niche, notes)
         VALUES ($1, NULL, NULL, $2, $3, $4)
         RETURNING id`,
        [userId, hookType, niche, notes || null]
      );
      userHookId = newHook.id;
      isNewPattern = true;
    }

    // Add the example (ignore if duplicate)
    await client.query(
      `INSERT INTO user_hook_examples (user_hook_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_hook_id, post_id) DO NOTHING`,
      [userHookId, post_id]
    );

    // Update notes if provided on an existing pattern
    if (notes && !isNewPattern) {
      await client.query(
        `UPDATE user_hooks SET notes = $1, updated_at = NOW() WHERE id = $2`,
        [notes, userHookId]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      user_hook_id: userHookId,
      is_new_pattern: isNewPattern,
      display_name: displayName || 'Pending analysis',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('user-hooks POST error:', err);
    return NextResponse.json({ error: 'Failed to save hook' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const { searchParams } = new URL(request.url);
  const hookType = searchParams.get('hook_type');
  const niche = searchParams.get('niche');

  const pool = getPool();

  const conditions: string[] = ['uh.user_id = $1'];
  const params: (string | number)[] = [userId];
  let paramIdx = 2;

  if (hookType) {
    conditions.push(`uh.hook_type = $${paramIdx++}`);
    params.push(hookType);
  }
  if (niche) {
    conditions.push(`uh.niche = $${paramIdx++}`);
    params.push(niche);
  }

  try {
    // Backfill: update any NULL canonical_template entries where the post has since been analyzed
    await pool.query(`
      UPDATE user_hooks uh SET
        canonical_template = lower(trim(regexp_replace(regexp_replace(trim((p.hook_analysis->>'hook_template')), '\\s+', ' ', 'g'), '[.,!?]+$|\.{2,}$', '', 'g'))),
        display_name = p.hook_analysis->>'hook_template',
        hook_type = COALESCE(uh.hook_type, p.hook_analysis->>'hook_type'),
        niche = COALESCE(uh.niche, p.hook_analysis->>'niche'),
        updated_at = NOW()
      FROM user_hook_examples uhe
      JOIN posts p ON uhe.post_id = p.id
      WHERE uhe.user_hook_id = uh.id
        AND uh.canonical_template IS NULL
        AND uh.user_id = $1
        AND p.hook_analysis->>'hook_template' IS NOT NULL
    `, [userId]);

    const { rows: hooks } = await pool.query(`
      SELECT uh.id, uh.canonical_template, uh.display_name, uh.hook_type, uh.niche,
             uh.notes, uh.created_at,
             COUNT(uhe.id)::int AS example_count,
             (
               SELECT json_build_object(
                 'post_id', p.id,
                 'thumbnail_url', p.thumbnail_url,
                 's3_thumbnail_url', p.s3_thumbnail_url,
                 'viral_score', p.viral_score,
                 'views', p.views,
                 'username', pr.username,
                 'platform', pr.platform
               )
               FROM user_hook_examples uhe2
               JOIN posts p ON uhe2.post_id = p.id
               JOIN profiles pr ON p.profile_id = pr.id
               WHERE uhe2.user_hook_id = uh.id
               ORDER BY p.viral_score DESC
               LIMIT 1
             ) AS top_example
      FROM user_hooks uh
      LEFT JOIN user_hook_examples uhe ON uhe.user_hook_id = uh.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY uh.id
      ORDER BY uh.updated_at DESC
    `, params);

    // Also fetch all example thumbnails for each hook (up to 5)
    const hookIds = hooks.map(h => h.id);
    let exampleThumbnails: Record<number, Array<{ post_id: number; thumbnail_url: string | null; s3_thumbnail_url: string | null }>> = {};

    if (hookIds.length > 0) {
      const { rows: examples } = await pool.query(`
        SELECT uhe.user_hook_id, p.id as post_id, p.thumbnail_url, p.s3_thumbnail_url
        FROM user_hook_examples uhe
        JOIN posts p ON uhe.post_id = p.id
        WHERE uhe.user_hook_id = ANY($1)
        ORDER BY uhe.added_at DESC
      `, [hookIds]);

      exampleThumbnails = {};
      for (const ex of examples) {
        if (!exampleThumbnails[ex.user_hook_id]) {
          exampleThumbnails[ex.user_hook_id] = [];
        }
        if (exampleThumbnails[ex.user_hook_id].length < 5) {
          exampleThumbnails[ex.user_hook_id].push({
            post_id: ex.post_id,
            thumbnail_url: ex.thumbnail_url,
            s3_thumbnail_url: ex.s3_thumbnail_url,
          });
        }
      }
    }

    const enrichedHooks = hooks.map(h => ({
      ...h,
      example_thumbnails: exampleThumbnails[h.id] || [],
    }));

    return NextResponse.json({ hooks: enrichedHooks });
  } catch (err) {
    console.error('user-hooks GET error:', err);
    return NextResponse.json({ hooks: [], error: 'Failed to fetch hooks' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const body = await request.json();
  const { user_hook_id } = body;

  if (!user_hook_id) {
    return NextResponse.json({ error: 'user_hook_id is required' }, { status: 400 });
  }

  const pool = getPool();

  try {
    // Verify ownership and delete (CASCADE removes examples)
    const { rowCount } = await pool.query(
      'DELETE FROM user_hooks WHERE id = $1 AND user_id = $2',
      [user_hook_id, userId]
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('user-hooks DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete hook' }, { status: 500 });
  }
}
