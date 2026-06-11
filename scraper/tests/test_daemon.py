"""Unit tests for daemon loop behavior (no DB, deps monkeypatched)."""

from scraper import daemon


def test_scrape_seed_list_heartbeats_each_creator(monkeypatch):
    """A multi-hour seed batch must keep the heartbeat fresh from inside the loop,
    or /api/worker-status reports a false 'down' for hours during nightly scrapes."""
    beats = []
    monkeypatch.setattr(daemon, "running", True)
    monkeypatch.setattr(daemon, "add_profile", lambda *a, **k: None)
    monkeypatch.setattr(daemon, "scrape_one", lambda *a, **k: True)
    monkeypatch.setattr(daemon, "drain_scrape_queue", lambda *a, **k: 0)
    monkeypatch.setattr(daemon.time, "sleep", lambda *a, **k: None)
    monkeypatch.setattr(daemon, "record_heartbeat", lambda *a, **k: beats.append(a))

    creators = [
        {"username": "a", "platform": "tiktok"},
        {"username": "b", "platform": "instagram"},
        {"username": "c", "platform": "tiktok"},
    ]
    daemon.scrape_seed_list(creators, tag="TEST")

    assert len(beats) == len(creators)
