#!/usr/bin/env python3
"""One-time backfill: upload existing CDN thumbnails to S3.

Run once after deployment:
    python3 -m scraper.backfill_s3
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.db import get_conn
from scraper.s3 import upload_thumbnail

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill-s3")


def backfill():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT p.id, p.platform_id, p.thumbnail_url, pr.username, pr.platform
        FROM posts p
        JOIN profiles pr ON p.profile_id = pr.id
        WHERE p.s3_thumbnail_url IS NULL AND p.thumbnail_url IS NOT NULL AND p.thumbnail_url != ''
        ORDER BY p.id DESC
    """)
    rows = cur.fetchall()
    log.info(f"Found {len(rows)} posts to backfill")

    success = 0
    failed = 0

    for post_id, platform_id, thumbnail_url, username, platform in rows:
        s3_url = upload_thumbnail(thumbnail_url, platform, username, platform_id)
        if s3_url:
            cur.execute("UPDATE posts SET s3_thumbnail_url = %s WHERE id = %s", (s3_url, post_id))
            conn.commit()
            success += 1
        else:
            failed += 1

        if (success + failed) % 50 == 0:
            log.info(f"Progress: {success} uploaded, {failed} failed, {len(rows) - success - failed} remaining")

    cur.close()
    conn.close()
    log.info(f"Backfill complete: {success} uploaded, {failed} failed (expired CDN URLs)")


if __name__ == "__main__":
    backfill()
