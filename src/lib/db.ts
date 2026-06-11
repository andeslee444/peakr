import { Pool } from 'pg';
import { buildSslConfig } from './db-ssl';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    // On Vercel each serverless instance gets its own pool, so keep `max` small
    // to avoid exhausting RDS max_connections under concurrency. Override with
    // DATABASE_POOL_MAX if running against a connection pooler / proxy.
    const poolMax = Number(process.env.DATABASE_POOL_MAX) || 3;
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: poolMax,
      ssl: buildSslConfig(process.env.DATABASE_URL, process.env),
    });
    // Initialize schema on first connection
    _pool.on('connect', () => {});
    initSchema().catch(console.error);
  }
  return _pool;
}

let _schemaInitialized = false;

async function initSchema() {
  if (_schemaInitialized) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      tiktok_id TEXT UNIQUE,
      username TEXT,
      display_name TEXT,
      avatar_url TEXT,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'tiktok',
      display_name TEXT,
      bio TEXT,
      avatar_url TEXT,
      followers BIGINT DEFAULT 0,
      following BIGINT DEFAULT 0,
      total_likes BIGINT DEFAULT 0,
      post_count INTEGER DEFAULT 0,
      avg_views REAL DEFAULT 0,
      last_scraped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(username, platform)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER REFERENCES profiles(id),
      platform_id TEXT NOT NULL,
      post_url TEXT,
      thumbnail_url TEXT,
      description TEXT,
      views BIGINT DEFAULT 0,
      likes BIGINT DEFAULT 0,
      comments BIGINT DEFAULT 0,
      shares BIGINT DEFAULT 0,
      duration_seconds INTEGER,
      is_video BOOLEAN DEFAULT FALSE,
      viral_score REAL DEFAULT 0,
      posted_at TIMESTAMPTZ,
      scraped_at TIMESTAMPTZ DEFAULT NOW(),
      transcript TEXT,
      hook_analysis JSONB,
      analyzed_at TIMESTAMPTZ,
      s3_thumbnail_url TEXT,
      UNIQUE(profile_id, platform_id)
    );

    CREATE TABLE IF NOT EXISTS scrape_log (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER REFERENCES profiles(id),
      status TEXT,
      posts_found INTEGER DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER,
      scraped_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS saved_posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id),
      folder TEXT DEFAULT 'default',
      notes TEXT,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS scrape_queue (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER REFERENCES profiles(id),
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      worker_id TEXT PRIMARY KEY,
      last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT
    );
  `);
  // Migrate hook columns for existing databases
  await pool.query(`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS transcript TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS hook_analysis JSONB;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_niche TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_scrape_failed_at TIMESTAMPTZ;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS keyframe_base64 TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS s3_thumbnail_url TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS audio_name TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS audio_author TEXT;
  `);
  // Video URL cache for hover-to-play
  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_url_cache (
      id SERIAL PRIMARY KEY,
      post_url TEXT UNIQUE NOT NULL,
      video_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  // Seed creators for Hook Lab content pipeline
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seed_creators (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'tiktok',
      niche TEXT NOT NULL,
      tier TEXT DEFAULT 'seed',
      follower_count INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(username, platform)
    );

    CREATE TABLE IF NOT EXISTS daily_top_hooks (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES posts(id),
      rank INTEGER,
      date DATE NOT NULL,
      niche TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, date)
    );
  `);
  // Phase 3: Creator profiles, saved hooks, playbook
  await pool.query(`
    CREATE TABLE IF NOT EXISTS creator_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) UNIQUE,
      niche TEXT,
      content_style TEXT,
      target_audience TEXT,
      unique_angle TEXT,
      platforms JSONB,
      inspiration_creators JSONB,
      background_qa JSONB,
      content_topics TEXT,
      onboarding_step TEXT DEFAULT 'not_started',
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS saved_hooks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      post_id INTEGER REFERENCES posts(id),
      notes TEXT,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS playbook_sections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      title TEXT,
      hook_type TEXT,
      niche TEXT,
      templates JSONB,
      source_post_ids JSONB,
      why_it_works TEXT,
      generated_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_tracked_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      tracked_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, profile_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_utp_user_id ON user_tracked_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_utp_profile_id ON user_tracked_profiles(profile_id);
  `);
  // User hooks (pattern-based saves) and examples
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_hooks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      canonical_template TEXT,
      display_name TEXT,
      hook_type TEXT,
      niche TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_hooks_user_template_key
      ON user_hooks(user_id, canonical_template)
      WHERE canonical_template IS NOT NULL;

    CREATE TABLE IF NOT EXISTS user_hook_examples (
      id SERIAL PRIMARY KEY,
      user_hook_id INTEGER NOT NULL REFERENCES user_hooks(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_hook_id, post_id)
    );
  `);
  // Global hook patterns (system-wide grouping + analytics)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hook_patterns (
      id SERIAL PRIMARY KEY,
      canonical_template TEXT UNIQUE NOT NULL,
      display_name TEXT,
      hook_type TEXT,
      niche TEXT,
      example_count INTEGER DEFAULT 0,
      avg_viral_score REAL DEFAULT 0,
      avg_views REAL DEFAULT 0,
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hook_pattern_posts (
      id SERIAL PRIMARY KEY,
      pattern_id INTEGER NOT NULL REFERENCES hook_patterns(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      linked_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(pattern_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS user_saved_patterns (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pattern_id INTEGER NOT NULL REFERENCES hook_patterns(id) ON DELETE CASCADE,
      notes TEXT,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, pattern_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hpp_pattern_id ON hook_pattern_posts(pattern_id);
    CREATE INDEX IF NOT EXISTS idx_hpp_post_id ON hook_pattern_posts(post_id);
    CREATE INDEX IF NOT EXISTS idx_usp_user_id ON user_saved_patterns(user_id);
    CREATE INDEX IF NOT EXISTS idx_usp_pattern_id ON user_saved_patterns(pattern_id);
  `);
  // Hook collections
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hook_collections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    );
    CREATE TABLE IF NOT EXISTS hook_collection_patterns (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES hook_collections(id) ON DELETE CASCADE,
      pattern_id INTEGER NOT NULL REFERENCES hook_patterns(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(collection_id, pattern_id)
    );
  `);
  // Billing: subscription plan + Stripe customer linkage on users
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
  `);
  // Webhook idempotency: every processed Stripe event id is recorded so a
  // replayed/duplicated event is a no-op.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      event_id TEXT PRIMARY KEY,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Password reset tokens (only the SHA-256 hash is stored)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
  `);
  // Per-user manual analysis request log (daily-cap enforcement)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analysis_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_requests_user_created
      ON analysis_requests(user_id, created_at DESC);
  `);
  // Notifications
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
  `);
  // saved_posts is now per-user: add user_id, drop the old global (post_id)
  // uniqueness, and key uniqueness on (user_id, post_id).
  await pool.query(`
    ALTER TABLE saved_posts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    DROP INDEX IF EXISTS saved_posts_post_id_key;
    ALTER TABLE saved_posts DROP CONSTRAINT IF EXISTS saved_posts_post_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS saved_posts_user_post_key ON saved_posts(user_id, post_id);
  `);
  // Unique constraint for playbook upsert by user + hook_type + niche
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS playbook_sections_user_type_niche_key
    ON playbook_sections(user_id, COALESCE(hook_type, ''), COALESCE(niche, ''));
  `);
  // Migrations for existing databases (run last, after every table exists).
  // content_topics was previously ALTERed before creator_profiles was created,
  // which aborted a fresh-DB bootstrap; it now lives in the CREATE plus this
  // safe backfill. Engagement counters widen to BIGINT (mega-creators exceed
  // 32-bit range).
  await pool.query(`
    ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS content_topics TEXT;
    ALTER TABLE posts   ALTER COLUMN views    TYPE BIGINT;
    ALTER TABLE posts   ALTER COLUMN likes    TYPE BIGINT;
    ALTER TABLE posts   ALTER COLUMN comments TYPE BIGINT;
    ALTER TABLE posts   ALTER COLUMN shares   TYPE BIGINT;
    ALTER TABLE profiles ALTER COLUMN followers   TYPE BIGINT;
    ALTER TABLE profiles ALTER COLUMN following   TYPE BIGINT;
    ALTER TABLE profiles ALTER COLUMN total_likes TYPE BIGINT;
  `);
  // Indexes for hot list/sort paths (explore, export, hook-lab, profile views).
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_posts_profile_id ON posts(profile_id);
    CREATE INDEX IF NOT EXISTS idx_posts_viral_score ON posts(viral_score DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at DESC);
  `);
  _schemaInitialized = true;
}
