#!/usr/bin/env python3
"""Instagram profile scraper using Camoufox + WARP proxy.

Requires IG session cookies. First run with --login to authenticate,
or place session cookies in data/cookies/instagram.json.
"""

import json
import os
import re
import sys
import time
import random
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ig-scraper")

PROXY = {"server": "socks5://127.0.0.1:1080"}
COOKIE_DIR = Path(__file__).parent.parent / "data" / "cookies"
COOKIE_DIR.mkdir(parents=True, exist_ok=True)
COOKIE_FILE = COOKIE_DIR / "instagram.json"

IG_APP_ID = "936619743392459"


def _get_browser_and_context(headless=True):
    from camoufox.sync_api import Camoufox
    browser = Camoufox(headless=headless, humanize=True, proxy=PROXY, geoip=True)
    cm = browser.__enter__()
    ctx = cm.new_context()
    # Load saved cookies
    if COOKIE_FILE.exists():
        try:
            cookies = json.loads(COOKIE_FILE.read_text())
            if cookies:
                ctx.add_cookies(cookies)
                log.info("Loaded saved session cookies")
        except Exception as e:
            log.warning(f"Failed to load cookies: {e}")
    return cm, ctx


def _save_cookies(ctx):
    try:
        cookies = ctx.cookies()
        COOKIE_FILE.write_text(json.dumps(cookies, indent=2))
        log.info("Saved session cookies")
    except Exception as e:
        log.warning(f"Failed to save cookies: {e}")


def login_interactive():
    """Interactive login — opens visible browser for user to log in manually."""
    from camoufox.sync_api import Camoufox

    print("\n🔐 Opening Instagram login page...")
    print("   Log in manually, then press Enter here when done.\n")

    with Camoufox(headless=False, humanize=True, proxy=PROXY, geoip=True) as browser:
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded", timeout=30000)

        input("Press Enter after you've logged in successfully...")

        _save_cookies(ctx)
        # Verify session
        page2 = ctx.new_page()
        resp_data = page2.evaluate("""async () => {
            const r = await fetch('https://i.instagram.com/api/v1/users/web_profile_info/?username=instagram', {
                headers: {'X-IG-App-ID': '936619743392459', 'X-Requested-With': 'XMLHttpRequest'},
                credentials: 'include'
            });
            return {status: r.status, ok: r.ok};
        }""")
        if resp_data.get("ok"):
            print("✅ Login successful! Session cookies saved.")
        else:
            print(f"⚠️  Login may have failed (API status: {resp_data.get('status')})")
            print("   Try again or check your credentials.")


def _has_valid_session(ctx) -> bool:
    """Check if current cookies give us a valid session."""
    page = ctx.new_page()
    try:
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=15000)
        time.sleep(2)
        url = page.url
        page.close()
        return "login" not in url
    except Exception:
        try:
            page.close()
        except:
            pass
        return False


def scrape_profile(username: str, headless: bool = True) -> Optional[Dict]:
    """Scrape an Instagram public profile. Returns dict with profile + posts or None."""
    from camoufox.sync_api import Camoufox

    username = username.lstrip("@")
    log.info(f"Scraping Instagram profile: {username}")
    start = time.time()

    try:
        with Camoufox(headless=headless, humanize=True, proxy=PROXY, geoip=True) as browser:
            ctx = browser.new_context()

            # Load cookies
            if COOKIE_FILE.exists():
                try:
                    cookies = json.loads(COOKIE_FILE.read_text())
                    if cookies:
                        ctx.add_cookies(cookies)
                except Exception:
                    pass

            page = ctx.new_page()

            # Check session validity
            if not _has_valid_session(ctx):
                log.error("No valid Instagram session. Run with --login first.")
                return None

            # Use the web_profile_info API
            profile_data = _fetch_profile_api(ctx, username)
            if not profile_data:
                # Fallback: navigate to profile page and intercept
                profile_data = _scrape_profile_page(ctx, username)

            # Save cookies
            _save_cookies(ctx)

    except Exception as e:
        log.error(f"Browser error: {e}")
        return None

    elapsed_ms = int((time.time() - start) * 1000)

    if not profile_data:
        log.warning(f"Could not extract profile data for {username}")
        return None

    profile = profile_data["profile"]
    posts = profile_data.get("posts", [])

    # Calculate viral scores
    if posts:
        avg_eng = sum(p.get("likes", 0) + p.get("comments", 0) for p in posts) / len(posts)
        for p in posts:
            eng = p.get("likes", 0) + p.get("comments", 0)
            p["viral_score"] = round(eng / avg_eng, 2) if avg_eng > 0 else 1.0
        avg_views = sum(p.get("views", 0) for p in posts) / len(posts)
        profile["avg_views"] = avg_views
    else:
        profile["avg_views"] = 0

    log.info(f"Scraped {username}: {profile.get('followers', 0)} followers, {len(posts)} posts ({elapsed_ms}ms)")

    return {"profile": profile, "posts": posts, "elapsed_ms": elapsed_ms}


