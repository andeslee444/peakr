import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT * FROM playbook_sections
    WHERE user_id = $1
    ORDER BY updated_at DESC
  `, [userId]);

  return NextResponse.json({ sections: rows });
}
