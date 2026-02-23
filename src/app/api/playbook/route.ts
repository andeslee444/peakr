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

  const [sectionsRes, groupsRes] = await Promise.all([
    pool.query(`
      SELECT * FROM playbook_sections
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `, [userId]),
    // Get distinct hook_type + niche groups from user's saved patterns
    pool.query(`
      SELECT hp.hook_type, hp.niche, COUNT(DISTINCT p.id) as hook_count
      FROM user_saved_patterns usp
      JOIN hook_patterns hp ON usp.pattern_id = hp.id
      JOIN hook_pattern_posts hpp ON hpp.pattern_id = hp.id
      JOIN posts p ON hpp.post_id = p.id
      WHERE usp.user_id = $1
        AND p.hook_analysis IS NOT NULL
      GROUP BY hp.hook_type, hp.niche
      ORDER BY hook_count DESC
    `, [userId]),
  ]);

  return NextResponse.json({
    sections: sectionsRes.rows,
    availableGroups: groupsRes.rows,
  });
}
