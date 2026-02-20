"""Hook analysis orchestrator: download → transcribe → analyze → store.

Usage:
    python3 -m scraper.analyze [--max N] [--threshold N]
"""

import os
import sys
import time
import shutil
import base64
import logging
import tempfile
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.db import get_unanalyzed_viral_posts, save_hook_analysis
from scraper.transcribe import download_video, extract_audio, extract_keyframes, transcribe_audio
from scraper.hooks import analyze_hook

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("peakr-analyze")

# Max videos to analyze per account (auto-analysis only)
MAX_PER_ACCOUNT = 8


def analyze_post(post: dict) -> bool:
    """Analyze a single post's hook. Returns True on success."""
    post_id = post["id"]
    post_url = post.get("post_url", "")
    username = post.get("username", "unknown")
    duration = post.get("duration_seconds") or 0

    if not post_url:
        log.warning(f"Post {post_id} has no URL, skipping")
        return False

    # Cost control: skip very long videos
    if duration > 300:
        log.info(f"Post {post_id} is {duration}s (>5min), skipping")
        return False

    tmpdir = tempfile.mkdtemp(prefix="peakr-analyze-")
    try:
        video_path = os.path.join(tmpdir, "video.mp4")
        audio_path = os.path.join(tmpdir, "audio.wav")
        frames_dir = os.path.join(tmpdir, "frames")
        os.makedirs(frames_dir, exist_ok=True)

        # 1. Download video
        log.info(f"[{username}] Downloading post {post_id}...")
        if not download_video(post_url, video_path):
            log.error(f"Failed to download post {post_id}")
            return False

        # 2. Extract audio
        log.info(f"[{username}] Extracting audio...")
        if not extract_audio(video_path, audio_path):
            log.warning(f"Audio extraction failed for post {post_id}, continuing without transcript")
            transcript = None
        else:
            # 3. Transcribe
            log.info(f"[{username}] Transcribing...")
            transcript = transcribe_audio(audio_path)

        # 4. Extract keyframes
        log.info(f"[{username}] Extracting keyframes...")
        keyframes = extract_keyframes(video_path, frames_dir)
        if not keyframes:
            log.warning(f"No keyframes extracted for post {post_id}")

        # 5. Claude analysis
        log.info(f"[{username}] Analyzing hook with Claude...")
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
            log.error(f"Hook analysis failed for post {post_id}")
            return False

        # 6. Encode first keyframe as base64
        keyframe_b64 = None
        if keyframes:
            try:
                with open(keyframes[0], "rb") as f:
                    keyframe_b64 = base64.standard_b64encode(f.read()).decode("utf-8")
            except Exception as e:
                log.warning(f"Could not encode keyframe for post {post_id}: {e}")

        # 7. Save to DB
        save_hook_analysis(post_id, transcript or "", analysis, keyframe_base64=keyframe_b64)
        log.info(f"[{username}] Post {post_id} analyzed: {analysis.get('hook_type')} (score: {analysis.get('hook_score')})")
        return True

    except Exception as e:
        log.error(f"Error analyzing post {post_id}: {e}")
        return False
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


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

    analyzed = 0
    for i, post in enumerate(filtered):
        log.info(f"--- Analyzing {i+1}/{len(filtered)}: post {post['id']} by @{post.get('username', '?')} (viral: {post.get('viral_score', 0):.1f}x) ---")
        if analyze_post(post):
            analyzed += 1

        # Rate limit between posts
        if i < len(filtered) - 1:
            time.sleep(5)

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
