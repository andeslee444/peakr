"""Integration tests for stuck-queue recovery and worker heartbeats."""

import threading

import psycopg2
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
def test_pop_skips_a_locked_row_instead_of_blocking(scraper_db, db_conn, test_dsn):
    """Two workers must not double-claim. With FOR UPDATE SKIP LOCKED, popping
    while another transaction holds the lowest pending row returns the NEXT row
    rather than blocking on the locked one."""
    profile_id = _insert_profile(db_conn)
    with db_conn.cursor() as cur:
        cur.execute("INSERT INTO scrape_queue (profile_id, status) VALUES (%s, 'pending') RETURNING id", (profile_id,))
        row1 = cur.fetchone()[0]
        cur.execute("INSERT INTO scrape_queue (profile_id, status) VALUES (%s, 'pending') RETURNING id", (profile_id,))
        row2 = cur.fetchone()[0]
    db_conn.commit()

    # Lock the lowest-id pending row from a separate, uncommitted transaction.
    lock_conn = psycopg2.connect(test_dsn)
    try:
        with lock_conn.cursor() as cur:
            cur.execute("SELECT id FROM scrape_queue WHERE id = %s FOR UPDATE", (row1,))

        result = {}
        worker = threading.Thread(target=lambda: result.setdefault('val', scraper_db.pop_scrape_queue()))
        worker.start()
        worker.join(timeout=5)
        blocked = worker.is_alive()

        # Release the lock so a blocked worker can finish and the thread joins.
        lock_conn.rollback()
        worker.join(timeout=5)

        assert not blocked, "pop_scrape_queue blocked on a locked row (missing FOR UPDATE SKIP LOCKED)"
        assert result.get('val') is not None
        assert result['val'][0] == row2, "should have claimed the next free row, not the locked one"
    finally:
        lock_conn.close()


@pytest.mark.db
def test_record_heartbeat_upserts(scraper_db, db_conn):
    scraper_db.record_heartbeat('worker-1', status='ok')
    scraper_db.record_heartbeat('worker-1', status='ok')  # second call updates, not duplicates
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), MAX(status) FROM worker_heartbeats WHERE worker_id = 'worker-1'")
        count, status = cur.fetchone()
    assert count == 1
    assert status == 'ok'
