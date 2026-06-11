"""Video download, audio extraction, keyframe extraction, and transcription."""

import os
import shutil
import subprocess
import tempfile
import logging
from pathlib import Path
from typing import Optional

log = logging.getLogger("peakr-transcribe")


def ensure_ffmpeg_on_path() -> Optional[str]:
    """Guarantee an ``ffmpeg`` binary is discoverable on PATH (idempotent).

    Prefers a system ffmpeg (Homebrew etc.); otherwise exposes the pip-bundled
    imageio-ffmpeg binary under the plain name ``ffmpeg`` in a cache dir and
    prepends it to PATH. This makes the scraper self-bootstrapping from
    requirements.txt alone — no Homebrew, sudo, or manual symlink needed for
    audio extraction / mlx-whisper (both of which shell out to ``ffmpeg``).
    Returns the resolved ffmpeg path, or None if nothing is available.
    """
    existing = shutil.which("ffmpeg")
    if existing:
        return existing
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:  # not installed / failed to resolve
        log.warning(f"ffmpeg not on PATH and imageio-ffmpeg unavailable: {e}")
        return None
    bindir = Path.home() / ".cache" / "peakr-bin"
    bindir.mkdir(parents=True, exist_ok=True)
    link = bindir / "ffmpeg"
    try:
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(exe)
    except OSError:
        try:
            shutil.copy2(exe, link)
            link.chmod(0o755)
        except OSError as e:
            log.error(f"Could not expose bundled ffmpeg: {e}")
            return None
    os.environ["PATH"] = f"{bindir}{os.pathsep}{os.environ.get('PATH', '')}"
    log.info(f"ffmpeg resolved via imageio-ffmpeg: {exe}")
    return str(link)

# Whisper mode: "local" (free, uses whisper CLI on Mac Mini) or "api" (OpenAI API, $0.006/min)
WHISPER_MODE = os.environ.get("WHISPER_MODE", "local")


def _get_cookie_file() -> Optional[str]:
    """Convert Instagram cookies to Netscape format for yt-dlp."""
    cookie_json = Path(__file__).parent.parent / "data" / "cookies" / "instagram.json"
    cookie_txt = Path(__file__).parent.parent / "data" / "cookies" / "instagram_netscape.txt"
    if not cookie_json.exists():
        return None
    try:
        import json
        cookies = json.loads(cookie_json.read_text())
        lines = ["# Netscape HTTP Cookie File"]
        for c in cookies:
            domain = c.get("domain", "")
            flag = "TRUE" if domain.startswith(".") else "FALSE"
            path = c.get("path", "/")
            secure = "TRUE" if c.get("secure") else "FALSE"
            expires = str(int(c.get("expires", 0)))
            lines.append(f"{domain}\t{flag}\t{path}\t{secure}\t{expires}\t{c['name']}\t{c.get('value', '')}")
        cookie_txt.write_text("\n".join(lines) + "\n")
        return str(cookie_txt)
    except Exception:
        return None


def download_video(post_url: str, output_path: str) -> bool:
    """Download a video using yt-dlp. Returns True on success."""
    try:
        from scraper.proxy import ytdlp_proxy_args
        cmd = ["yt-dlp", "-o", output_path, "--no-playlist", *ytdlp_proxy_args()]
        cookie_file = _get_cookie_file()
        if cookie_file:
            cmd.extend(["--cookies", cookie_file])
        cmd.append(post_url)
        result = subprocess.run(
            cmd,
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
    """Transcribe audio using either local Whisper or the OpenAI API.

    Mode is read at call time so it can be flipped via WHISPER_MODE=api without a
    restart. The API path (~$0.006/min) unblocks the analysis backlog without a
    GPU — local CPU Whisper runs ~real-time and bottlenecks the single daemon.
    """
    mode = os.environ.get("WHISPER_MODE", WHISPER_MODE)
    if mode == "api":
        return _transcribe_api(audio_path)
    return _transcribe_local(audio_path)


def _transcribe_mlx(audio_path: str) -> Optional[str]:
    """Transcribe with mlx-whisper (Apple Silicon GPU — fast, free, on-device).

    Returns None when mlx-whisper isn't installed or fails, so the caller falls
    back to the whisper / whisper-cpp CLIs. Model is configurable via
    MLX_WHISPER_MODEL (a HuggingFace repo id), default whisper-base.
    """
    try:
        import mlx_whisper
    except ImportError:
        return None
    try:
        model = os.environ.get("MLX_WHISPER_MODEL", "mlx-community/whisper-base-mlx")
        result = mlx_whisper.transcribe(audio_path, path_or_hf_repo=model)
        text = (result.get("text") or "").strip()
        return text or None
    except Exception as e:
        log.error(f"mlx-whisper transcription failed: {e}")
        return None


def _transcribe_local(audio_path: str) -> Optional[str]:
    """Transcribe locally with no API key.

    Prefers mlx-whisper on Apple Silicon (the Mac Mini is an M-series), then
    falls back to the openai-whisper / whisper-cpp CLIs.

    Requires one of: pip3 install mlx-whisper  (Apple Silicon, recommended)
                     pip3 install openai-whisper
                     brew install whisper-cpp
    """
    # Prefer the GPU-accelerated Apple Silicon path.
    mlx_text = _transcribe_mlx(audio_path)
    if mlx_text is not None:
        return mlx_text

    # Try openai-whisper (Python package) next
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
