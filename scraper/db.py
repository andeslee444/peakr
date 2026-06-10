"""PostgreSQL database layer for Peakr."""

import os
import re
import json
import psycopg2
import psycopg2.extras
from datetime import datetime
from typing import Optional

from scraper.analysis_state import MAX_ANALYSIS_ATTEMPTS, failure_marker

DATABASE_URL = os.environ.get('DATABASE_URL', '')

SCHEMA = """
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

CREATE TABLE IF NOT EXISTS user_hook_examples (
  id SERIAL PRIMARY KEY,
  user_hook_id INTEGER NOT NULL REFERENCES user_hooks(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_hook_id, post_id)
);

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
"""


def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(SCHEMA)
    conn.commit()
    cur.close()
    conn.close()


def normalize_hook_template(raw: str) -> str:
    """Normalize a hook template for deduplication.
    Must produce identical output to src/lib/normalize-template.ts.
    """
    s = raw.strip().lower()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'\.{2,}$', '', s)
    s = re.sub(r'[.,!?]+$', '', s)
    return s.strip()


def add_profile(username: str, platform: str = 'tiktok') -> int:
    """Add or get a profile. Returns profile id."""
    username = username.lstrip('@')
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "INSERT INTO profiles (username, platform) VALUES (%s, %s) ON CONFLICT (username, platform) DO NOTHING",
        (username, platform)
    )
    conn.commit()
    cur.execute(
        "SELECT id FROM profiles WHERE username=%s AND platform=%s",
        (username, platform)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row['id']


def get_profile(username: str, platform: str = 'tiktok') -> Optional[dict]:
    username = username.lstrip('@')
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM profiles WHERE username=%s AND platform=%s",
        (username, platform)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


def get_all_profiles() -> list[dict]:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM profiles ORDER BY last_scraped_at DESC NULLS FIRST")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def update_profile(profile_id: int, **kwargs):
    conn = get_conn()
    cur = conn.cursor()
    keys = list(kwargs.keys())
    sets = ', '.join(f"{k}=%s" for k in keys)
    vals = [kwargs[k] for k in keys] + [profile_id]
    cur.execute(f"UPDATE profiles SET {sets} WHERE id=%s", vals)
    conn.commit()
    cur.close()
    conn.close()


def add_posts(profile_id: int, posts: list[dict]):
    """Upsert posts for a profile."""
    conn = get_conn()
    cur = conn.cursor()
    for p in posts:
        cur.execute("""
            INSERT INTO posts (profile_id, platform_id, post_url, thumbnail_url, description,
                              views, likes, comments, shares, duration_seconds, is_video, viral_score,
                              posted_at, scraped_at, audio_name, audio_author)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT(profile_id, platform_id) DO UPDATE SET
                views=EXCLUDED.views, likes=EXCLUDED.likes, comments=EXCLUDED.comments,
                shares=EXCLUDED.shares, viral_score=EXCLUDED.viral_score, scraped_at=EXCLUDED.scraped_at,
                thumbnail_url=EXCLUDED.thumbnail_url, description=EXCLUDED.description,
                is_video=EXCLUDED.is_video, duration_seconds=EXCLUDED.duration_seconds,
                post_url=EXCLUDED.post_url,
                audio_name=COALESCE(EXCLUDED.audio_name, posts.audio_name),
                audio_author=COALESCE(EXCLUDED.audio_author, posts.audio_author)
        """, (
            profile_id, p.get('platform_id', ''), p.get('post_url', ''),
            p.get('thumbnail_url', ''), p.get('description', ''),
            p.get('views', 0), p.get('likes', 0), p.get('comments', 0),
            p.get('shares', 0), p.get('duration_seconds', 0), p.get('is_video', False),
            p.get('viral_score', 0), p.get('posted_at'), datetime.utcnow().isoformat(),
            p.get('audio_name'), p.get('audio_author'),
        ))
    conn.commit()
    cur.close()
    conn.close()


def get_posts(profile_id: int, limit: int = 50) -> list[dict]:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM posts WHERE profile_id=%s ORDER BY viral_score DESC LIMIT %s",
        (profile_id, limit)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def get_top_content(limit: int = 20) -> list[dict]:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name
        FROM posts p
        JOIN profiles pr ON p.profile_id = pr.id
        ORDER BY p.viral_score DESC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def log_scrape(profile_id: int, status: str, posts_found: int = 0,
               error_message: str = None, duration_ms: int = 0):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO scrape_log (profile_id, status, posts_found, error_message, duration_ms)
        VALUES (%s, %s, %s, %s, %s)
    """, (profile_id, status, posts_found, error_message, duration_ms))
    conn.commit()
    cur.close()
    conn.close()


def migrate_audio_columns():
    """Add audio metadata columns to posts table."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS audio_name TEXT;
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS audio_author TEXT;
    """)
    conn.commit()
    cur.close()
    conn.close()


def migrate_bignum_columns():
    """Widen engagement counters to BIGINT for existing databases.

    Mega-creators have view/like totals beyond 32-bit INTEGER range (>2.1B),
    which would otherwise raise 'integer out of range' on insert.
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        ALTER TABLE posts ALTER COLUMN views TYPE BIGINT;
        ALTER TABLE posts ALTER COLUMN likes TYPE BIGINT;
        ALTER TABLE posts ALTER COLUMN comments TYPE BIGINT;
        ALTER TABLE posts ALTER COLUMN shares TYPE BIGINT;
        ALTER TABLE profiles ALTER COLUMN followers TYPE BIGINT;
        ALTER TABLE profiles ALTER COLUMN following TYPE BIGINT;
        ALTER TABLE profiles ALTER COLUMN total_likes TYPE BIGINT;
    """)
    conn.commit()
    cur.close()
    conn.close()


def migrate_indexes():
    """Indexes for hot list/sort paths (idempotent)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_posts_profile_id ON posts(profile_id);
        CREATE INDEX IF NOT EXISTS idx_posts_viral_score ON posts(viral_score DESC);
        CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at DESC);
    """)
    conn.commit()
    cur.close()
    conn.close()


def migrate_hook_columns():
    """Add hook analysis columns to existing posts table."""
    conn = get_conn()
    cur = conn.cursor()
    for col, typ in [('transcript', 'TEXT'), ('hook_analysis', 'JSONB'), ('analyzed_at', 'TIMESTAMPTZ')]:
        cur.execute(f"ALTER TABLE posts ADD COLUMN IF NOT EXISTS {col} {typ}")
    cur.execute("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_niche TEXT")
    cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS keyframe_base64 TEXT")
    cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS s3_thumbnail_url TEXT")
    cur.execute("ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS content_topics TEXT")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS video_url_cache (
            id SERIAL PRIMARY KEY,
            post_url TEXT UNIQUE NOT NULL,
            video_url TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        )
    """)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS user_hooks_user_template_key
          ON user_hooks(user_id, canonical_template)
          WHERE canonical_template IS NOT NULL
    """)
    conn.commit()
    cur.close()
    conn.close()


def get_unanalyzed_viral_posts(threshold: float = 1.5, limit: int = 10) -> list[dict]:
    """Get viral posts that haven't been analyzed yet.
    Also picks up manually-queued posts (hook_analysis = '{"status": "pending"}').
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # Manually queued posts get priority
    cur.execute("""
        (SELECT p.*, pr.username, pr.platform, 1 as priority
         FROM posts p JOIN profiles pr ON p.profile_id = pr.id
         WHERE p.analyzed_at IS NULL AND p.hook_analysis = '{"status": "pending"}'
         ORDER BY p.id DESC LIMIT %s)
        UNION ALL
        (SELECT p.*, pr.username, pr.platform, 2 as priority
         FROM posts p JOIN profiles pr ON p.profile_id = pr.id
         WHERE p.viral_score >= %s AND p.analyzed_at IS NULL
               AND (p.hook_analysis IS NULL OR p.hook_analysis != '{"status": "pending"}')
               AND (p.hook_analysis->>'status' IS DISTINCT FROM 'failed'
                    OR COALESCE((p.hook_analysis->>'attempts')::int, 0) < %s)
         ORDER BY p.viral_score DESC LIMIT %s)
        ORDER BY priority, viral_score DESC
        LIMIT %s
    """, (limit, threshold, MAX_ANALYSIS_ATTEMPTS, limit, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def save_hook_analysis(post_id: int, transcript: str, hook_analysis_dict: dict,
                       keyframe_base64: Optional[str] = None):
    """Save hook analysis results to a post, and link to global hook_patterns."""
    conn = get_conn()
    cur = conn.cursor()
    if keyframe_base64:
        cur.execute("""
            UPDATE posts SET transcript = %s, hook_analysis = %s, analyzed_at = NOW(),
                            keyframe_base64 = %s
            WHERE id = %s
        """, (transcript, json.dumps(hook_analysis_dict), keyframe_base64, post_id))
    else:
        cur.execute("""
            UPDATE posts SET transcript = %s, hook_analysis = %s, analyzed_at = NOW()
            WHERE id = %s
        """, (transcript, json.dumps(hook_analysis_dict), post_id))

    # Link post to global hook_patterns
    raw_template = hook_analysis_dict.get('hook_template')
    if raw_template:
        canonical = normalize_hook_template(str(raw_template))
        if canonical:
            hook_type = hook_analysis_dict.get('hook_type')
            niche = hook_analysis_dict.get('niche')
            # Upsert pattern
            cur.execute("""
                INSERT INTO hook_patterns (canonical_template, display_name, hook_type, niche)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (canonical_template) DO UPDATE SET updated_at = NOW()
                RETURNING id
            """, (canonical, str(raw_template), hook_type, niche))
            pattern_id = cur.fetchone()[0]
            # Link post to pattern
            cur.execute("""
                INSERT INTO hook_pattern_posts (pattern_id, post_id)
                VALUES (%s, %s)
                ON CONFLICT (pattern_id, post_id) DO NOTHING
            """, (pattern_id, post_id))
            # Update stats incrementally
            cur.execute("""
                UPDATE hook_patterns SET
                    example_count = sub.cnt,
                    avg_viral_score = sub.avg_vs,
                    avg_views = sub.avg_v,
                    updated_at = NOW()
                FROM (
                    SELECT COUNT(*) AS cnt,
                           COALESCE(AVG(p.viral_score), 0) AS avg_vs,
                           COALESCE(AVG(p.views), 0) AS avg_v
                    FROM hook_pattern_posts hpp
                    JOIN posts p ON hpp.post_id = p.id
                    WHERE hpp.pattern_id = %s
                ) sub
                WHERE hook_patterns.id = %s
            """, (pattern_id, pattern_id))

    conn.commit()
    cur.close()
    conn.close()


def mark_analysis_failed(post_id: int, attempts: int, reason: str = ""):
    """Record a failed analysis attempt so the post is not retried forever.

    Writes a ``{"status":"failed","attempts":N,...}`` marker. Once attempts reach
    MAX_ANALYSIS_ATTEMPTS, get_unanalyzed_viral_posts stops selecting the post,
    which prevents a single bad post from starving the daemon loop.
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE posts SET hook_analysis = %s WHERE id = %s",
        (json.dumps(failure_marker(attempts, reason)), post_id),
    )
    conn.commit()
    cur.close()
    conn.close()


def pop_scrape_queue() -> Optional[tuple]:
    """Atomically claim the next pending queue entry.
    Returns (queue_id, username, platform) or None.
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        UPDATE scrape_queue SET status='in_progress', started_at=NOW()
        WHERE id = (
            SELECT id FROM scrape_queue WHERE status='pending' ORDER BY id LIMIT 1
        )
        RETURNING id, profile_id
    """)
    row = cur.fetchone()
    if not row:
        conn.commit()
        cur.close()
        conn.close()
        return None
    queue_id = row['id']
    profile_id = row['profile_id']
    cur.execute("SELECT username, platform FROM profiles WHERE id=%s", (profile_id,))
    profile = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not profile:
        return None
    return (queue_id, profile['username'], profile['platform'])


def reclaim_stale_queue_entries(max_age_minutes: int = 15) -> int:
    """Reset queue rows stuck 'in_progress' (daemon crashed mid-scrape) back to
    'pending' so the profile can be scraped again. Returns rows reclaimed."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """UPDATE scrape_queue SET status='pending', started_at=NULL
           WHERE status='in_progress' AND started_at < NOW() - make_interval(mins => %s)""",
        (max_age_minutes,),
    )
    n = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return n


def record_heartbeat(worker_id: str, status: str = 'ok') -> None:
    """Upsert the daemon's liveness heartbeat (read by /api/worker-status)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO worker_heartbeats (worker_id, last_heartbeat_at, status)
           VALUES (%s, NOW(), %s)
           ON CONFLICT (worker_id) DO UPDATE SET last_heartbeat_at = NOW(), status = EXCLUDED.status""",
        (worker_id, status),
    )
    conn.commit()
    cur.close()
    conn.close()


def complete_scrape_queue(queue_id: int, status: str = 'done'):
    """Mark a queue entry as done or error."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE scrape_queue SET status=%s, completed_at=NOW() WHERE id=%s",
        (status, queue_id)
    )
    conn.commit()
    cur.close()
    conn.close()


def queue_top_posts_for_analysis(username: str, platform: str, limit: int = 5) -> int:
    """Queue top N unanalyzed posts for hook analysis (by viral score).
    Used after scraping a user-tracked profile so posts appear in Hook Lab quickly.
    Returns number of posts queued.
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE posts SET hook_analysis = '{"status": "pending"}'
        WHERE id IN (
            SELECT p.id FROM posts p
            JOIN profiles pr ON p.profile_id = pr.id
            WHERE pr.username = %s AND pr.platform = %s
              AND p.analyzed_at IS NULL
              AND (p.hook_analysis IS NULL OR p.hook_analysis = 'null')
            ORDER BY p.viral_score DESC NULLS LAST
            LIMIT %s
        )
    """, (username, platform, limit))
    queued = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return queued


