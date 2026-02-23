import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const { id } = await params;
  const patternId = parseInt(id, 10);

  if (isNaN(patternId)) {
    return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

  const pool = getPool();

  try {
    // Verify user has saved this pattern and get pattern data
    const { rows: [hook] } = await pool.query(`
      SELECT usp.id, hp.id AS pattern_id, hp.canonical_template, hp.display_name,
             hp.hook_type, hp.niche, usp.notes, usp.saved_at,
             hp.example_count, hp.avg_viral_score, hp.avg_views
      FROM user_saved_patterns usp
      JOIN hook_patterns hp ON usp.pattern_id = hp.id
      WHERE hp.id = $1 AND usp.user_id = $2
    `, [patternId, userId]);

    if (!hook) {
      return NextResponse.json({ error: 'Saved pattern not found' }, { status: 404 });
    }

    // Get top example
    const { rows: topRows } = await pool.query(`
      SELECT p.id AS post_id, p.thumbnail_url, p.s3_thumbnail_url,
             p.viral_score, p.views, pr.username, pr.platform
      FROM hook_pattern_posts hpp
      JOIN posts p ON hpp.post_id = p.id
      JOIN profiles pr ON p.profile_id = pr.id
      WHERE hpp.pattern_id = $1
      ORDER BY p.viral_score DESC
      LIMIT 1
    `, [patternId]);

    const topExample = topRows.length > 0 ? topRows[0] : null;

    // Get paginated examples
    const { rows: examples } = await pool.query(`
      SELECT p.id AS post_id, p.post_url, p.thumbnail_url, p.s3_thumbnail_url,
             p.description, p.views, p.likes, p.viral_score,
             pr.username, pr.platform, pr.avatar_url,
             p.hook_analysis, hpp.linked_at
      FROM hook_pattern_posts hpp
      JOIN posts p ON hpp.post_id = p.id
      JOIN profiles pr ON p.profile_id = pr.id
      WHERE hpp.pattern_id = $1
      ORDER BY p.viral_score DESC
      LIMIT $2 OFFSET $3
    `, [patternId, limit, offset]);

    // Get total count for pagination
    const { rows: [countRow] } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM hook_pattern_posts WHERE pattern_id = $1',
      [patternId]
    );

    // Get collection IDs this pattern belongs to (for the current user)
    const { rows: collRows } = await pool.query(
      `SELECT hcp.collection_id
       FROM hook_collection_patterns hcp
       JOIN hook_collections hc ON hcp.collection_id = hc.id
       WHERE hcp.pattern_id = $1 AND hc.user_id = $2`,
      [patternId, userId]
    );
    const collection_ids = collRows.map(r => r.collection_id);

    return NextResponse.json({
      hook: {
        ...hook,
        top_example: topExample,
        examples,
        total_examples: countRow.total,
        collection_ids,
      },
    });
  } catch (err) {
    console.error('user-hooks [id] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch pattern' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const { id } = await params;
  const patternId = parseInt(id, 10);

  if (isNaN(patternId)) {
    return NextResponse.json({ error: 'Invalid pattern ID' }, { status: 400 });
  }

  const body = await request.json();
  const { notes } = body;

  if (notes === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const pool = getPool();

  try {
    const { rowCount } = await pool.query(
      `UPDATE user_saved_patterns SET notes = $1 WHERE pattern_id = $2 AND user_id = $3`,
      [notes, patternId, userId]
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: 'Saved pattern not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('user-hooks [id] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update notes' }, { status: 500 });
  }
}
