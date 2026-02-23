import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

// List collections (with pattern counts)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT hc.id, hc.name, hc.created_at,
           COUNT(hcp.id) AS pattern_count
    FROM hook_collections hc
    LEFT JOIN hook_collection_patterns hcp ON hcp.collection_id = hc.id
    WHERE hc.user_id = $1
    GROUP BY hc.id
    ORDER BY hc.created_at ASC
  `, [Number(session.user.id)]);

  return NextResponse.json({ collections: rows });
}

// Create a collection
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await request.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO hook_collections (user_id, name) VALUES ($1, $2) RETURNING *`,
      [Number(session.user.id), name.trim()]
    );
    return NextResponse.json({ collection: rows[0] });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'Collection with this name already exists' }, { status: 409 });
    }
    throw err;
  }
}

// Delete a collection
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { collection_id } = await request.json();
  if (!collection_id) {
    return NextResponse.json({ error: 'collection_id is required' }, { status: 400 });
  }

  const pool = getPool();
  const { rowCount } = await pool.query(
    'DELETE FROM hook_collections WHERE id = $1 AND user_id = $2',
    [collection_id, Number(session.user.id)]
  );

  if (rowCount === 0) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// Add/remove pattern from collection (PATCH)
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { collection_id, pattern_id, action } = await request.json();
  if (!collection_id || !pattern_id || !['add', 'remove'].includes(action)) {
    return NextResponse.json({ error: 'collection_id, pattern_id, and action (add/remove) are required' }, { status: 400 });
  }

  const pool = getPool();

  // Verify collection belongs to user
  const { rows: collRows } = await pool.query(
    'SELECT id FROM hook_collections WHERE id = $1 AND user_id = $2',
    [collection_id, Number(session.user.id)]
  );
  if (collRows.length === 0) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  if (action === 'add') {
    await pool.query(
      `INSERT INTO hook_collection_patterns (collection_id, pattern_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [collection_id, pattern_id]
    );
  } else {
    await pool.query(
      'DELETE FROM hook_collection_patterns WHERE collection_id = $1 AND pattern_id = $2',
      [collection_id, pattern_id]
    );
  }

  return NextResponse.json({ success: true });
}
