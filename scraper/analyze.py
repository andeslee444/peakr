"""Hook analysis orchestrator: download → transcribe → analyze → store.

Usage:
    python3 -m scraper.analyze [--max N] [--threshold N]
"""

import os
import sys
import shutil
import base64
import logging
import tempfile
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.db import get_unanalyzed_viral_posts, save_hook_analysis, mark_analysis_failed
from scraper.transcribe import download_video, extract_audio, extract_keyframes, transcribe_audio
from scraper.hooks import analyze_hook
from scraper.analysis_state import skip_reason, parse_attempts, MAX_ANALYSIS_ATTEMPTS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("peakr-analyze")

# Max videos to analyze per account (auto-analysis only)
MAX_PER_ACCOUNT = 20

# How many posts to analyze in parallel. Each analyze_post borrows its own
# pooled DB connection (db.py ThreadedConnectionPool), so concurrent calls are
# safe. Default 3 is a conservative step up from serial; tune on the Mac Mini
# (and keep it <= DB_POOL_MAX). Concurrency helps most with WHISPER_MODE=api —
# local CPU Whisper is CPU-bound, so parallel transcription contends on cores.
ANALYSIS_CONCURRENCY = int(os.environ.get("ANALYSIS_CONCURRENCY", "3"))


def analyze_post(post: dict) -> bool:
    """Analyze a single post's hook. Returns True on success.

    On failure, records a failure marker (terminal for deterministic skips,
    attempt-incrementing otherwise) so a permanently-failing post can never
    starve the daemon loop.
    """
    post_id = post["id"]
    post_url = post.get("post_url", "")
    username = post.get("username", "unknown")
    duration = post.get("duration_seconds") or 0
    prior_attempts = parse_attempts(post.get("hook_analysis"))

    # Deterministic failures can never succeed — mark terminal immediately.
    reason = skip_reason(post)
    if reason:
        log.info(f"Post {post_id} unanalyzable ({reason}); marking terminal")
        mark_analysis_failed(post_id, MAX_ANALYSIS_ATTEMPTS, reason)
        return False

    tmpdir = tempfile.mkdtemp(prefix="peakr-analyze-")
    try:
        video_path = os.path.join(tmpdir, "video.mp4")
        audio_path = os.path.join(tmpdir, "audio.wav")
        frames_dir = os.path.join(tmpdir, "frames")
        os.makedirs(frames_dir, exist_ok=True)

        # 1. Try to download video (optional — analysis works text-only too)
        transcript = None
        keyframes = []
        keyframe_b64 = None

        log.info(f"[{username}] Downloading post {post_id}...")
        video_ok = download_video(post_url, video_path)

        if video_ok:
            # 2. Extract audio
            log.info(f"[{username}] Extracting audio...")
            if extract_audio(video_path, audio_path):
                # 3. Transcribe
                log.info(f"[{username}] Transcribing...")
                transcript = transcribe_audio(audio_path)

            # 4. Extract keyframes
            log.info(f"[{username}] Extracting keyframes...")
            keyframes = extract_keyframes(video_path, frames_dir)

            # Encode first keyframe as base64
            if keyframes:
                try:
                    with open(keyframes[0], "rb") as f:
                        keyframe_b64 = base64.standard_b64encode(f.read()).decode("utf-8")
                except Exception as e:
                    log.warning(f"Could not encode keyframe for post {post_id}: {e}")
        else:
            log.warning(f"Video download failed for post {post_id}, proceeding with text-only analysis")

        # 5. Claude analysis (works with just description + transcript if available)
        log.info(f"[{username}] Analyzing hook via OpenClaw...")
        analysis = analyze_hook(
            transcript=transcript or "",
            keyframe_paths=keyframes,
            description=post.get("description", ""),
            views=post.get("views", 0),
            likes=post.get("likes", 0),
            viral_score=post.get("viral_score", 0),
            duration=duration,
        )

        if not analysis:
            attempts = prior_attempts + 1
            log.error(f"Hook analysis failed for post {post_id} (attempt {attempts}/{MAX_ANALYSIS_ATTEMPTS})")
            mark_analysis_failed(post_id, attempts, "analysis_empty")
            return False

        # 7. Save to DB
        save_hook_analysis(post_id, transcript or "", analysis, keyframe_base64=keyframe_b64)
        log.info(f"[{username}] Post {post_id} analyzed: {analysis.get('hook_type')} (score: {analysis.get('hook_score')})")
        return True

    except Exception as e:
        attempts = prior_attempts + 1
        log.error(f"Error analyzing post {post_id} (attempt {attempts}/{MAX_ANALYSIS_ATTEMPTS}): {e}")
        mark_analysis_failed(post_id, attempts, "exception")
        return False
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _analyze_concurrently(posts: list, max_workers: int, worker=analyze_post) -> int:
    """Analyze ``posts`` with bounded concurrency. Returns the success count.

    Maps ``worker`` (default: ``analyze_post``) over ``posts`` using a
    ThreadPoolExecutor capped at ``max_workers`` — never unbounded. An exception
    in any single post is logged and counted as a failure; it never aborts the
    rest of the batch.
    """
    if not posts:
        return 0

    analyzed = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(worker, post): post for post in posts}
        for future in as_completed(futures):
            post = futures[future]
            try:
                if future.result():
                    analyzed += 1
            except Exception as e:
                pid = post.get("id") if isinstance(post, dict) else post
                log.error(f"Unhandled error analyzing post {pid}: {e}")
    return analyzed


def run_analysis_pass(max_count: int = 10, threshold: float = 1.5) -> int:
    """Run one analysis pass. Returns number of posts analyzed."""
    posts = get_unanalyzed_viral_posts(threshold=threshold, limit=max_count * 2)

    if not posts:
        log.info("No unanalyzed viral posts found")
        return 0

    # Enforce per-account limit: count already-analyzed posts per profile
    from scraper.db import get_conn
    import psycopg2.extras
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT profile_id, COUNT(*) as cnt FROM posts WHERE analyzed_at IS NOT NULL GROUP BY profile_id")
    analyzed_counts = {row["profile_id"]: row["cnt"] for row in cur.fetchall()}
    cur.close()
    conn.close()

    # Filter posts: skip accounts that already hit the per-account limit
    filtered = []
    for p in posts:
        pid = p["profile_id"]
        if analyzed_counts.get(pid, 0) >= MAX_PER_ACCOUNT:
            continue
        filtered.append(p)
        analyzed_counts[pid] = analyzed_counts.get(pid, 0) + 1

    filtered = filtered[:max_count]

    log.info(f"Analyzing {len(filtered)} posts with concurrency {ANALYSIS_CONCURRENCY}")
    analyzed = _analyze_concurrently(filtered, max_workers=ANALYSIS_CONCURRENCY)

    log.info(f"Analysis pass complete: {analyzed}/{len(filtered)} posts analyzed")
    return analyzed


def main():
    parser = argparse.ArgumentParser(description="Analyze hooks on viral short-form video posts")
    parser.add_argument("--max", type=int, default=10, help="Max posts to analyze (default: 10)")
    parser.add_argument("--threshold", type=float, default=1.5, help="Min viral score threshold (default: 1.5)")
    args = parser.parse_args()

    run_analysis_pass(max_count=args.max, threshold=args.threshold)


if __name__ == "__main__":
    main()
