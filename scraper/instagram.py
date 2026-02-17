#!/usr/bin/env python3
"""Instagram public profile scraper using Camoufox + WARP proxy."""

import json
import re
import sys
import time
import random
import logging
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ig-scraper")

PROXY = {"server": "socks5://127.0.0.1:1080"}
COOKIE_DIR = Path(__file__).parent.parent / "data" / "cookies"
COOKIE_DIR.mkdir(parents=True, exist_ok=True)


def scrape_profile(username: str, headless: bool = True) -> dict:
    """Scrape an Instagram public profile. Returns dict with profile + posts or None on failure."""
    from camoufox.sync_api import Camoufox

    username = username.lstrip("@")
    url = f"https://www.instagram.com/{username}/"
    log.info(f"Scraping Instagram profile: {username}")

    captured_data = {"profile": None, "media_nodes": []}

    def handle_response(response):
        """Intercept GraphQL API responses."""
        try:
            resp_url = response.url
            if "/graphql/query" in resp_url or "/api/v1/users/" in resp_url:
                ct = response.headers.get("content-type", "")
                if "json" in ct:
                    body = response.json()
                    _extract_from_graphql(body, captured_data)
        except Exception:
            pass

    start = time.time()

    try:
        with Camoufox(headless=headless, humanize=True, proxy=PROXY, geoip=True) as browser:
            context = browser.new_context()

            # Load cookies if available
            cookie_file = COOKIE_DIR / "instagram.json"
            if cookie_file.exists():
                try:
                    cookies = json.loads(cookie_file.read_text())
                    context.add_cookies(cookies)
                    log.info("Loaded saved cookies")
                except Exception:
                    pass

            page = context.new_page()
            page.on("response", handle_response)

            # Navigate
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(random.uniform(3, 5))

            # Scroll to trigger more data loading
            page.mouse.wheel(0, 800)
            time.sleep(random.uniform(2, 4))
            page.mouse.wheel(0, 600)
            time.sleep(random.uniform(1, 3))

            # If GraphQL interception didn't work, try page source fallback
            if not captured_data["profile"]:
                log.info("GraphQL interception didn't capture profile, trying page source fallback")
                _fallback_page_source(page, captured_data, username)

            # If still no data, try meta tags as last resort
            if not captured_data["profile"]:
                log.info("Trying meta tag extraction")
                _fallback_meta_tags(page, captured_data, username)

            # Save cookies for session persistence
            try:
                cookies = context.cookies()
                cookie_file.write_text(json.dumps(cookies))
            except Exception:
                pass

    except Exception as e:
        log.error(f"Browser error: {e}")
        return None

    elapsed_ms = int((time.time() - start) * 1000)

    if not captured_data["profile"]:
        log.warning(f"Could not extract profile data for {username}")
        return None

    profile = captured_data["profile"]
    posts = captured_data.get("media_nodes", [])

    # Calculate viral scores
    if posts:
        avg_engagement = sum(p.get("likes", 0) + p.get("comments", 0) for p in posts) / len(posts)
        if avg_engagement > 0:
            for p in posts:
                eng = p.get("likes", 0) + p.get("comments", 0)
                p["viral_score"] = round(eng / avg_engagement, 2)
        else:
            for p in posts:
                p["viral_score"] = 1.0

        avg_views = sum(p.get("views", 0) for p in posts) / len(posts)
        profile["avg_views"] = avg_views
    else:
        profile["avg_views"] = 0

    profile["post_count"] = profile.get("post_count", len(posts))

    log.info(f"Scraped {username}: {profile.get('followers', 0)} followers, {len(posts)} posts ({elapsed_ms}ms)")

    return {
        "profile": profile,
        "posts": posts,
        "elapsed_ms": elapsed_ms,
    }


