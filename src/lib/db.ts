import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com')
        ? { rejectUnauthorized: false }
        : undefined,
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
      followers INTEGER DEFAULT 0,
      following INTEGER DEFAULT 0,
      total_likes INTEGER DEFAULT 0,
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
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      duration_seconds INTEGER,
      is_video BOOLEAN DEFAULT FALSE,
      viral_score REAL DEFAULT 0,
      posted_at TIMESTAMPTZ,
      scraped_at TIMESTAMPTZ DEFAULT NOW(),
      transcript TEXT,
      hook_analysis JSONB,
      analyzed_at TIMESTAMPTZ,
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
      post_id INTEGER REFERENCES posts(id),
      folder TEXT DEFAULT 'default',
      notes TEXT,
      saved_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scrape_queue (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER REFERENCES profiles(id),
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );
  `);
  // Migrate hook columns for existing databases
  await pool.query(`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS transcript TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS hook_analysis JSONB;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
  `);
  _schemaInitialized = true;
}
