#!/usr/bin/env python3
"""Peakr scraper daemon — refreshes tracked profiles, scrapes seed creators,
runs hook analysis, computes daily rankings, and cleans caches.

Schedule overview (all times EST):
  - Every 5s:  Check on-demand scrape queue
  - Every 60s: Refresh stale user-tracked profiles (>4 hours), run analysis pass
  - Daily 12:00 AM: Scrape top 50 seed creators by avg viral score
  - Every 3 days 1:00 AM: Full scrape of ALL seed creators (~190)
  - Daily 4:00 AM: Overnight analysis batch (up to 50 posts, 30s intervals)
  - Daily 6:00 AM: Compute daily top hooks, update profile niches, clean caches
  - Weekly Sunday 2:00 AM: Hashtag discovery pipeline
"""

import os
import sys
import time
import random
import signal
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.db import (
    get_all_profiles, pop_scrape_queue, complete_scrape_queue,
    get_active_seed_creators, get_top_seed_creators, add_profile,
    compute_daily_top_hooks, update_profile_niches, clean_expired_video_cache,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("peakr-daemon")

PID_FILE = Path("/tmp/peakr-daemon.pid")

RATE_LIMITS = {
    "tiktok": 30,
    "instagram": 60,
}

REFRESH_INTERVAL = 4 * 3600  # 4 hours

# US Eastern (handles EST/EDT automatically)
EST = ZoneInfo("America/New_York")

running = True


def handle_signal(sig, frame):
    global running
    log.info("Shutdown signal received")
    running = False


def now_est() -> datetime:
    return datetime.now(EST)


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


def scrape_seed_list(creators: list, tag: str = "SEED"):
    """Scrape a list of seed creators, ensuring each has a profile row."""
    for i, c in enumerate(creators):
        if not running:
            break
        username = c["username"]
        platform = c["platform"]

        # Ensure profile exists
        add_profile(username, platform)

        log.info(f"[{tag}] Scraping {i+1}/{len(creators)}: {platform}/@{username}")
        try:
            ok = scrape_one(username, platform)
            log.info(f"[{tag}] {'done' if ok else 'error'} {platform}/@{username}")
        except Exception as e:
            log.error(f"[{tag}] Error scraping {platform}/@{username}: {e}")

        delay = RATE_LIMITS.get(platform, 60) + random.uniform(0, 15)
        time.sleep(delay)


def run_overnight_analysis(max_count: int = 50, delay: float = 30.0):
    """Run a larger analysis batch with longer delays (for overnight use)."""
    try:
        from scraper.analyze import run_analysis_pass
        log.info(f"[OVERNIGHT] Starting analysis batch (up to {max_count} posts)...")
        analyzed = run_analysis_pass(max_count=max_count)
        log.info(f"[OVERNIGHT] Analyzed {analyzed} posts")
    except Exception as e:
        log.error(f"[OVERNIGHT] Analysis error: {e}")


def run_daily_maintenance():
    """Compute daily top hooks, update niches, clean caches."""
    log.info("[MAINT] Computing daily top hooks...")
    try:
        compute_daily_top_hooks(limit=50)
        log.info("[MAINT] Daily top hooks computed")
    except Exception as e:
        log.error(f"[MAINT] Top hooks error: {e}")

    log.info("[MAINT] Updating profile niches...")
    try:
        update_profile_niches()
        log.info("[MAINT] Profile niches updated")
    except Exception as e:
        log.error(f"[MAINT] Niche update error: {e}")

    log.info("[MAINT] Cleaning expired video URL cache...")
    try:
        clean_expired_video_cache()
        log.info("[MAINT] Cache cleaned")
    except Exception as e:
        log.error(f"[MAINT] Cache cleanup error: {e}")


def run_hashtag_discovery():
    """Run the weekly hashtag discovery pipeline."""
    try:
        from scraper.discover import run_discovery
        log.info("[DISCOVER] Starting weekly hashtag discovery...")
        run_discovery()
        log.info("[DISCOVER] Discovery complete")
    except ImportError:
        log.warning("[DISCOVER] scraper.discover not available, skipping")
    except Exception as e:
        log.error(f"[DISCOVER] Discovery error: {e}")


def run_daemon():
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    PID_FILE.write_text(str(os.getpid()))
    log.info(f"Daemon started (PID {os.getpid()})")

    last_refresh = 0

    # Track which scheduled jobs have run today
    last_daily_top50 = None       # Daily at midnight EST
    last_full_seed_scrape = None  # Every 3 days at 1 AM EST
    last_overnight_analysis = None  # Daily at 4 AM EST
    last_daily_maintenance = None  # Daily at 6 AM EST
    last_weekly_discovery = None  # Weekly Sunday at 2 AM EST

    try:
        while running:
            est_now = now_est()
            today = est_now.date()
            hour = est_now.hour
            weekday = est_now.weekday()  # 0=Monday, 6=Sunday

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

            # --- Scheduled: Daily top-50 seed scrape at midnight EST ---
            if hour == 0 and last_daily_top50 != today:
                log.info("[SCHEDULE] Daily top-50 seed creator scrape")
                last_daily_top50 = today
                try:
                    top_seeds = get_top_seed_creators(limit=50)
                    if top_seeds:
                        scrape_seed_list(top_seeds, tag="DAILY-TOP50")
                    else:
                        # If no ranked seeds yet, scrape a random 50
                        all_seeds = get_active_seed_creators()
                        random.shuffle(all_seeds)
                        scrape_seed_list(all_seeds[:50], tag="DAILY-RANDOM50")
                except Exception as e:
                    log.error(f"[SCHEDULE] Daily top-50 error: {e}")

            # --- Scheduled: Full seed scrape every 3 days at 1 AM EST ---
            if hour == 1 and (last_full_seed_scrape is None or (today - last_full_seed_scrape).days >= 3):
                log.info("[SCHEDULE] Full seed creator scrape (every 3 days)")
                last_full_seed_scrape = today
                try:
                    all_seeds = get_active_seed_creators()
                    random.shuffle(all_seeds)
                    scrape_seed_list(all_seeds, tag="FULL-SEED")
                except Exception as e:
                    log.error(f"[SCHEDULE] Full seed scrape error: {e}")

            # --- Scheduled: Weekly hashtag discovery on Sunday at 2 AM EST ---
            if weekday == 6 and hour == 2 and last_weekly_discovery != today:
                last_weekly_discovery = today
                run_hashtag_discovery()

            # --- Scheduled: Overnight analysis batch at 4 AM EST ---
            if hour == 4 and last_overnight_analysis != today:
                log.info("[SCHEDULE] Overnight analysis batch")
                last_overnight_analysis = today
                run_overnight_analysis(max_count=50)

            # --- Scheduled: Daily maintenance at 6 AM EST ---
            if hour == 6 and last_daily_maintenance != today:
                last_daily_maintenance = today
                run_daily_maintenance()

            # --- Slow path: refresh stale user-tracked profiles (every 60s) ---
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

                # Hook analysis pass (regular, small batch)
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
