"""analyze_post must record failures (not leave posts 'pending') to avoid the
daemon livelock. Heavy I/O deps are monkeypatched; no DB or network is used."""

import scraper.analyze as analyze
from scraper.analysis_state import MAX_ANALYSIS_ATTEMPTS


def _patch(monkeypatch, *, analysis_result, download_ok=False):
    calls = {"failed": [], "saved": [], "analyze_hook": 0}

    monkeypatch.setattr(analyze, "download_video", lambda *a, **k: download_ok)
    monkeypatch.setattr(analyze, "extract_audio", lambda *a, **k: False)
    monkeypatch.setattr(analyze, "transcribe_audio", lambda *a, **k: None)
    monkeypatch.setattr(analyze, "extract_keyframes", lambda *a, **k: [])

    def fake_analyze_hook(**kwargs):
        calls["analyze_hook"] += 1
        return analysis_result

    def fake_save(*a, **k):
        calls["saved"].append(a)

    def fake_mark_failed(post_id, attempts, reason=""):
        calls["failed"].append((post_id, attempts, reason))

    monkeypatch.setattr(analyze, "analyze_hook", fake_analyze_hook)
    monkeypatch.setattr(analyze, "save_hook_analysis", fake_save)
    monkeypatch.setattr(analyze, "mark_analysis_failed", fake_mark_failed)
    return calls


def test_no_url_is_marked_terminal_without_calling_the_model(monkeypatch):
    calls = _patch(monkeypatch, analysis_result=None)
    post = {"id": 1, "post_url": "", "hook_analysis": {"status": "pending"}}
    assert analyze.analyze_post(post) is False
    assert calls["analyze_hook"] == 0
    assert calls["failed"] == [(1, MAX_ANALYSIS_ATTEMPTS, "no_url")]


def test_too_long_is_marked_terminal(monkeypatch):
    calls = _patch(monkeypatch, analysis_result=None)
    post = {"id": 2, "post_url": "https://x", "duration_seconds": 400, "hook_analysis": {"status": "pending"}}
    assert analyze.analyze_post(post) is False
    assert calls["failed"] == [(2, MAX_ANALYSIS_ATTEMPTS, "too_long")]


def test_analysis_failure_increments_attempts(monkeypatch):
    calls = _patch(monkeypatch, analysis_result=None)
    post = {"id": 3, "post_url": "https://x", "duration_seconds": 60, "hook_analysis": {"status": "pending"}}
    assert analyze.analyze_post(post) is False
    assert len(calls["failed"]) == 1
    post_id, attempts, _reason = calls["failed"][0]
    assert post_id == 3
    assert attempts == 1  # prior 0 + 1


def test_retry_failure_increments_from_prior_attempts(monkeypatch):
    calls = _patch(monkeypatch, analysis_result=None)
    post = {"id": 4, "post_url": "https://x", "duration_seconds": 60,
            "hook_analysis": {"status": "failed", "attempts": 1}}
    assert analyze.analyze_post(post) is False
    assert calls["failed"][0][1] == 2  # prior 1 + 1


def test_success_saves_and_does_not_mark_failed(monkeypatch):
    calls = _patch(monkeypatch, analysis_result={"hook_type": "question", "hook_score": 8})
    post = {"id": 5, "post_url": "https://x", "duration_seconds": 60, "hook_analysis": {"status": "pending"}}
    assert analyze.analyze_post(post) is True
    assert calls["failed"] == []
    assert len(calls["saved"]) == 1
