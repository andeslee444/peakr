"""Integration test: viral-score recompute should skip no-op writes."""

import pytest


def _profile(conn):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO profiles (username, platform) VALUES ('vs','tiktok') RETURNING id")
        pid = cur.fetchone()[0]
    conn.commit()
    return pid


def _post(conn, profile_id, platform_id, likes, comments):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO posts (profile_id, platform_id, likes, comments)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (profile_id, platform_id, likes, comments),
        )
        pid = cur.fetchone()[0]
    conn.commit()
    return pid


@pytest.mark.db
def test_recalculate_skips_noop_writes(scraper_db, db_conn):
    profile_id = _profile(db_conn)
    _post(db_conn, profile_id, "a", 100, 10)
    _post(db_conn, profile_id, "b", 300, 30)
    _post(db_conn, profile_id, "c", 50, 5)

    # First pass writes scores for all engaged posts.
    first = scraper_db.recalculate_viral_scores(profile_id)
    assert first >= 3

    # Second pass with identical data must update NOTHING (no row/index churn).
    second = scraper_db.recalculate_viral_scores(profile_id)
    assert second == 0
