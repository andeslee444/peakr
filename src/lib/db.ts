import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'peakr.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    // Ensure tables exist (mirrors scraper/db.py schema)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL,
        platform TEXT NOT NULL,
        display_name TEXT,
        bio TEXT,
        avatar_url TEXT,
        followers INTEGER,
        following INTEGER,
        total_likes INTEGER,
        post_count INTEGER,
        avg_views REAL,
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
        is_video INTEGER DEFAULT 0,
        viral_score REAL,
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
    `);
  }
  return _db;
}
