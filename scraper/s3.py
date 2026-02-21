"""S3 thumbnail upload module for Peakr."""

import os
import logging
from io import BytesIO
from typing import Optional

import boto3
import httpx

log = logging.getLogger("peakr-s3")

S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "peakr-thumbnails")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

_s3_client = None


def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name=AWS_REGION)
    return _s3_client


def upload_thumbnail(thumbnail_url: str, platform: str, username: str,
                     platform_id: str) -> Optional[str]:
    """Download a thumbnail from CDN and upload to S3.

    Returns the public S3 URL on success, None on failure.
    """
    if not thumbnail_url:
        return None

    key = f"thumbnails/{platform}/{username}/{platform_id}.jpg"
    s3_url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"

    try:
        resp = httpx.get(thumbnail_url, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        image_data = resp.content

        if len(image_data) < 100:
            log.warning(f"Thumbnail too small ({len(image_data)} bytes), skipping: {platform_id}")
            return None

        s3 = _get_s3()
        s3.upload_fileobj(
            BytesIO(image_data),
            S3_BUCKET,
            key,
            ExtraArgs={"ContentType": "image/jpeg"},
        )
        return s3_url

    except httpx.HTTPStatusError as e:
        log.warning(f"CDN returned {e.response.status_code} for {platform_id}: {thumbnail_url[:80]}")
        return None
    except Exception as e:
        log.warning(f"S3 upload failed for {platform_id}: {e}")
        return None


def upload_thumbnails_for_posts(profile_id: int, username: str, platform: str,
                                posts: list):
    """Upload thumbnails for a list of posts to S3, update DB with s3_thumbnail_url.

    Expects posts to be dicts with at least 'platform_id' and 'thumbnail_url' keys.
    """
    from scraper.db import get_conn

    uploaded = 0
    conn = get_conn()
    cur = conn.cursor()

    try:
        for p in posts:
            thumb = p.get("thumbnail_url", "")
            pid = p.get("platform_id", "")
            if not thumb or not pid:
                continue

            s3_url = upload_thumbnail(thumb, platform, username, pid)
            if s3_url:
                cur.execute(
                    "UPDATE posts SET s3_thumbnail_url = %s WHERE profile_id = %s AND platform_id = %s",
                    (s3_url, profile_id, pid),
                )
                uploaded += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        log.error(f"Error batch-uploading thumbnails for {username}: {e}")
    finally:
        cur.close()
        conn.close()

    if uploaded:
        log.info(f"Uploaded {uploaded}/{len(posts)} thumbnails to S3 for @{username}")
