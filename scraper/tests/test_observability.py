"""Sentry wiring must be a safe no-op when unconfigured (or sentry_sdk absent)."""

import importlib


def _fresh(monkeypatch, dsn=None):
    if dsn is None:
        monkeypatch.delenv("SENTRY_DSN", raising=False)
    else:
        monkeypatch.setenv("SENTRY_DSN", dsn)
    import scraper.observability as obs
    importlib.reload(obs)
    return obs


def test_init_sentry_returns_false_without_dsn(monkeypatch):
    obs = _fresh(monkeypatch, dsn=None)
    assert obs.init_sentry() is False


def test_capture_exception_never_raises(monkeypatch):
    obs = _fresh(monkeypatch, dsn=None)
    obs.init_sentry()
    # Must not raise even though Sentry is not configured.
    obs.capture_exception(ValueError("boom"))