def get_active_seed_creators(platform: Optional[str] = None) -> list[dict]:
    """Get all active seed creators, optionally filtered by platform."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if platform:
        cur.execute("SELECT * FROM seed_creators WHERE is_active = TRUE AND platform = %s ORDER BY id", (platform,))
    else:
        cur.execute("SELECT * FROM seed_creators WHERE is_active = TRUE ORDER BY id")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def get_top_seed_creators(limit: int = 50) -> list[dict]:
    """Get top seed creators ranked by avg viral_score of their recent posts."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT sc.*, pr.id as profile_id,
               AVG(p.viral_score) as avg_viral
        FROM seed_creators sc
        JOIN profiles pr ON pr.username = sc.username AND pr.platform = sc.platform
        JOIN posts p ON p.profile_id = pr.id
        WHERE sc.is_active = TRUE
          AND p.scraped_at > NOW() - INTERVAL '7 days'
        GROUP BY sc.id, pr.id
        ORDER BY avg_viral DESC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def upsert_seed_creator(username: str, platform: str, niche: str,
                        tier: str = 'seed', follower_count: Optional[int] = None):
    """Insert or update a seed creator."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO seed_creators (username, platform, niche, tier, follower_count)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (username, platform) DO UPDATE SET
            niche = EXCLUDED.niche,
            tier = EXCLUDED.tier,
            follower_count = COALESCE(EXCLUDED.follower_count, seed_creators.follower_count)
    """, (username, platform, niche, tier, follower_count))
    conn.commit()
    cur.close()
    conn.close()


