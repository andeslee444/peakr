#!/usr/bin/env python3
"""Bulk-import seed creators from data/seed_creators.json into the database.

Usage:
    python3 -m scraper.import_seeds
"""

import json
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.db import upsert_seed_creator, add_profile

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("peakr-import-seeds")

SEED_FILE = Path(__file__).parent.parent / "data" / "seed_creators.json"


def main():
    if not SEED_FILE.exists():
        log.error(f"Seed file not found: {SEED_FILE}")
        sys.exit(1)

    with open(SEED_FILE) as f:
        creators = json.load(f)

    log.info(f"Importing {len(creators)} seed creators...")

    imported = 0
    for c in creators:
        username = c["username"]
        platform = c["platform"]
        niche = c["niche"]
        follower_count = c.get("follower_count")

        # Upsert into seed_creators table
        upsert_seed_creator(username, platform, niche, tier="seed", follower_count=follower_count)

        # Also ensure a profiles row exists so the daemon can scrape them
        add_profile(username, platform)

        imported += 1

    log.info(f"Done: {imported} seed creators imported")


if __name__ == "__main__":
    main()
