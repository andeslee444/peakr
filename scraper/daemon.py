#!/usr/bin/env python3
"""Peakr scraper daemon — refreshes tracked profiles on schedule."""

import sys
import time
import random
import signal
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import db

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("peakr-daemon")

PID_FILE = Path("/tmp/peakr-daemon.pid")

# Rate limits per platform (seconds between scrapes)
RATE_LIMITS = {
    "tiktok": 30,
    "instagram": 60,
}

# Refresh interval: how often to re-scrape a profile (seconds)
REFRESH_INTERVAL = 4 * 3600  # 4 hours

running = True


def handle_signal(sig, frame):
    global running
    log.info("Shutdown signal received")
    running = False


def scrape_one(username: str, platform: str) -> bool:
    """Scrape a single profile based on platform."""
    if platform == "instagram":
        from instagram import scrape_and_store
        return scrape_and_store(username, headless=True)
    elif platform == "tiktok":
        try:
            from tiktok import scrape_and_store
            return scrape_and_store(username, headless=True)
        except ImportError:
            log.warning("TikTok scraper not yet implemented, skipping")
            return False
    else:
        log.warning(f"Unknown platform: {platform}")
        return False


def run_daemon():
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Write PID
    PID_FILE.write_text(str(os.getpid()))
    log.info(f"Daemon started (PID {os.getpid()})")

    try:
        while running:
            profiles = db.get_tracked_usernames()
            if not profiles:
                log.info("No tracked profiles, sleeping 60s")
                time.sleep(60)
                continue

            # Interleave platforms
            from datetime import datetime, timedelta
            cutoff = datetime.utcnow() - timedelta(seconds=REFRESH_INTERVAL)

            stale = []
            for username, platform in profiles:
                p = db.get_profile(username, platform)
                if p and p.get("last_scraped_at"):
                    try:
                        last = datetime.fromisoformat(p["last_scraped_at"])
                        if last > cutoff:
                            continue
                    except (ValueError, TypeError):
                        pass
                stale.append((username, platform))

            if not stale:
                log.info("All profiles fresh, sleeping 5min")
                time.sleep(300)
                continue

            # Shuffle to interleave platforms
            random.shuffle(stale)

            for username, platform in stale:
                if not running:
                    break

                log.info(f"Scraping {platform}/@{username}")
                try:
                    ok = scrape_one(username, platform)
                    status = "✅" if ok else "❌"
                    log.info(f"{status} {platform}/@{username}")
                except Exception as e:
                    log.error(f"Error scraping {platform}/@{username}: {e}")

                # Platform-specific rate limit
                delay = RATE_LIMITS.get(platform, 60) + random.uniform(0, 15)
                log.info(f"Rate limit: sleeping {delay:.0f}s")
                time.sleep(delay)

            # After one full cycle, sleep a bit
            time.sleep(60)

    finally:
        PID_FILE.unlink(missing_ok=True)
        log.info("Daemon stopped")


if __name__ == "__main__":
    import os
    run_daemon()
