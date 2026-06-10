"""Viral-post notifications must fire once per post per user, not on every
re-scrape (the old dedup keyed on the changing view count)."""

import pytest


def _setup(conn, views=1_000_000, score=5.0):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO users (email) VALUES ('n@x.com') RETURNING id")
        user_id = cur.fetchone()[0]
        cur.execute("INSERT INTO profiles (username, platform) VALUES ('viral','tiktok') RETURNING id")
        profile_id = cur.fetchone()[0]
        cur.execute("INSERT INTO user_tracked_profiles (user_id, profile_id) VALUES (%s, %s)", (user_id, profile_id))
        cur.execute(
            "INSERT INTO posts (profile_id, platform_id, viral_score, views, scraped_at) VALUES (%s, 'p1', %s, %s, NOW()) RETURNING id",
            (profile_id, score, views),
        )
        post_id = cur.fetchone()[0]
    conn.commit()
    return user_id, profile_id, post_id


@pytest.mark.db
def test_notifies_once_then_dedupes(scraper_db, db_conn):
    _setup(db_conn)
    first = scraper_db.generate_viral_post_notifications('viral', 'tiktok')
    assert first == 1
    second = scraper_db.generate_viral_post_notifications('viral', 'tiktok')
    assert second == 0  # same post -> no duplicate


@pytest.mark.db
def test_dedupes_even_when_views_change(scraper_db, db_conn):
    _setup(db_conn)
    assert scraper_db.generate_viral_post_notifications('viral', 'tiktok') == 1
    # Views climb on re-scrape; must still not re-notify.
    with db_conn.cursor() as cur:
        cur.execute("UPDATE posts SET views = 2_000_000 WHERE platform_id = 'p1'")
    db_conn.commit()
    assert scraper_db.generate_viral_post_notifications('viral', 'tiktok') == 0
