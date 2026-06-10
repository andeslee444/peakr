"""Pytest fixtures for the Peakr scraper test suite.

Pure-logic tests run with no external dependencies. Tests marked ``@pytest.mark.db``
require a Postgres database; this conftest auto-provisions a throwaway Postgres
container via Docker (port 55432) for the whole test session and tears it down at
the end. If Docker is unavailable, db-marked tests are skipped rather than failing,
so the suite stays green in any environment. Production RDS is never used.
"""

import os
import subprocess
import time

import pytest

TEST_CONTAINER = "peakr-test-pg"
TEST_PORT = 55432
TEST_DSN = f"postgresql://postgres:test@127.0.0.1:{TEST_PORT}/postgres"


def _docker_available() -> bool:
    try:
        subprocess.run(
            ["docker", "info"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
        return True
    except Exception:
        return False


def _wait_for_pg(dsn: str, timeout: float = 30.0) -> bool:
    import psycopg2

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = psycopg2.connect(dsn, connect_timeout=2)
            conn.close()
            return True
        except Exception:
            time.sleep(0.5)
    return False


@pytest.fixture(scope="session")
def test_dsn():
    """Provide a DSN to a Postgres test database, or skip db tests if unavailable.

    Honors an externally-provided TEST_DATABASE_URL (e.g. CI). Otherwise spins up a
    Docker container for the session.
    """
    external = os.environ.get("TEST_DATABASE_URL")
    if external:
        if not _wait_for_pg(external, timeout=10):
            pytest.skip("TEST_DATABASE_URL is set but not reachable")
        yield external
        return

    if not _docker_available():
        pytest.skip("Docker not available; skipping db-backed tests")

    subprocess.run(["docker", "rm", "-f", TEST_CONTAINER],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(
        ["docker", "run", "-d", "--rm", "--name", TEST_CONTAINER,
         "-e", "POSTGRES_PASSWORD=test",
         "-p", f"{TEST_PORT}:5432", "postgres:16"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        if not _wait_for_pg(TEST_DSN, timeout=40):
            pytest.skip("Postgres test container did not become ready")
        yield TEST_DSN
    finally:
        subprocess.run(["docker", "rm", "-f", TEST_CONTAINER],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


@pytest.fixture()
def scraper_db(test_dsn):
    """The scraper.db module, wired to the test database with schema loaded."""
    import psycopg2

    os.environ["DATABASE_URL"] = test_dsn
    from scraper import db as _db

    # DATABASE_URL is read into a module global at import time; override it so
    # get_conn() targets the test DB even if the module was imported earlier.
    _db.DATABASE_URL = test_dsn

    # Reset to a clean schema for every test for isolation.
    drop_conn = psycopg2.connect(test_dsn)
    drop_conn.autocommit = True
    with drop_conn.cursor() as cur:
        cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    drop_conn.close()

    _db.init_db()
    _db.migrate_audio_columns()
    _db.migrate_hook_columns()
    return _db


@pytest.fixture()
def db_conn(scraper_db, test_dsn):
    """A raw psycopg2 connection to the test DB (schema already loaded)."""
    import psycopg2

    conn = psycopg2.connect(test_dsn)
    yield conn
    conn.close()
