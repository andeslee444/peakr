"""Unit tests for the mlx-whisper (Apple Silicon) local transcription path."""

import sys
import types

import scraper.transcribe as transcribe


def _fake_mlx(text):
    mod = types.ModuleType("mlx_whisper")
    mod.transcribe = lambda path, path_or_hf_repo=None: {"text": text}
    return mod


def test_mlx_used_when_available(monkeypatch):
    monkeypatch.setitem(sys.modules, "mlx_whisper", _fake_mlx("  hello from mlx  "))
    assert transcribe._transcribe_mlx("audio.wav") == "hello from mlx"


def test_mlx_returns_none_when_not_installed(monkeypatch):
    # A None entry in sys.modules makes `import mlx_whisper` raise ImportError.
    monkeypatch.setitem(sys.modules, "mlx_whisper", None)
    assert transcribe._transcribe_mlx("audio.wav") is None


def test_mlx_returns_none_on_empty_transcript(monkeypatch):
    monkeypatch.setitem(sys.modules, "mlx_whisper", _fake_mlx("   "))
    assert transcribe._transcribe_mlx("audio.wav") is None


def test_local_prefers_mlx(monkeypatch):
    monkeypatch.setattr(transcribe, "_transcribe_mlx", lambda p: "mlx text")
    assert transcribe._transcribe_local("audio.wav") == "mlx text"


def test_local_falls_back_to_cli_when_mlx_unavailable(monkeypatch):
    monkeypatch.setattr(transcribe, "_transcribe_mlx", lambda p: None)
    # No whisper CLI in this env -> simulate not-found so the chain returns None.
    def not_found(*a, **k):
        raise FileNotFoundError()
    monkeypatch.setattr(transcribe.subprocess, "run", not_found)
    assert transcribe._transcribe_local("audio.wav") is None
