"""Integration test for the in-app 'new hooks in your niche' digest (value loop)."""

import json

import pytest


def _user_with_niche(conn, username, niche):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO users (username) VALUES (%s) RETURNING id", (username,))
        uid = cur.fetchone()[0]
        cur.execute("INSERT INTO creator_profiles (user_id, niche) VALUES (%s, %s)", (uid, niche))
    conn.commit()
    return uid


_post_seq = [0]


def _analyzed_post(conn, niche, when_sql="NOW()"):
    _post_seq[0] += 1
    with conn.cursor() as cur:
        cur.execute("INSERT INTO profiles (username, platform) VALUES ('np','tiktok') ON CONFLICT (username,platform) DO UPDATE SET platform='tiktok' RETURNING id")
        pid = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO posts (profile_id, platform_id, hook_analysis, analyzed_at) "
            f"VALUES (%s, %s, %s::jsonb, {when_sql})",
            (pid, f"post-{_post_seq[0]}", json.dumps({"niche": niche, "hook_type": "x"})),
        )
    conn.commit()


@pytest.mark.db
def test_niche_digest_creates_one_per_user_per_day(scraper_db, db_conn):
    uid = _user_with_niche(db_conn, "creator1", "fitness")
    _user_with_niche(db_conn, "creator2", "cooking")  # different niche, no fresh hooks
    _analyzed_post(db_conn, "fitness")
    _analyzed_post(db_conn, "fitness")

    created = scraper_db.generate_niche_digest_notifications()
    assert created == 1  # only the fitness user has fresh hooks

    with db_conn.cursor() as cur:
        cur.execute("SELECT type, link FROM notifications WHERE user_id = %s", (uid,))
        row = cur.fetchone()
    assert row[0] == "niche_digest"
    assert "fitness" in row[1]

    # Running again the same day must not duplicate.
    assert scraper_db.generate_niche_digest_notifications() == 0