def _fetch_profile_api(ctx, username: str) -> Optional[Dict]:
    """Fetch profile data via Instagram's internal API."""
    page = ctx.new_page()
    try:
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=15000)
        time.sleep(1)

        result = page.evaluate("""async (username) => {
            try {
                const r = await fetch(
                    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
                    {
                        headers: {
                            'X-IG-App-ID': '936619743392459',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        credentials: 'include'
                    }
                );
                if (!r.ok) return {error: r.status};
                return await r.json();
            } catch(e) {
                return {error: e.message};
            }
        }""", username)

        page.close()

        if not result or "error" in result:
            log.warning(f"API returned error: {result}")
            return None

        user = (result.get("data", {}).get("user") or
                result.get("graphql", {}).get("user") or
                result.get("user"))

        if not user:
            log.warning("No user in API response")
            return None

        return _parse_user_object(user)

    except Exception as e:
        log.warning(f"API fetch failed: {e}")
        try:
            page.close()
        except:
            pass
        return None


def _scrape_profile_page(ctx, username: str) -> Optional[Dict]:
    """Fallback: Navigate to profile page and extract data."""
    captured = {"profile": None, "posts": []}

    def on_response(resp):
        try:
            url = resp.url
            if "/graphql/query" in url or "web_profile_info" in url:
                ct = resp.headers.get("content-type", "")
                if "json" in ct:
                    body = resp.json()
                    user = None
                    if "data" in body and "user" in (body.get("data") or {}):
                        user = body["data"]["user"]
                    elif "graphql" in body:
                        user = body.get("graphql", {}).get("user")
                    if user and not captured["profile"]:
                        result = _parse_user_object(user)
                        captured["profile"] = result["profile"]
                        captured["posts"] = result.get("posts", [])
        except Exception:
            pass

    page = ctx.new_page()
    page.on("response", on_response)

    try:
        page.goto(f"https://www.instagram.com/{username}/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(random.uniform(3, 5))
        page.mouse.wheel(0, 800)
        time.sleep(random.uniform(2, 4))

        if captured["profile"]:
            page.close()
            return {"profile": captured["profile"], "posts": captured["posts"]}

        # Try extracting from page source
        html = page.content()
        _try_page_source(html, username, captured)

        # Try meta tags
        if not captured["profile"]:
            _try_meta_tags(page, username, captured)

        page.close()

        if captured["profile"]:
            return {"profile": captured["profile"], "posts": captured["posts"]}

    except Exception as e:
        log.warning(f"Profile page scrape failed: {e}")
        try:
            page.close()
        except:
            pass

    return None


def _parse_user_object(user: dict) -> Dict:
    """Parse Instagram user object into our schema."""
    profile = {
        "display_name": user.get("full_name", ""),
        "bio": user.get("biography", ""),
        "avatar_url": user.get("profile_pic_url_hd") or user.get("profile_pic_url", ""),
        "followers": _edge_count(user, "edge_followed_by") or user.get("follower_count", 0),
        "following": _edge_count(user, "edge_follow") or user.get("following_count", 0),
        "total_likes": 0,
        "post_count": _edge_count(user, "edge_owner_to_timeline_media") or user.get("media_count", 0),
    }

    posts = []
    media = user.get("edge_owner_to_timeline_media") or user.get("edge_felix_video_timeline") or {}
    edges = media.get("edges", [])

    for edge in edges:
        node = edge.get("node", edge)
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
            "likes": _edge_count(node, "edge_media_preview_like") or _edge_count(node, "edge_liked_by") or node.get("like_count", 0),
            "comments": _edge_count(node, "edge_media_to_comment") or node.get("comment_count", 0),
            "shares": 0,
            "is_video": 1 if is_video else 0,
            "duration_seconds": None,
            "posted_at": _ts_to_iso(node.get("taken_at_timestamp") or node.get("taken_at")),
        }
        posts.append(post)

    return {"profile": profile, "posts": posts}


def _try_page_source(html: str, username: str, captured: dict):
    """Try to extract data from embedded JSON in page source."""
    patterns = [
        r'window\._sharedData\s*=\s*({.+?});</script>',
        r'window\.__additionalDataLoaded\s*\([^,]+,\s*({.+?})\)\s*;',
    ]
    for pat in patterns:
        m = re.search(pat, html)
        if m:
            try:
                data = json.loads(m.group(1))
                user = _find_user_in_data(data, username)
                if user:
                    result = _parse_user_object(user)
                    captured["profile"] = result["profile"]
                    captured["posts"] = result.get("posts", [])
                    return
            except json.JSONDecodeError:
                continue

    # Try script type="application/json"
    for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>(.+?)</script>', html):
        try:
            data = json.loads(m.group(1))
            user = _find_user_in_data(data, username)
            if user:
                result = _parse_user_object(user)
                captured["profile"] = result["profile"]
                captured["posts"] = result.get("posts", [])
                return
        except (json.JSONDecodeError, Exception):
            continue