def _extract_from_graphql(body: dict, captured: dict):
    """Extract profile and media data from GraphQL response."""
    # Try standard user query response
    user = None

    # Path: data.user
    if "data" in body and "user" in (body.get("data") or {}):
        user = body["data"]["user"]
    # Path: graphql.user
    elif "graphql" in body and "user" in (body.get("graphql") or {}):
        user = body["graphql"]["user"]
    # Path: data.xdt_api__v1__feed__user_timeline_graphql_connection (newer API)
    elif "data" in body:
        for key in (body.get("data") or {}):
            val = body["data"][key]
            if isinstance(val, dict) and "edges" in val:
                _extract_media_edges(val.get("edges", []), captured)
            if isinstance(val, dict) and "user" in val:
                user = val["user"]

    if user and not captured["profile"]:
        captured["profile"] = {
            "display_name": user.get("full_name", ""),
            "bio": user.get("biography", ""),
            "avatar_url": user.get("profile_pic_url_hd") or user.get("profile_pic_url", ""),
            "followers": _edge_count(user, "edge_followed_by") or user.get("follower_count", 0),
            "following": _edge_count(user, "edge_follow") or user.get("following_count", 0),
            "total_likes": 0,
            "post_count": _edge_count(user, "edge_owner_to_timeline_media") or user.get("media_count", 0),
        }

        # Extract media from user object
        media = user.get("edge_owner_to_timeline_media") or user.get("edge_felix_video_timeline") or {}
        if "edges" in media:
            _extract_media_edges(media["edges"], captured)


def _extract_media_edges(edges: list, captured: dict):
    """Extract post data from GraphQL media edges."""
    for edge in edges:
        node = edge.get("node", edge) if isinstance(edge, dict) else {}
        if not node.get("id") and not node.get("shortcode"):
            continue

        shortcode = node.get("shortcode", node.get("code", str(node.get("id", ""))))
        is_video = node.get("is_video", False)

        post = {
            "platform_id": shortcode,
            "post_url": f"https://www.instagram.com/p/{shortcode}/",
            "thumbnail_url": node.get("display_url") or node.get("thumbnail_src", ""),
            "description": _get_caption(node),
            "views": node.get("video_view_count", 0) if is_video else 0,
            "likes": _edge_count(node, "edge_media_preview_like") or node.get("like_count", 0),
            "comments": _edge_count(node, "edge_media_to_comment") or node.get("comment_count", 0),
            "shares": 0,
            "is_video": 1 if is_video else 0,
            "duration_seconds": None,
            "posted_at": _ts_to_iso(node.get("taken_at_timestamp") or node.get("taken_at")),
        }

        # Avoid duplicates
        existing_ids = {p["platform_id"] for p in captured["media_nodes"]}
        if shortcode not in existing_ids:
            captured["media_nodes"].append(post)


def _fallback_page_source(page, captured: dict, username: str):
    """Parse embedded JSON from page source."""
    try:
        html = page.content()

        # Try window._sharedData
        m = re.search(r'window\._sharedData\s*=\s*({.+?});</script>', html)
        if m:
            data = json.loads(m.group(1))
            user = (data.get("entry_data", {})
                    .get("ProfilePage", [{}])[0]
                    .get("graphql", {})
                    .get("user", {}))
            if user:
                _extract_from_graphql({"graphql": {"user": user}}, captured)
                return

        # Try __additionalData
        m = re.search(r'window\.__additionalDataLoaded\s*\([^,]+,\s*({.+?})\)\s*;', html)
        if m:
            data = json.loads(m.group(1))
            if "graphql" in data:
                _extract_from_graphql(data, captured)
                return

        # Try JSON embedded in script type="application/json"
        for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>(.+?)</script>', html):
            try:
                data = json.loads(m.group(1))
                _try_deep_extract(data, captured, username)
                if captured["profile"]:
                    return
            except json.JSONDecodeError:
                continue

    except Exception as e:
        log.warning(f"Page source fallback failed: {e}")


def _try_deep_extract(data, captured: dict, username: str, depth: int = 0):
    """Recursively search JSON for user data."""
    if depth > 8 or captured["profile"]:
        return
    if isinstance(data, dict):
        # Check if this looks like a user object
        if data.get("username") == username and ("edge_followed_by" in data or "follower_count" in data):
            _extract_from_graphql({"graphql": {"user": data}}, captured)
            return
        if "user" in data and isinstance(data["user"], dict):
            u = data["user"]
            if u.get("username") == username:
                _extract_from_graphql({"graphql": {"user": u}}, captured)
                return
        for v in data.values():
            _try_deep_extract(v, captured, username, depth + 1)
    elif isinstance(data, list):
        for item in data[:20]:
            _try_deep_extract(item, captured, username, depth + 1)


