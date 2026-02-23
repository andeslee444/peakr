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
      `SELECT p.id, p.hook_analysis, p.viral_score, p.views, pr.username, pr.platform
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

    if (!canonical) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: "Post hasn't been analyzed yet" }, { status: 400 });
    }

    const hookType = analysis?.hook_type || null;
    const niche = analysis?.niche || null;

    // Upsert into hook_patterns
    const { rows: [pattern] } = await client.query(
      `INSERT INTO hook_patterns (canonical_template, display_name, hook_type, niche)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (canonical_template) DO UPDATE SET updated_at = NOW()
       RETURNING id, display_name, example_count, avg_viral_score`,
      [canonical, template, hookType, niche]
    );

    // Link post to pattern
    await client.query(
      `INSERT INTO hook_pattern_posts (pattern_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (pattern_id, post_id) DO NOTHING`,
      [pattern.id, post_id]
    );

    // Update pattern stats
    await client.query(
      `UPDATE hook_patterns SET
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
       WHERE hook_patterns.id = $1`,
      [pattern.id]
    );

    // Save pattern for user
    const { rows: [saved] } = await client.query(
      `INSERT INTO user_saved_patterns (user_id, pattern_id, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, pattern_id) DO UPDATE SET notes = COALESCE(EXCLUDED.notes, user_saved_patterns.notes)
       RETURNING id, (xmax = 0) AS is_new_save`,
      [userId, pattern.id, notes || null]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      pattern_id: pattern.id,
      display_name: pattern.display_name || 'Pending analysis',
      example_count: pattern.example_count,
      avg_viral_score: pattern.avg_viral_score,
      is_new_save: saved.is_new_save,
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
  const collectionId = searchParams.get('collection_id');
  const sort = searchParams.get('sort') || 'saved_at';

  const pool = getPool();

  const conditions: string[] = ['usp.user_id = $1'];
  const params: (string | number)[] = [userId];
  let paramIdx = 2;

  if (hookType) {
    conditions.push(`hp.hook_type = $${paramIdx++}`);
    params.push(hookType);
  }
  if (niche) {
    conditions.push(`hp.niche = $${paramIdx++}`);
    params.push(niche);
  }
  if (collectionId) {
    conditions.push(`EXISTS (SELECT 1 FROM hook_collection_patterns hcp WHERE hcp.pattern_id = hp.id AND hcp.collection_id = $${paramIdx++})`);
    params.push(Number(collectionId));
  }

  let orderBy: string;
  switch (sort) {
    case 'avg_viral_score': orderBy = 'hp.avg_viral_score DESC'; break;
    case 'example_count': orderBy = 'hp.example_count DESC'; break;
    default: orderBy = 'usp.saved_at DESC';
  }

  try {
    const { rows: hooks } = await pool.query(`
      SELECT usp.id, hp.id AS pattern_id, hp.canonical_template, hp.display_name,
             hp.hook_type, hp.niche, usp.notes, usp.saved_at,
             hp.example_count, hp.avg_viral_score, hp.avg_views,
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
               FROM hook_pattern_posts hpp2
               JOIN posts p ON hpp2.post_id = p.id
               JOIN profiles pr ON p.profile_id = pr.id
               WHERE hpp2.pattern_id = hp.id
               ORDER BY p.viral_score DESC
               LIMIT 1
             ) AS top_example
      FROM user_saved_patterns usp
      JOIN hook_patterns hp ON usp.pattern_id = hp.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
    `, params);

    // Fetch example thumbnails for each pattern (up to 5)
    const patternIds = hooks.map(h => h.pattern_id);
    let exampleThumbnails: Record<number, Array<{ post_id: number; thumbnail_url: string | null; s3_thumbnail_url: string | null }>> = {};

    if (patternIds.length > 0) {
      const { rows: examples } = await pool.query(`
        SELECT hpp.pattern_id, p.id as post_id, p.thumbnail_url, p.s3_thumbnail_url
        FROM hook_pattern_posts hpp
        JOIN posts p ON hpp.post_id = p.id
        WHERE hpp.pattern_id = ANY($1)
        ORDER BY p.viral_score DESC
      `, [patternIds]);

      for (const ex of examples) {
        if (!exampleThumbnails[ex.pattern_id]) {
          exampleThumbnails[ex.pattern_id] = [];
        }
        if (exampleThumbnails[ex.pattern_id].length < 5) {
          exampleThumbnails[ex.pattern_id].push({
            post_id: ex.post_id,
            thumbnail_url: ex.thumbnail_url,
            s3_thumbnail_url: ex.s3_thumbnail_url,
          });
        }
      }
    }

    const enrichedHooks = hooks.map(h => ({
      ...h,
      example_thumbnails: exampleThumbnails[h.pattern_id] || [],
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
  const { pattern_id, post_id } = body;

  if (!pattern_id && !post_id) {
    return NextResponse.json({ error: 'pattern_id or post_id is required' }, { status: 400 });
  }

  const pool = getPool();

  try {
    let targetPatternId = pattern_id;

    if (!targetPatternId && post_id) {
      // Look up pattern_id from post's hook_template
      const { rows } = await pool.query(
        `SELECT hp.id AS pattern_id
         FROM posts p
         JOIN hook_pattern_posts hpp ON hpp.post_id = p.id
         JOIN hook_patterns hp ON hpp.pattern_id = hp.id
         WHERE p.id = $1
         LIMIT 1`,
        [post_id]
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Pattern not found for this post' }, { status: 404 });
      }
      targetPatternId = rows[0].pattern_id;
    }

    const { rowCount } = await pool.query(
      'DELETE FROM user_saved_patterns WHERE pattern_id = $1 AND user_id = $2',
      [targetPatternId, userId]
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: 'Saved pattern not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('user-hooks DELETE error:', err);
    return NextResponse.json({ error: 'Failed to unsave pattern' }, { status: 500 });
  }
}
