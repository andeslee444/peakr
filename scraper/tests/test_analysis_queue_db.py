"""Integration tests (real Postgres) for analysis-queue selection + failure marking."""

import json

import pytest


def _insert_profile(conn, username="u"):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO profiles (username, platform) VALUES (%s, 'tiktok') RETURNING id",
            (username,),
        )
        pid = cur.fetchone()[0]
    conn.commit()
    return pid


def _insert_post(conn, profile_id, platform_id, viral_score, hook_analysis, analyzed_at=None):
    ha = json.dumps(hook_analysis) if hook_analysis is not None else None
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO posts
               (profile_id, platform_id, post_url, viral_score, hook_analysis, analyzed_at, duration_seconds)
               VALUES (%s, %s, 'https://x', %s, %s::jsonb, %s, 60) RETURNING id""",
            (profile_id, platform_id, viral_score, ha, analyzed_at),
        )
        pid = cur.fetchone()[0]
    conn.commit()
    return pid


@pytest.mark.db
def test_get_unanalyzed_excludes_terminal_failures(scraper_db, db_conn):
    profile_id = _insert_profile(db_conn)
    pending = _insert_post(db_conn, profile_id, "a", 0.5, {"status": "pending"})
    terminal = _insert_post(db_conn, profile_id, "b", 9.0, {"status": "failed", "attempts": 3})
    retryable = _insert_post(db_conn, profile_id, "c", 9.0, {"status": "failed", "attempts": 1})
    fresh = _insert_post(db_conn, profile_id, "d", 9.0, None)

    ids = {p["id"] for p in scraper_db.get_unanalyzed_viral_posts(threshold=1.5, limit=50)}

    assert pending in ids            # queued posts are always picked up
    assert fresh in ids              # never-attempted viral posts are picked up
    assert retryable in ids          # below max attempts -> retried
    assert terminal not in ids       # terminal failures are NOT re-selected


@pytest.mark.db
def test_mark_analysis_failed_writes_marker(scraper_db, db_conn):
    profile_id = _insert_profile(db_conn, username="v")
    post_id = _insert_post(db_conn, profile_id, "z", 2.0, {"status": "pending"})

    scraper_db.mark_analysis_failed(post_id, attempts=2, reason="llm_error")

    with db_conn.cursor() as cur:
        cur.execute("SELECT hook_analysis, analyzed_at FROM posts WHERE id = %s", (post_id,))
        hook_analysis, analyzed_at = cur.fetchone()
    assert hook_analysis["status"] == "failed"
    assert hook_analysis["attempts"] == 2
    assert hook_analysis["reason"] == "llm_error"
    assert analyzed_at is None  # a failed post is not marked analyzed