def compute_daily_top_hooks(limit: int = 50):
    """Compute daily top hooks by hook_score * viral_score and insert into daily_top_hooks."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    today = datetime.utcnow().date().isoformat()

    # Top overall
    cur.execute("""
        INSERT INTO daily_top_hooks (post_id, rank, date, niche)
        SELECT p.id, ROW_NUMBER() OVER (ORDER BY (p.hook_analysis->>'hook_score')::int * p.viral_score DESC),
               %s::date, p.hook_analysis->>'niche'
        FROM posts p
        WHERE p.analyzed_at IS NOT NULL
          AND p.analyzed_at > NOW() - INTERVAL '48 hours'
        ORDER BY (p.hook_analysis->>'hook_score')::int * p.viral_score DESC
        LIMIT %s
        ON CONFLICT (post_id, date) DO NOTHING
    """, (today, limit))

    conn.commit()
    cur.close()
    conn.close()


def update_profile_niches():
    """Recalculate primary_niche for all profiles with analyzed posts."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE profiles SET primary_niche = sub.niche
        FROM (
            SELECT profile_id, hook_analysis->>'niche' as niche,
                   ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY COUNT(*) DESC) as rn
            FROM posts
            WHERE analyzed_at IS NOT NULL AND hook_analysis->>'niche' IS NOT NULL
            GROUP BY profile_id, hook_analysis->>'niche'
        ) sub
        WHERE profiles.id = sub.profile_id AND sub.rn = 1
    """)
    conn.commit()
    cur.close()
    conn.close()


def clean_expired_video_cache():
    """Delete expired entries from video_url_cache."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM video_url_cache WHERE expires_at < NOW()")
    conn.commit()
    cur.close()
    conn.close()


