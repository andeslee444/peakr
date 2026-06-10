import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUserId, unauthorized } from '@/lib/api-auth';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (userId === null) return unauthorized();
  try {
    const { id } = await params;
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM saved_posts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Saved post not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete saved post' }, { status: 500 });
  }
}
