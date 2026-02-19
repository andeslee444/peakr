#!/usr/bin/env python3
"""Peakr scraper daemon — refreshes tracked profiles on schedule."""

import os
import sys
import time
import random
import signal
import logging
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.db import get_all_profiles, pop_scrape_queue, complete_scrape_queue

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("peakr-daemon")

PID_FILE = Path("/tmp/peakr-daemon.pid")

RATE_LIMITS = {
    "tiktok": 30,
    "instagram": 60,
}

REFRESH_INTERVAL = 4 * 3600  # 4 hours

running = True


def handle_signal(sig, frame):
    global running
    log.info("Shutdown signal received")
    running = False


def scrape_one(username, platform):
    if platform == "instagram":
        from scraper.instagram import scrape_and_store
        return scrape_and_store(username, headless=True)
    elif platform == "tiktok":
        try:
            from scraper.tiktok import scrape_and_store
            return scrape_and_store(username, headless=True)
        except ImportError:
            log.warning("TikTok scraper not available, skipping")
            return False
    return False


def run_daemon():
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    PID_FILE.write_text(str(os.getpid()))
    log.info(f"Daemon started (PID {os.getpid()})")

    last_refresh = 0

    try:
        while running:
            # --- Fast path: on-demand scrape queue (checked every loop) ---
            queued = pop_scrape_queue()
            if queued:
                queue_id, username, platform = queued
                log.info(f"[QUEUE] Scraping {platform}/@{username} (queue #{queue_id})")
                try:
                    ok = scrape_one(username, platform)
                    complete_scrape_queue(queue_id, 'done' if ok else 'error')
                    log.info(f"[QUEUE] {'done' if ok else 'error'} {platform}/@{username}")
                except Exception as e:
                    complete_scrape_queue(queue_id, 'error')
                    log.error(f"[QUEUE] Error scraping {platform}/@{username}: {e}")
                continue  # Check queue again immediately

            # --- Slow path: refresh stale profiles (every 60s) ---
            if time.time() - last_refresh > 60:
                all_profiles = get_all_profiles()
                if all_profiles:
                    cutoff = datetime.utcnow() - timedelta(seconds=REFRESH_INTERVAL)

                    stale = []
                    for p in all_profiles:
                        last = p.get("last_scraped_at")
                        if last is not None:
                            if isinstance(last, str):
                                try:
                                    last = datetime.fromisoformat(last)
                                except (ValueError, TypeError):
                                    last = None
                            if last is not None and last.replace(tzinfo=None) > cutoff:
                                continue
                        stale.append((p["username"], p["platform"]))

                    if stale:
                        random.shuffle(stale)
                        for username, platform in stale:
                            if not running:
                                break
                            log.info(f"Scraping {platform}/@{username}")
                            try:
                                ok = scrape_one(username, platform)
                                log.info(f"{'done' if ok else 'error'} {platform}/@{username}")
                            except Exception as e:
                                log.error(f"Error scraping {platform}/@{username}: {e}")

                            delay = RATE_LIMITS.get(platform, 60) + random.uniform(0, 15)
                            log.info(f"Rate limit: sleeping {delay:.0f}s")
                            time.sleep(delay)
                    else:
                        log.info("All profiles fresh")

                # Hook analysis pass
                try:
                    from scraper.analyze import run_analysis_pass
                    analyzed = run_analysis_pass(max_count=5)
                    if analyzed:
                        log.info(f"Hook analysis: {analyzed} posts analyzed")
                except Exception as e:
                    log.error(f"Hook analysis error: {e}")

                last_refresh = time.time()

            time.sleep(5)  # Short sleep for responsive queue checking
    finally:
        PID_FILE.unlink(missing_ok=True)
        log.info("Daemon stopped")


if __name__ == "__main__":
    run_daemon()
