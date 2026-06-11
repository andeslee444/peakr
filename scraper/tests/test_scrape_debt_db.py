"""Integration test for the scrape-debt metric (profiles past their refresh SLA)."""

import pytest

from scraper.backoff import REAP_THRESHOLD


def _tracked_profile(scraper_db, conn, username, last_scraped_sql, failures=0):
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO profiles (username, platform, last_scraped_at, consecutive_failures) "
            f"VALUES (%s, 'tiktok', {last_scraped_sql}, %s) RETURNING id",
            (username, failures),
        )
        pid = cur.fetchone()[0]
        cur.execute("INSERT INTO users (username) VALUES (%s) RETURNING id", (username + "_o",))
        uid = cur.fetchone()[0]
        cur.execute("INSERT INTO user_tracked_profiles (user_id, profile_id) VALUES (%s, %s)", (uid, pid))
    conn.commit()
    return pid


@pytest.mark.db
def test_get_scrape_debt_counts_stale_and_null(scraper_db, db_conn):
    sla = 4 * 3600  # 4 hours
    _tracked_profile(scraper_db, db_conn, "fresh", "NOW()")                       # within SLA
    _tracked_profile(scraper_db, db_conn, "stale", "NOW() - INTERVAL '9 hours'")  # past SLA
    _tracked_profile(scraper_db, db_conn, "never", "NULL")                        # never scraped
    # Reaped dead profile must NOT count as debt (we've stopped scraping it).
    _tracked_profile(scraper_db, db_conn, "dead", "NULL", failures=REAP_THRESHOLD)

    debt = scraper_db.get_scrape_debt(sla)
    assert debt == 2  # stale + never, not fresh, not dead