def get_active_profiles() -> list[dict]:
    """Get profiles that are seed creators or tracked by at least one user."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT DISTINCT pr.* FROM profiles pr
        WHERE EXISTS (
            SELECT 1 FROM seed_creators sc
            WHERE sc.username = pr.username AND sc.platform = pr.platform AND sc.is_active = TRUE
        )
        OR EXISTS (
            SELECT 1 FROM user_tracked_profiles utp WHERE utp.profile_id = pr.id
        )
        ORDER BY pr.last_scraped_at ASC NULLS FIRST
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def recalculate_viral_scores(profile_id: int):
    """Recalculate viral_score for ALL posts of a profile based on avg engagement."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE posts SET viral_score = ROUND(((likes + comments)::numeric / avg_eng), 2)
        FROM (SELECT AVG(likes + comments) AS avg_eng FROM posts WHERE profile_id = %s AND (likes + comments) > 0) sub
        WHERE profile_id = %s AND (likes + comments) > 0 AND sub.avg_eng > 0
    """, (profile_id, profile_id))
    conn.commit()
    cur.close()
    conn.close()


def backfill_hook_patterns():
    """Scan all existing analyzed posts with hook_template and populate
    hook_patterns + hook_pattern_posts. Safe to run multiple times."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, hook_analysis, viral_score, views
        FROM posts
        WHERE analyzed_at IS NOT NULL
          AND hook_analysis->>'hook_template' IS NOT NULL
    """)
    rows = cur.fetchall()
    cur2 = conn.cursor()
    linked = 0
    for row in rows:
        raw_template = row['hook_analysis'].get('hook_template')
        if not raw_template:
            continue
        canonical = normalize_hook_template(str(raw_template))
        if not canonical:
            continue
        hook_type = row['hook_analysis'].get('hook_type')
        niche = row['hook_analysis'].get('niche')
        cur2.execute("""
            INSERT INTO hook_patterns (canonical_template, display_name, hook_type, niche)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (canonical_template) DO UPDATE SET updated_at = NOW()
            RETURNING id
        """, (canonical, str(raw_template), hook_type, niche))
        pattern_id = cur2.fetchone()[0]
        cur2.execute("""
            INSERT INTO hook_pattern_posts (pattern_id, post_id)
            VALUES (%s, %s)
            ON CONFLICT (pattern_id, post_id) DO NOTHING
        """, (pattern_id, row['id']))
        linked += 1
    conn.commit()
    # Recalculate all stats in bulk
    recalculate_pattern_stats()
    cur.close()
    cur2.close()
    conn.close()
    return linked


def recalculate_pattern_stats():
    """Bulk recalculate example_count, avg_viral_score, avg_views for all patterns."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE hook_patterns hp SET
            example_count = COALESCE(sub.cnt, 0),
            avg_viral_score = COALESCE(sub.avg_vs, 0),
            avg_views = COALESCE(sub.avg_v, 0),
            updated_at = NOW()
        FROM (
            SELECT hpp.pattern_id,
                   COUNT(*) AS cnt,
                   AVG(p.viral_score) AS avg_vs,
                   AVG(p.views) AS avg_v
            FROM hook_pattern_posts hpp
            JOIN posts p ON hpp.post_id = p.id
            GROUP BY hpp.pattern_id
        ) sub
        WHERE hp.id = sub.pattern_id
    """)
    conn.commit()
    cur.close()
    conn.close()


def create_notification(user_id: int, notif_type: str, title: str,
                        body: str = None, link: str = None):
    """Insert a notification for a user."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO notifications (user_id, type, title, body, link)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, notif_type, title, body, link))
    conn.commit()
    cur.close()
    conn.close()


