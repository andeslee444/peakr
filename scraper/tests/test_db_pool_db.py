"""Integration test: get_conn should pool/reuse connections, not reconnect each call."""

import pytest


@pytest.mark.db
def test_get_conn_reuses_pooled_connection(scraper_db):
    c1 = scraper_db.get_conn()
    pid1 = c1.get_backend_pid()
    c1.close()  # with pooling this returns the connection rather than closing it

    c2 = scraper_db.get_conn()
    pid2 = c2.get_backend_pid()
    c2.close()

    # Same server-side backend PID => the connection was reused from the pool,
    # not a brand-new TCP/TLS connect (which is the per-call cost we're removing).
    assert pid1 == pid2


@pytest.mark.db
def test_pooled_conn_still_works_for_queries(scraper_db):
    conn = scraper_db.get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT 1")
        assert cur.fetchone()[0] == 1
    conn.commit()
    conn.close()
