"""Mega-creator metrics exceed 32-bit INTEGER range; columns must be BIGINT."""

import pytest

OVER_INT32 = 3_000_000_000  # > 2^31-1 (2,147,483,647)


@pytest.mark.db
def test_post_views_and_likes_accept_billions(scraper_db, db_conn):
    with db_conn.cursor() as cur:
        cur.execute("INSERT INTO profiles (username, platform) VALUES ('mega', 'tiktok') RETURNING id")
        profile_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO posts (profile_id, platform_id, views, likes, comments, shares)
               VALUES (%s, 'p1', %s, %s, %s, %s) RETURNING id""",
            (profile_id, OVER_INT32, OVER_INT32, OVER_INT32, OVER_INT32),
        )
        post_id = cur.fetchone()[0]
        db_conn.commit()
        cur.execute("SELECT views, likes FROM posts WHERE id = %s", (post_id,))
        views, likes = cur.fetchone()
    assert views == OVER_INT32
    assert likes == OVER_INT32


@pytest.mark.db
def test_profile_total_likes_accepts_billions(scraper_db, db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO profiles (username, platform, total_likes, followers) VALUES ('mega2','tiktok',%s,%s) RETURNING id",
            (OVER_INT32, OVER_INT32),
        )
        pid = cur.fetchone()[0]
        db_conn.commit()
        cur.execute("SELECT total_likes, followers FROM profiles WHERE id = %s", (pid,))
        total_likes, followers = cur.fetchone()
    assert total_likes == OVER_INT32
    assert followers == OVER_INT32
