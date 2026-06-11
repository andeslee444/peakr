import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { enforceRateLimitFor } from '@/lib/rate-limit';
import { assertSafeUrl } from '@/lib/ssrf';
import { trackLimit, normalizePlan } from '@/lib/plan';

const USERNAME_RE = /^[a-zA-Z0-9_.]{1,30}$/;
// Avatar URLs are client-supplied and rendered to other users; only accept
// known platform CDN hosts, else drop it and let the scraper repopulate.
const AVATAR_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'instagram.com', 'tiktokcdn.com', 'tiktok.com'];

function safeAvatar(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    assertSafeUrl(url, AVATAR_HOSTS);
    return url;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(session.user.id);
    const limited = enforceRateLimitFor(`track:${userId}`, 30, 60_000);
    if (limited) return limited;

    const { username, platform = 'tiktok', display_name, avatar_url, followers, post_count } = await req.json();
    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }
    if (!['tiktok', 'instagram'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be tiktok or instagram' }, { status: 400 });
    }

    const clean = username.replace(/^@/, '');
    if (!USERNAME_RE.test(clean)) {
      return NextResponse.json({ error: 'invalid username format' }, { status: 400 });
    }

    const pool = getPool();

    // Insert the profile with metadata from search, or update empty fields if it already exists.
    // The daemon on Mac Mini will pick up profiles with last_scraped_at IS NULL.
    await pool.query(
      `INSERT INTO profiles (username, platform, display_name, avatar_url, followers, post_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username, platform) DO UPDATE SET
         display_name = COALESCE(NULLIF(profiles.display_name, ''), EXCLUDED.display_name),
         avatar_url = COALESCE(NULLIF(profiles.avatar_url, ''), EXCLUDED.avatar_url),
         followers = GREATEST(profiles.followers, EXCLUDED.followers),
         post_count = GREATEST(profiles.post_count, EXCLUDED.post_count)`,
      [clean, platform, display_name || null, safeAvatar(avatar_url), followers || 0, post_count || 0]
    );

    // Read back from DB
    const { rows: [profile] } = await pool.query(
      'SELECT * FROM profiles WHERE username = $1 AND platform = $2',
      [clean, platform]
    );

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Could not find this profile. Check the username and try again.' },
        { status: 404 }
      );
    }

    // Enforce the per-plan track limit. Read the LIVE plan + count + whether this
    // profile is already tracked, so a just-upgraded user is never blocked by a
    // stale token and re-tracking an existing profile stays idempotent.
    const { rows: [gate] } = await pool.query(
      `SELECT
         (SELECT plan FROM users WHERE id = $1) AS plan,
         (SELECT COUNT(*)::int FROM user_tracked_profiles WHERE user_id = $1) AS tracked_count,
         EXISTS(SELECT 1 FROM user_tracked_profiles WHERE user_id = $1 AND profile_id = $2) AS already`,
      [userId, profile.id]
    );
    const plan = normalizePlan(gate?.plan);
    const limit = trackLimit(plan);
    if (!gate?.already && (gate?.tracked_count ?? 0) >= limit) {
      return NextResponse.json(
        {
          success: false,
          error: `You're tracking the maximum of ${limit} accounts on the ${plan} plan.`,
          limit,
          plan,
          upgrade: plan === 'free',
        },
        { status: 402 }
      );
    }

    // Link this user to the profile
    await pool.query(
      `INSERT INTO user_tracked_profiles (user_id, profile_id)
       VALUES ($1, $2) ON CONFLICT (user_id, profile_id) DO NOTHING`,
      [userId, profile.id]
    );

    // Enqueue for immediate scraping by the daemon (skip if already pending/in_progress)
    await pool.query(
      `INSERT INTO scrape_queue (profile_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM scrape_queue WHERE profile_id = $1 AND status IN ('pending', 'in_progress')
       )`,
      [profile.id]
    );

    // Queue top 5 unanalyzed posts for hook analysis (if profile already has posts)
    await pool.query(
      `UPDATE posts SET hook_analysis = '{"status": "pending"}'
       WHERE id IN (
         SELECT id FROM posts
         WHERE profile_id = $1 AND analyzed_at IS NULL AND (hook_analysis IS NULL OR hook_analysis = 'null')
         ORDER BY viral_score DESC NULLS LAST
         LIMIT 5
       )`,
      [profile.id]
    );

    return NextResponse.json({ success: true, profile });
  } catch {
    return NextResponse.json({ error: 'Failed to track profile' }, { status: 500 });
  }
}
