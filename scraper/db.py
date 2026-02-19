"""PostgreSQL database layer for Peakr."""

import os
import psycopg2
import psycopg2.extras
from datetime import datetime
from typing import Optional

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
                              views, likes, comments, shares, duration_seconds, is_video, viral_score, posted_at, scraped_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT(profile_id, platform_id) DO UPDATE SET
                views=EXCLUDED.views, likes=EXCLUDED.likes, comments=EXCLUDED.comments,
                shares=EXCLUDED.shares, viral_score=EXCLUDED.viral_score, scraped_at=EXCLUDED.scraped_at,
                thumbnail_url=EXCLUDED.thumbnail_url, description=EXCLUDED.description,
                is_video=EXCLUDED.is_video
        """, (
            profile_id, p.get('platform_id', ''), p.get('post_url', ''),
            p.get('thumbnail_url', ''), p.get('description', ''),
            p.get('views', 0), p.get('likes', 0), p.get('comments', 0),
            p.get('shares', 0), p.get('duration_seconds', 0), p.get('is_video', False),
            p.get('viral_score', 0), p.get('posted_at'), datetime.utcnow().isoformat()
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


def migrate_hook_columns():
    """Add hook analysis columns to existing posts table."""
    conn = get_conn()
    cur = conn.cursor()
    for col, typ in [('transcript', 'TEXT'), ('hook_analysis', 'JSONB'), ('analyzed_at', 'TIMESTAMPTZ')]:
        cur.execute(f"ALTER TABLE posts ADD COLUMN IF NOT EXISTS {col} {typ}")
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
               AND p.is_video = TRUE
         ORDER BY p.viral_score DESC LIMIT %s)
        ORDER BY priority, viral_score DESC
        LIMIT %s
    """, (limit, threshold, limit, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def save_hook_analysis(post_id: int, transcript: str, hook_analysis_dict: dict):
    """Save hook analysis results to a post."""
    import json
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE posts SET transcript = %s, hook_analysis = %s, analyzed_at = NOW()
        WHERE id = %s
    """, (transcript, json.dumps(hook_analysis_dict), post_id))
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


# Initialize on import
init_db()
migrate_hook_columns()
