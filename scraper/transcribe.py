"""Video download, audio extraction, keyframe extraction, and transcription."""

import os
import subprocess
import tempfile
import logging
from pathlib import Path
from typing import Optional

log = logging.getLogger("peakr-transcribe")

# Whisper mode: "local" (free, uses whisper CLI on Mac Mini) or "api" (OpenAI API, $0.006/min)
WHISPER_MODE = os.environ.get("WHISPER_MODE", "local")


def download_video(post_url: str, output_path: str) -> bool:
    """Download a video using yt-dlp. Returns True on success."""
    try:
        result = subprocess.run(
            ["yt-dlp", "-o", output_path, "--no-playlist", post_url],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            log.error(f"yt-dlp failed: {result.stderr[:500]}")
            return False
        return Path(output_path).exists()
    except subprocess.TimeoutExpired:
        log.error("yt-dlp timed out")
        return False
    except FileNotFoundError:
        log.error("yt-dlp not installed")
        return False


def extract_audio(video_path: str, audio_path: str) -> bool:
    """Extract audio from video as 16kHz mono WAV."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
             "-ar", "16000", "-ac", "1", audio_path],
            capture_output=True, text=True, timeout=60
        )
        return result.returncode == 0 and Path(audio_path).exists()
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        log.error(f"ffmpeg audio extraction failed: {e}")
        return False


def extract_keyframes(video_path: str, output_dir: str, duration: float = 5.0, count: int = 4) -> list[str]:
    """Extract evenly-spaced keyframes from the first N seconds of a video."""
    frames = []
    interval = duration / count
    for i in range(count):
        timestamp = interval * i + interval / 2
        out_path = os.path.join(output_dir, f"frame_{i:02d}.jpg")
        try:
            result = subprocess.run(
                ["ffmpeg", "-y", "-ss", str(timestamp), "-i", video_path,
                 "-frames:v", "1", "-q:v", "2", out_path],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0 and Path(out_path).exists():
                frames.append(out_path)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue
    return frames


def transcribe_audio(audio_path: str) -> Optional[str]:
    """Transcribe audio using either local Whisper or OpenAI API."""
    if WHISPER_MODE == "api":
        return _transcribe_api(audio_path)
    else:
        return _transcribe_local(audio_path)


def _transcribe_local(audio_path: str) -> Optional[str]:
    """Transcribe using local whisper CLI (free, runs on Mac Mini).

    Requires: pip3 install openai-whisper
    Or: brew install whisper-cpp
    """
    # Try openai-whisper (Python package) first
    try:
        result = subprocess.run(
            ["whisper", audio_path, "--model", "base", "--output_format", "txt",
             "--output_dir", str(Path(audio_path).parent)],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0:
            txt_path = Path(audio_path).with_suffix(".txt")
            if txt_path.exists():
                transcript = txt_path.read_text().strip()
                txt_path.unlink(missing_ok=True)
                # Clean up other whisper output files
                for ext in [".srt", ".vtt", ".tsv", ".json"]:
                    Path(audio_path).with_suffix(ext).unlink(missing_ok=True)
                return transcript if transcript else None
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # Fallback: whisper-cpp
    try:
        result = subprocess.run(
            ["whisper-cpp", "-m", "base", "-f", audio_path],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    log.error("Local whisper not available. Install with: pip3 install openai-whisper")
    return None


def _transcribe_api(audio_path: str) -> Optional[str]:
    """Transcribe using OpenAI Whisper API ($0.006/min)."""
    import httpx

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        log.error("OPENAI_API_KEY not set and WHISPER_MODE=api")
        return None

    try:
        with open(audio_path, "rb") as f:
            resp = httpx.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("audio.wav", f, "audio/wav")},
                data={"model": "whisper-1"},
                timeout=120.0,
            )
        if resp.status_code == 200:
            return resp.json().get("text", "").strip() or None
        else:
            log.error(f"Whisper API error {resp.status_code}: {resp.text[:300]}")
            return None
    except Exception as e:
        log.error(f"Whisper API request failed: {e}")
        return None
