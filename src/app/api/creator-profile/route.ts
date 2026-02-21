import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM creator_profiles WHERE user_id = $1',
    [Number(session.user.id)]
  );

  return NextResponse.json({ profile: rows[0] || null });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const body = await request.json();
  const {
    niche, content_style, target_audience, unique_angle,
    platforms, inspiration_creators, background_qa, onboarding_step,
    content_topics,
  } = body;

  const pool = getPool();

  const completedAt = onboarding_step === 'complete' ? 'NOW()' : 'NULL';

  const { rows } = await pool.query(`
    INSERT INTO creator_profiles (
      user_id, niche, content_style, target_audience, unique_angle,
      platforms, inspiration_creators, background_qa, onboarding_step,
      content_topics, completed_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${completedAt}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      niche = COALESCE($2, creator_profiles.niche),
      content_style = COALESCE($3, creator_profiles.content_style),
      target_audience = COALESCE($4, creator_profiles.target_audience),
      unique_angle = COALESCE($5, creator_profiles.unique_angle),
      platforms = COALESCE($6, creator_profiles.platforms),
      inspiration_creators = COALESCE($7, creator_profiles.inspiration_creators),
      background_qa = COALESCE($8, creator_profiles.background_qa),
      onboarding_step = COALESCE($9, creator_profiles.onboarding_step),
      content_topics = COALESCE($10, creator_profiles.content_topics),
      completed_at = ${onboarding_step === 'complete' ? 'NOW()' : 'creator_profiles.completed_at'},
      updated_at = NOW()
    RETURNING *
  `, [
    userId,
    niche || null,
    content_style || null,
    target_audience || null,
    unique_angle || null,
    platforms ? JSON.stringify(platforms) : null,
    inspiration_creators ? JSON.stringify(inspiration_creators) : null,
    background_qa ? JSON.stringify(background_qa) : null,
    onboarding_step || null,
    content_topics || null,
  ]);

  return NextResponse.json({ profile: rows[0] });
}
