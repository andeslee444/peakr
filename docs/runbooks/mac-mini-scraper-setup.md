# Mac Mini Scraper Setup (reproducible)

The Python scraper daemon runs on the Mac Mini (Apple Silicon). This is the
full, reproducible setup so a rebuild needs no guesswork. Everything here is
**no-sudo and no Homebrew** — dependencies (including ffmpeg) come from pip.

## Prerequisites
- macOS on Apple Silicon (M-series). Verify: `uname -m` → `arm64`.
- Python 3.11+ (`python3.11 --version`). The repo lives at
  `~/Documents/cursor-projects/peakr`.

## 1. Clone + virtualenv + dependencies
```bash
cd ~/Documents/cursor-projects/peakr
python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```
`requirements.txt` includes:
- the scraper stack (camoufox, curl_cffi, playwright, psycopg2-binary, boto3, httpx, sentry-sdk),
- `yt-dlp` (pinned — TikTok/IG resolution; update deliberately),
- `imageio-ffmpeg` (bundled ffmpeg binary — no Homebrew needed),
- `mlx-whisper` (Apple-Silicon GPU transcription, marker-gated to arm64 macOS).

## 2. ffmpeg — automatic, no install step
`ffmpeg` is required by audio extraction **and** mlx-whisper (both shell out to
the `ffmpeg` command). You do **not** need Homebrew: `scraper/transcribe.py`'s
`ensure_ffmpeg_on_path()` runs at the start of every analysis pass and, if no
system `ffmpeg` is on PATH, exposes the pip-bundled `imageio-ffmpeg` binary under
the plain name `ffmpeg` in `~/.cache/peakr-bin` and prepends it to PATH.

If you ever want a system ffmpeg instead (optional), install Homebrew (needs your
sudo password — do this yourself) then `brew install ffmpeg`; the code prefers a
system ffmpeg when present.

## 3. Transcription model (mlx-whisper)
First transcription downloads the model to `~/.cache/huggingface` (one-time,
~150 MB for `whisper-base-mlx`). Override the model with `MLX_WHISPER_MODEL`
(e.g. `mlx-community/whisper-large-v3-turbo` for higher accuracy). On the M4,
steady-state transcription is ~1 s per short clip.

## 4. Environment (daemon wrapper)
`~/.local/bin/peakr-daemon.sh` exports the daemon env and execs the venv python:
- `DATABASE_URL` (Neon), `ANTHROPIC_API_KEY` (LLM hook analysis) — **secrets;
  rotate the Anthropic key, don't keep it plaintext long-term**.
- Optional: `WHISPER_MODE` (default `local` = mlx on Apple Silicon),
  `ANALYSIS_CONCURRENCY` (default 3), `MLX_WHISPER_MODEL`.
- `PATH` should include `$HOME/.local/bin`. (ffmpeg self-resolves regardless, but
  keeping it here is harmless.)

## 5. launchd service
`~/Library/LaunchAgents/com.peakr.daemon.plist` runs the wrapper under launchd
(KeepAlive). Logs: `~/Library/Logs/peakr-daemon.{out,err}`.
- Restart: `launchctl kickstart -k gui/$(id -u)/com.peakr.daemon`
- Status:  `launchctl list | grep peakr`  (a PID + exit code 0 = healthy)

## 6. Verify
```bash
# deps present
.venv/bin/pip list | grep -E "mlx-whisper|imageio-ffmpeg|yt-dlp"
# ffmpeg self-resolves + transcription works
say -o /tmp/t.aiff "the quick brown fox"
PYTHONPATH=$PWD .venv/bin/python -c "import scraper.transcribe as t; t.ensure_ffmpeg_on_path(); print(t._transcribe_mlx('/tmp/t.aiff'))"
```

## Deploy flow
The Mini auto-pulls from GitHub and restarts the daemon. Gate a restart with
`scripts/predeploy-check.sh` (smoke-import + tests) so a bad commit doesn't
crash-loop. After `pip install -r requirements.txt`, kickstart the daemon.
