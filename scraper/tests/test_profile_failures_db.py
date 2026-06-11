"""Integration tests for persistent per-profile failure tracking + reaping."""

import pytest

from scraper.backoff import REAP_THRESHOLD


def _insert_tracked_profile(scraper_db, conn, username, consecutive_failures=0):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO profiles (username, platform, consecutive_failures) VALUES (%s, 'tiktok', %s) RETURNING id",
            (username, consecutive_failures),
        )
        pid = cur.fetchone()[0]
        # A user must track it for it to be "active".
        cur.execute("INSERT INTO users (username) VALUES (%s) RETURNING id", (username + "_owner",))
        uid = cur.fetchone()[0]
        cur.execute("INSERT INTO user_tracked_profiles (user_id, profile_id) VALUES (%s, %s)", (uid, pid))
    conn.commit()
    return pid


@pytest.mark.db
def test_record_failure_increments_and_success_resets(scraper_db, db_conn):
    _insert_tracked_profile(scraper_db, db_conn, "flaky")
    scraper_db.record_scrape_failure("flaky", "tiktok")
    scraper_db.record_scrape_failure("flaky", "tiktok")
    with db_conn.cursor() as cur:
        cur.execute("SELECT consecutive_failures, last_scrape_failed_at FROM profiles WHERE username='flaky'")
        n, failed_at = cur.fetchone()
    assert n == 2
    assert failed_at is not None

    scraper_db.record_scrape_success("flaky", "tiktok")
    with db_conn.cursor() as cur:
        cur.execute("SELECT consecutive_failures FROM profiles WHERE username='flaky'")
        assert cur.fetchone()[0] == 0


@pytest.mark.db
def test_get_active_profiles_reaps_dead_profiles(scraper_db, db_conn):
    """A profile that has failed REAP_THRESHOLD times in a row (deleted/private/
    banned) stops being scraped instead of being retried forever."""
    _insert_tracked_profile(scraper_db, db_conn, "alive", consecutive_failures=REAP_THRESHOLD - 1)
    _insert_tracked_profile(scraper_db, db_conn, "dead", consecutive_failures=REAP_THRESHOLD)

    names = {p["username"] for p in scraper_db.get_active_profiles()}
    assert "alive" in names
    assert "dead" not in names