def _find_user_in_data(data, username: str, depth: int = 0):
    """Recursively find user object in nested data."""
    if depth > 8:
        return None
    if isinstance(data, dict):
        if data.get("username") == username and ("edge_followed_by" in data or "follower_count" in data):
            return data
        if "user" in data and isinstance(data["user"], dict):
            u = data["user"]
            if u.get("username") == username:
                return u
        for v in data.values():
            r = _find_user_in_data(v, username, depth + 1)
            if r:
                return r
    elif isinstance(data, list):
        for item in data[:20]:
            r = _find_user_in_data(item, username, depth + 1)
            if r:
                return r
    return None


def _try_meta_tags(page, username: str, captured: dict):
    """Extract basic info from meta tags."""
    try:
        for sel in ['meta[name="description"]', 'meta[property="og:description"]']:
            desc = page.query_selector(sel)
            if desc:
                content = desc.get_attribute("content") or ""
                followers = _parse_meta_count(content, r'([\d,.]+[KMB]?)\s*Followers')
                if followers is not None:
                    following = _parse_meta_count(content, r'([\d,.]+[KMB]?)\s*Following')
                    post_count = _parse_meta_count(content, r'([\d,.]+[KMB]?)\s*Posts')

                    og_image = page.query_selector('meta[property="og:image"]')
                    avatar = og_image.get_attribute("content") if og_image else ""

                    title_el = page.query_selector('meta[property="og:title"]')
                    display_name = ""
                    if title_el:
                        t = title_el.get_attribute("content") or ""
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
                        "post_count": post_count or 0,
                    }
                    return
    except Exception as e:
        log.warning(f"Meta tag extraction failed: {e}")


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
    c = node.get("caption")
    if isinstance(c, dict):
        return c.get("text", "")
    return ""


def _ts_to_iso(ts):
    if ts is None:
        return None
    try:
        return datetime.utcfromtimestamp(int(ts)).isoformat()
    except (ValueError, TypeError, OSError):
        return None


def _parse_meta_count(text: str, pattern: str):
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
    sys.path.insert(0, str(Path(__file__).parent))
    from scraper.db import add_profile, update_profile, add_posts, get_profile, log_scrape

    result = scrape_profile(username, headless=headless)
    if not result:
        existing = get_profile(username, "instagram")
        if existing:
            log_scrape(existing["id"], "error", error_message="No data extracted")
        return False

    p = result["profile"]
    pid = add_profile(username, "instagram")
    update_profile(pid,
        display_name=p.get("display_name", ""),
        bio=p.get("bio", ""),
        avatar_url=p.get("avatar_url", ""),
        followers=p.get("followers", 0),
        following=p.get("following", 0),
        total_likes=p.get("total_likes", 0),
        post_count=p.get("post_count", 0),
        avg_views=p.get("avg_views", 0),
        last_scraped_at=datetime.utcnow().isoformat(),
    )
    add_posts(pid, result["posts"])
    log_scrape(pid, "success", posts_found=len(result["posts"]), duration_ms=result["elapsed_ms"])
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 instagram.py <username>")
        print("       python3 instagram.py --login")
        sys.exit(1)

    sys.path.insert(0, str(Path(__file__).parent))

    if sys.argv[1] == "--login":
        login_interactive()
        sys.exit(0)

    target = sys.argv[1].lstrip("@")
    headless = "--visible" not in sys.argv

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
        from scraper.db import add_profile, update_profile, add_posts, log_scrape
        p = result["profile"]
        pid = add_profile(target, "instagram")
        update_profile(pid,
            display_name=p.get("display_name", ""),
            bio=p.get("bio", ""),
            avatar_url=p.get("avatar_url", ""),
            followers=p.get("followers", 0),
            following=p.get("following", 0),
            total_likes=p.get("total_likes", 0),
            post_count=p.get("post_count", 0),
            avg_views=p.get("avg_views", 0),
            last_scraped_at=datetime.utcnow().isoformat(),
        )
        add_posts(pid, result["posts"])
        log_scrape(pid, "success", posts_found=len(result["posts"]), duration_ms=result["elapsed_ms"])
        print(f"\n   💾 Stored in database (profile_id={pid})")
    else:
        print(f"\n❌ Failed to scrape {target}")
        print("   If you haven't logged in yet, run: python3 instagram.py --login")
        sys.exit(1)