def _fallback_meta_tags(page, captured: dict, username: str):
    """Last resort: extract basic info from meta tags."""
    try:
        desc = page.query_selector('meta[name="description"]')
        if not desc:
            desc = page.query_selector('meta[property="og:description"]')
        if desc:
            content = desc.get_attribute("content") or ""
            # Pattern: "123K Followers, 456 Following, 789 Posts - See Instagram photos..."
            followers = _parse_meta_count(content, r'([\d,.]+[KMB]?)\s*Followers')
            following = _parse_meta_count(content, r'([\d,.]+[KMB]?)\s*Following')
            posts = _parse_meta_count(content, r'([\d,.]+[KMB]?)\s*Posts')

            if followers is not None:
                og_image = page.query_selector('meta[property="og:image"]')
                avatar = og_image.get_attribute("content") if og_image else ""

                title_el = page.query_selector('meta[property="og:title"]')
                display_name = ""
                if title_el:
                    t = title_el.get_attribute("content") or ""
                    # "Display Name (@username)"
                    m = re.match(r'^(.+?)\s*\(', t)
                    if m:
                        display_name = m.group(1).strip()

                captured["profile"] = {
                    "display_name": display_name,
                    "bio": "",
                    "avatar_url": avatar,
                    "followers": followers,
                    "following": following or 0,
                    "total_likes": 0,
                    "post_count": posts or 0,
                }
    except Exception as e:
        log.warning(f"Meta tag fallback failed: {e}")


def _edge_count(obj: dict, key: str) -> int:
    edge = obj.get(key, {})
    if isinstance(edge, dict):
        return edge.get("count", 0)
    return 0


def _get_caption(node: dict) -> str:
    cap = node.get("edge_media_to_caption", {})
    if isinstance(cap, dict):
        edges = cap.get("edges", [])
        if edges:
            return edges[0].get("node", {}).get("text", "")
    return node.get("caption", {}).get("text", "") if isinstance(node.get("caption"), dict) else ""


def _ts_to_iso(ts) -> str:
    if ts is None:
        return None
    try:
        return datetime.utcfromtimestamp(int(ts)).isoformat()
    except (ValueError, TypeError, OSError):
        return None


def _parse_meta_count(text: str, pattern: str) -> int:
    m = re.search(pattern, text, re.IGNORECASE)
    if not m:
        return None
    s = m.group(1).replace(",", "")
    multiplier = 1
    if s.endswith("K"):
        s, multiplier = s[:-1], 1000
    elif s.endswith("M"):
        s, multiplier = s[:-1], 1_000_000
    elif s.endswith("B"):
        s, multiplier = s[:-1], 1_000_000_000
    try:
        return int(float(s) * multiplier)
    except ValueError:
        return None


def scrape_and_store(username: str, headless: bool = True) -> bool:
    """Scrape a profile and store in the database."""
    import db

    result = scrape_profile(username, headless=headless)
    if not result:
        # Log failure
        profile = db.get_profile(username, "instagram")
        if profile:
            db.log_scrape(profile["id"], "error", error_message="No data extracted")
        return False

    profile_data = result["profile"]
    posts = result["posts"]

    pid = db.upsert_profile(username, "instagram", profile_data)
    db.upsert_posts(pid, posts)
    db.log_scrape(pid, "success", posts_found=len(posts), duration_ms=result["elapsed_ms"])
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 instagram.py <username>")
        sys.exit(1)

    target = sys.argv[1].lstrip("@")
    headless = "--visible" not in sys.argv

    # Add scraper dir to path for db import
    sys.path.insert(0, str(Path(__file__).parent))

    result = scrape_profile(target, headless=headless)
    if result:
        print(f"\n✅ Profile: {target}")
        p = result["profile"]
        print(f"   Name: {p.get('display_name', 'N/A')}")
        print(f"   Followers: {p.get('followers', 0):,}")
        print(f"   Following: {p.get('following', 0):,}")
        print(f"   Posts: {p.get('post_count', 0):,}")
        print(f"   Avg Views: {p.get('avg_views', 0):,.0f}")
        print(f"\n   Top posts ({len(result['posts'])}):")
        for post in sorted(result["posts"], key=lambda x: x.get("viral_score", 0), reverse=True)[:5]:
            vs = post.get("viral_score", 0)
            likes = post.get("likes", 0)
            comments = post.get("comments", 0)
            vid = "🎥" if post.get("is_video") else "📷"
            print(f"   {vid} {post['platform_id'][:12]}  {vs:.1f}x viral  ❤️ {likes:,}  💬 {comments:,}")

        # Store in DB
        import db
        pid = db.upsert_profile(target, "instagram", result["profile"])
        db.upsert_posts(pid, result["posts"])
        db.log_scrape(pid, "success", posts_found=len(result["posts"]), duration_ms=result["elapsed_ms"])
        print(f"\n   💾 Stored in database (profile_id={pid})")
    else:
        print(f"\n❌ Failed to scrape {target}")
        sys.exit(1)