def generate_viral_post_notifications(username: str, platform: str, threshold: float = 3.0):
    """Check if a tracked account has new viral posts and notify tracking users."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Find posts scraped in the last 5 hours with viral score above threshold
    cur.execute("""
        SELECT p.id, p.viral_score, p.views, pr.id AS profile_id
        FROM posts p
        JOIN profiles pr ON p.profile_id = pr.id
        WHERE pr.username = %s AND pr.platform = %s
          AND p.viral_score >= %s
          AND p.scraped_at > NOW() - INTERVAL '5 hours'
    """, (username, platform, threshold))
    viral_posts = cur.fetchall()

    if not viral_posts:
        cur.close()
        conn.close()
        return 0

    profile_id = viral_posts[0]['profile_id']

    # Find users tracking this profile
    cur.execute("""
        SELECT user_id FROM user_tracked_profiles WHERE profile_id = %s
    """, (profile_id,))
    tracking_users = cur.fetchall()

    if not tracking_users:
        cur.close()
        conn.close()
        return 0

    notif_count = 0
    cur2 = conn.cursor()
    for post in viral_posts:
        score = post['viral_score']
        views = post['views'] or 0
        title = f"@{username} just posted a {score:.1f}x viral post!"
        body = f"A new post with {views:,} views is performing {score:.1f}x above their average."
        link = f"/dashboard/hook-lab"

        for u in tracking_users:
            # Avoid duplicate notifications for the same post
            cur2.execute("""
                INSERT INTO notifications (user_id, type, title, body, link)
                SELECT %s, %s, %s, %s, %s
                WHERE NOT EXISTS (
                    SELECT 1 FROM notifications
                    WHERE user_id = %s AND type = 'viral_post'
                      AND body LIKE %s
                      AND created_at > NOW() - INTERVAL '24 hours'
                )
            """, (u['user_id'], 'viral_post', title, body, link,
                  u['user_id'], f'%post with {views:,} views%'))
            notif_count += cur2.rowcount

    conn.commit()
    cur.close()
    cur2.close()
    conn.close()
    return notif_count


# Initialize on import (only when a database is configured). Skipping when
# DATABASE_URL is unset keeps the module importable in tests/CI without a DB and
# avoids an import-time connection failure.
if DATABASE_URL:
    init_db()
    migrate_hook_columns()
    migrate_audio_columns()
    migrate_bignum_columns()
    migrate_indexes()
