"""Unit tests for WHISPER_MODE dispatch (no audio/network)."""

from scraper import transcribe


def test_dispatches_to_api_when_mode_is_api(monkeypatch):
    monkeypatch.setenv("WHISPER_MODE", "api")
    monkeypatch.setattr(transcribe, "_transcribe_api", lambda p: "api-result")
    monkeypatch.setattr(transcribe, "_transcribe_local", lambda p: "local-result")
    assert transcribe.transcribe_audio("x.wav") == "api-result"


def test_dispatches_to_local_by_default(monkeypatch):
    monkeypatch.delenv("WHISPER_MODE", raising=False)
    monkeypatch.setattr(transcribe, "_transcribe_api", lambda p: "api-result")
    monkeypatch.setattr(transcribe, "_transcribe_local", lambda p: "local-result")
    assert transcribe.transcribe_audio("x.wav") == "local-result"
