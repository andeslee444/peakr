"""Integration tests for stuck-queue recovery and worker heartbeats."""

import pytest


def _insert_profile(conn):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO profiles (username, platform) VALUES ('q','tiktok') RETURNING id")
        pid = cur.fetchone()[0]
    conn.commit()
    return pid


@pytest.mark.db
def test_reclaim_resets_stale_in_progress_rows(scraper_db, db_conn):
    profile_id = _insert_profile(db_conn)
    with db_conn.cursor() as cur:
        # Stale: claimed 20 minutes ago and never finished (daemon crashed).
        cur.execute(
            "INSERT INTO scrape_queue (profile_id, status, started_at) VALUES (%s, 'in_progress', NOW() - INTERVAL '20 minutes') RETURNING id",
            (profile_id,),
        )
        stale_id = cur.fetchone()[0]
        # Fresh: just claimed, should NOT be reclaimed.
        cur.execute(
            "INSERT INTO scrape_queue (profile_id, status, started_at) VALUES (%s, 'in_progress', NOW()) RETURNING id",
            (profile_id,),
        )
        fresh_id = cur.fetchone()[0]
    db_conn.commit()

    reclaimed = scraper_db.reclaim_stale_queue_entries(max_age_minutes=15)
    assert reclaimed == 1

    with db_conn.cursor() as cur:
        cur.execute("SELECT status FROM scrape_queue WHERE id = %s", (stale_id,))
        assert cur.fetchone()[0] == 'pending'
        cur.execute("SELECT status FROM scrape_queue WHERE id = %s", (fresh_id,))
        assert cur.fetchone()[0] == 'in_progress'


@pytest.mark.db
def test_record_heartbeat_upserts(scraper_db, db_conn):
    scraper_db.record_heartbeat('worker-1', status='ok')
    scraper_db.record_heartbeat('worker-1', status='ok')  # second call updates, not duplicates
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), MAX(status) FROM worker_heartbeats WHERE worker_id = 'worker-1'")
        count, status = cur.fetchone()
    assert count == 1
    assert status == 'ok'
