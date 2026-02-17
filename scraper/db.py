"""SQLite database layer for Peakr."""

import sqlite3
import os
from datetime import datetime
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'peakr.db')

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY,
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
  last_scraped_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(username, platform)
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
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
  viral_score REAL DEFAULT 0,
  posted_at DATETIME,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(profile_id, platform_id)
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  status TEXT,
  posts_found INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_posts (
  id INTEGER PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  folder TEXT DEFAULT 'default',
  notes TEXT,
  saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.close()


def add_profile(username: str, platform: str = 'tiktok') -> int:
    """Add or get a profile. Returns profile id."""
    username = username.lstrip('@')
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO profiles (username, platform) VALUES (?, ?)",
        (username, platform)
    )
    conn.commit()
    row = conn.execute(
        "SELECT id FROM profiles WHERE username=? AND platform=?",
        (username, platform)
    ).fetchone()
    conn.close()
    return row['id']


def get_profile(username: str, platform: str = 'tiktok') -> Optional[dict]:
    username = username.lstrip('@')
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM profiles WHERE username=? AND platform=?",
        (username, platform)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_profiles() -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM profiles ORDER BY last_scraped_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_profile(profile_id: int, **kwargs):
    conn = get_conn()
    sets = ', '.join(f"{k}=?" for k in kwargs)
    vals = list(kwargs.values()) + [profile_id]
    conn.execute(f"UPDATE profiles SET {sets} WHERE id=?", vals)
    conn.commit()
    conn.close()


def add_posts(profile_id: int, posts: list[dict]):
    """Upsert posts for a profile."""
    conn = get_conn()
    for p in posts:
        conn.execute("""
            INSERT INTO posts (profile_id, platform_id, post_url, thumbnail_url, description,
                              views, likes, comments, shares, duration_seconds, viral_score, posted_at, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(profile_id, platform_id) DO UPDATE SET
                views=excluded.views, likes=excluded.likes, comments=excluded.comments,
                shares=excluded.shares, viral_score=excluded.viral_score, scraped_at=excluded.scraped_at,
                thumbnail_url=excluded.thumbnail_url, description=excluded.description
        """, (
            profile_id, p.get('platform_id', ''), p.get('post_url', ''),
            p.get('thumbnail_url', ''), p.get('description', ''),
            p.get('views', 0), p.get('likes', 0), p.get('comments', 0),
            p.get('shares', 0), p.get('duration_seconds', 0), p.get('viral_score', 0),
            p.get('posted_at'), datetime.utcnow().isoformat()
        ))
    conn.commit()
    conn.close()


def get_posts(profile_id: int, limit: int = 50) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM posts WHERE profile_id=? ORDER BY viral_score DESC LIMIT ?",
        (profile_id, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_top_content(limit: int = 20) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""
        SELECT p.*, pr.username, pr.platform, pr.avatar_url, pr.display_name
        FROM posts p
        JOIN profiles pr ON p.profile_id = pr.id
        ORDER BY p.viral_score DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def log_scrape(profile_id: int, status: str, posts_found: int = 0,
               error_message: str = None, duration_ms: int = 0):
    conn = get_conn()
    conn.execute("""
        INSERT INTO scrape_log (profile_id, status, posts_found, error_message, duration_ms)
        VALUES (?, ?, ?, ?, ?)
    """, (profile_id, status, posts_found, error_message, duration_ms))
    conn.commit()
    conn.close()


# Initialize on import
init_db()
