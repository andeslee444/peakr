"""Tests for self-bootstrapping ffmpeg resolution (no Homebrew/sudo/symlink needed)."""

import os
import sys
import types

import scraper.transcribe as transcribe


def test_returns_system_ffmpeg_when_present(monkeypatch):
    monkeypatch.setattr(transcribe.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    assert transcribe.ensure_ffmpeg_on_path() == "/usr/bin/ffmpeg"


def test_falls_back_to_bundled_and_exposes_plain_ffmpeg(monkeypatch, tmp_path):
    # No system ffmpeg on PATH.
    monkeypatch.setattr(transcribe.shutil, "which", lambda name: None)
    # The bundled binary has a platform-suffixed name, not "ffmpeg".
    bundled = tmp_path / "ffmpeg-macos-aarch64-v7.1"
    bundled.write_text("#!/bin/sh\n")
    os.chmod(bundled, 0o755)
    fake = types.ModuleType("imageio_ffmpeg")
    fake.get_ffmpeg_exe = lambda: str(bundled)
    monkeypatch.setitem(sys.modules, "imageio_ffmpeg", fake)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PATH", "/usr/bin")

    result = transcribe.ensure_ffmpeg_on_path()

    assert os.path.basename(result) == "ffmpeg"                 # exposed under the plain name
    assert os.path.realpath(result) == str(bundled)            # -> the bundled binary
    assert os.path.dirname(result) in os.environ["PATH"]        # dir prepended to PATH


def test_returns_none_when_nothing_available(monkeypatch):
    monkeypatch.setattr(transcribe.shutil, "which", lambda name: None)
    # A None entry makes `import imageio_ffmpeg` raise ImportError.
    monkeypatch.setitem(sys.modules, "imageio_ffmpeg", None)
    assert transcribe.ensure_ffmpeg_on_path() is None
