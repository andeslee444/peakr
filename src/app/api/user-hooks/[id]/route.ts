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
  const hookId = parseInt(id, 10);

  if (isNaN(hookId)) {
    return NextResponse.json({ error: 'Invalid hook ID' }, { status: 400 });
  }

  const pool = getPool();

  try {
    // Get the hook
    const { rows: [hook] } = await pool.query(`
      SELECT uh.id, uh.canonical_template, uh.display_name, uh.hook_type, uh.niche,
             uh.notes, uh.created_at,
             COUNT(uhe.id)::int AS example_count
      FROM user_hooks uh
      LEFT JOIN user_hook_examples uhe ON uhe.user_hook_id = uh.id
      WHERE uh.id = $1 AND uh.user_id = $2
      GROUP BY uh.id
    `, [hookId, userId]);

    if (!hook) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }

    // Get all examples with full post data
    const { rows: examples } = await pool.query(`
      SELECT p.id AS post_id, p.post_url, p.thumbnail_url, p.s3_thumbnail_url,
             p.description, p.views, p.likes, p.viral_score,
             pr.username, pr.platform, pr.avatar_url,
             p.hook_analysis, uhe.added_at
      FROM user_hook_examples uhe
      JOIN posts p ON uhe.post_id = p.id
      JOIN profiles pr ON p.profile_id = pr.id
      WHERE uhe.user_hook_id = $1
      ORDER BY p.viral_score DESC
    `, [hookId]);

    // Get top example
    const topExample = examples.length > 0 ? {
      post_id: examples[0].post_id,
      thumbnail_url: examples[0].thumbnail_url,
      s3_thumbnail_url: examples[0].s3_thumbnail_url,
      viral_score: examples[0].viral_score,
      views: examples[0].views,
      username: examples[0].username,
      platform: examples[0].platform,
    } : null;

    return NextResponse.json({
      hook: {
        ...hook,
        top_example: topExample,
        examples,
      },
    });
  } catch (err) {
    console.error('user-hooks [id] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch hook' }, { status: 500 });
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
  const hookId = parseInt(id, 10);

  if (isNaN(hookId)) {
    return NextResponse.json({ error: 'Invalid hook ID' }, { status: 400 });
  }

  const body = await request.json();
  const { display_name, notes } = body;

  const pool = getPool();
  const updates: string[] = [];
  const values: (string | number)[] = [];
  let paramIdx = 1;

  if (display_name !== undefined) {
    updates.push(`display_name = $${paramIdx++}`);
    values.push(display_name);
  }
  if (notes !== undefined) {
    updates.push(`notes = $${paramIdx++}`);
    values.push(notes);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  updates.push('updated_at = NOW()');
  values.push(hookId, userId);

  try {
    const { rowCount } = await pool.query(
      `UPDATE user_hooks SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND user_id = $${paramIdx}`,
      values
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: 'Hook not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('user-hooks [id] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update hook' }, { status: 500 });
  }
}
