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


class BrowserSession:
    """Context manager wrapping Playwright Chromium with cookie loading.
    Falls back from Camoufox to standard Playwright if Camoufox is broken.
    """

    def __init__(self, headless=True):
        self.headless = headless
        self._pw = None
        self._browser = None
        self.ctx = None

    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=self.headless)
        self.ctx = self._browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
        if COOKIE_FILE.exists():
            try:
                cookies = json.loads(COOKIE_FILE.read_text())
                if cookies:
                    self.ctx.add_cookies(cookies)
                    log.info("Loaded saved session cookies")
            except Exception as e:
                log.warning(f"Failed to load cookies: {e}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if self._browser:
                self._browser.close()
            if self._pw:
                self._pw.stop()
        except Exception as e:
            log.warning(f"Error closing browser: {e}")
        return False


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
    username = username.lstrip("@")
    log.info(f"Scraping Instagram profile: {username}")
    start = time.time()

    try:
        with BrowserSession(headless=headless) as bs:
            ctx = bs.ctx

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
    """Fetch profile data via Instagram's internal API, then posts via feed API."""
    page = ctx.new_page()
    try:
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=15000)
        time.sleep(1)

        # Step 1: Get profile info + user ID
        result = page.evaluate("""async (username) => {
            try {
                const r = await fetch(
                    `/api/v1/users/web_profile_info/?username=${username}`,
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

        if not result or "error" in result:
            log.warning(f"API returned error: {result}")
            page.close()
            return None

        user = (result.get("data", {}).get("user") or
                result.get("graphql", {}).get("user") or
                result.get("user"))

        if not user:
            log.warning("No user in API response")
            page.close()
            return None

        parsed = _parse_user_object(user)

        # Step 2: If no posts from profile API, fetch via feed API using user ID
        if not parsed.get("posts") and user.get("id"):
            user_id = user["id"]
            log.info(f"Fetching posts via feed API for user_id={user_id}")
            feed_items = page.evaluate("""async (userId) => {
                try {
                    const r = await fetch(
                        `/api/v1/feed/user/${userId}/?count=24`,
                        {
                            headers: {
                                'X-IG-App-ID': '936619743392459',
                                'X-Requested-With': 'XMLHttpRequest',
                            },
                            credentials: 'include'
                        }
                    );
                    if (!r.ok) return [];
                    const data = await r.json();
                    return data.items || [];
                } catch(e) { return []; }
            }""", user_id)

            if feed_items:
                log.info(f"Feed API returned {len(feed_items)} posts")
                posts = []
                for item in feed_items:
                    code = item.get("code", "")
                    is_video = item.get("media_type") == 2 or item.get("is_video", False)
                    views = item.get("play_count", 0) or item.get("video_view_count", 0) if is_video else 0
                    likes = item.get("like_count", 0)
                    comments = item.get("comment_count", 0)
                    caption = item.get("caption") or {}
                    desc = caption.get("text", "") if isinstance(caption, dict) else ""
                    thumb = ""
                    candidates = item.get("image_versions2", {}).get("candidates", [])
                    if candidates:
                        thumb = candidates[0].get("url", "")

                    posts.append({
                        "platform_id": code,
                        "post_url": f"https://www.instagram.com/reel/{code}/" if is_video else f"https://www.instagram.com/p/{code}/",
                        "thumbnail_url": thumb,
                        "description": desc,
                        "views": views or 0,
                        "likes": likes or 0,
                        "comments": comments or 0,
                        "shares": 0,
                        "is_video": bool(is_video),
                        "duration_seconds": item.get("video_duration"),
                        "posted_at": _ts_to_iso(item.get("taken_at")),
                    })
                parsed["posts"] = posts

        page.close()
        return parsed

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
    from scraper.db import add_profile, update_profile, add_posts, get_profile, log_scrape, recalculate_viral_scores

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
    recalculate_viral_scores(pid)
    log_scrape(pid, "success", posts_found=len(result["posts"]), duration_ms=result["elapsed_ms"])

    # Upload thumbnails to S3 (non-blocking — failure won't break scraping)
    try:
        from scraper.s3 import upload_thumbnails_for_posts
        upload_thumbnails_for_posts(pid, username, "instagram", result["posts"])
    except Exception as e:
        log.warning(f"S3 thumbnail upload failed for @{username}: {e}")

    return True


def scrape_hashtag_creators(hashtag: str, limit: int = 20) -> list:
    """Scrape top creator usernames from an Instagram hashtag explore page.

    Uses Camoufox to navigate to the hashtag page, extracts post owners
    from the page source or API intercept.

    Returns list of unique usernames (strings, no @ prefix).
    """
    hashtag = hashtag.lstrip("#")
    url = f"https://www.instagram.com/explore/tags/{hashtag}/"

    try:
        with BrowserSession(headless=True) as bs:
            page = bs.ctx.new_page()
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            time.sleep(random.uniform(3, 5))

            # Strategy 1: Extract usernames from page links
            usernames = set()

            # Look for links to user profiles in the post grid
            links = page.query_selector_all('a[href*="instagram.com/"]')
            for link in links:
                href = link.get_attribute("href") or ""
                # Match profile links like /username/ (not /p/, /explore/, etc.)
                match = re.search(r"instagram\.com/([a-zA-Z0-9._]+)/?$", href)
                if match:
                    uname = match.group(1)
                    if uname not in ("explore", "p", "reel", "stories", "accounts", "tags", hashtag):
                        usernames.add(uname)

            # Strategy 2: Extract from page source JSON data
            if len(usernames) < 5:
                html = page.content()
                # Look for owner usernames in embedded JSON
                owner_matches = re.findall(r'"username"\s*:\s*"([a-zA-Z0-9._]+)"', html)
                for uname in owner_matches:
                    if uname not in ("instagram", hashtag):
                        usernames.add(uname)

            page.close()

            result = list(usernames)[:limit]
            log.info(f"Instagram #{hashtag}: found {len(result)} creators")
            return result

    except Exception as e:
        log.warning(f"Error scraping Instagram #{hashtag}: {e}")
        return []


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
        from scraper.db import add_profile, update_profile, add_posts, log_scrape, recalculate_viral_scores
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
        recalculate_viral_scores(pid)
        log_scrape(pid, "success", posts_found=len(result["posts"]), duration_ms=result["elapsed_ms"])
        try:
            from scraper.s3 import upload_thumbnails_for_posts
            upload_thumbnails_for_posts(pid, target, "instagram", result["posts"])
        except Exception as e:
            log.warning(f"S3 thumbnail upload failed: {e}")
        print(f"\n   💾 Stored in database (profile_id={pid})")
    else:
        print(f"\n❌ Failed to scrape {target}")
        print("   If you haven't logged in yet, run: python3 instagram.py --login")
        sys.exit(1)
