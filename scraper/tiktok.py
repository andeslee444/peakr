"""TikTok profile scraper using Camoufox + WARP proxy."""

import json
import re
import sys
import time
from datetime import datetime

from scraper.db import add_profile, update_profile, add_posts, get_profile, log_scrape
from scraper.proxy import get_proxy_config, is_wireproxy_running
from scraper.utils import random_delay, save_cookies, load_cookies


def scrape_profile(username: str) -> dict:
    """Scrape a TikTok profile. Returns profile data dict."""
    username = username.lstrip('@')
    start_time = time.time()
    profile_id = add_profile(username, 'tiktok')
    
    print(f"[*] Scraping TikTok @{username}...")
    
    # Check proxy
    if not is_wireproxy_running():
        print("[!] Warning: wireproxy not running, scraping without proxy")
    
    proxy_config = get_proxy_config()
    api_data = {}
    video_list_data = []
    
    try:
        from camoufox.sync_api import Camoufox
    except ImportError:
        from camoufox import Camoufox
    
    def handle_response(response):
        nonlocal api_data, video_list_data
        url = response.url
        try:
            if '/api/user/detail' in url or 'userInfo' in url:
                data = response.json()
                if data:
                    api_data['user_detail'] = data
                    print(f"  [+] Captured user detail API")
            elif '/api/post/item_list' in url or 'itemList' in url:
                data = response.json()
                if data:
                    video_list_data.append(data)
                    print(f"  [+] Captured video list API")
        except Exception:
            pass
    
    with Camoufox(
        headless=True,
        proxy=proxy_config if is_wireproxy_running() else None,
        geoip=True,
    ) as browser:
        page = browser.new_page()
        
        # Load cookies if available
        cookies = load_cookies(f'tiktok_{username}')
        if cookies:
            try:
                page.context.add_cookies(cookies)
            except Exception:
                pass
        
        # Listen for API responses
        page.on('response', handle_response)
        
        # Navigate to profile
        url = f'https://www.tiktok.com/@{username}'
        print(f"  [*] Navigating to {url}")
        page.goto(url, wait_until='domcontentloaded', timeout=30000)
        random_delay(3, 6)
        
        # Scroll to trigger video list loading
        page.evaluate("window.scrollBy(0, 800)")
        random_delay(2, 4)
        page.evaluate("window.scrollBy(0, 800)")
        random_delay(2, 3)
        
        # Save cookies
        try:
            save_cookies(page.context.cookies(), f'tiktok_{username}')
        except Exception:
            pass
        
        # FALLBACK: Parse __UNIVERSAL_DATA_FOR_REHYDRATION__ if API interception didn't work
        if not api_data.get('user_detail'):
            print("  [*] Trying fallback: __UNIVERSAL_DATA_FOR_REHYDRATION__")
            try:
                script_content = page.evaluate("""
                    () => {
                        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
                        return el ? el.textContent : null;
                    }
                """)
                if script_content:
                    universal_data = json.loads(script_content)
                    api_data['universal'] = universal_data
                    print("  [+] Got universal data")
            except Exception as e:
                print(f"  [!] Fallback failed: {e}")
        
        # Also try SIGI_STATE
        if not api_data.get('user_detail') and not api_data.get('universal'):
            try:
                sigi = page.evaluate("""
                    () => {
                        const el = document.getElementById('SIGI_STATE');
                        return el ? el.textContent : null;
                    }
                """)
                if sigi:
                    api_data['sigi'] = json.loads(sigi)
                    print("  [+] Got SIGI_STATE data")
            except Exception:
                pass
    
    # Parse the collected data
    profile_data = _parse_profile_data(api_data, username)
    videos = _parse_video_data(api_data, video_list_data, profile_data.get('avg_views', 1))
    
    duration_ms = int((time.time() - start_time) * 1000)
    
    # Store in DB
    update_profile(profile_id,
        display_name=profile_data.get('display_name', ''),
        bio=profile_data.get('bio', ''),
        avatar_url=profile_data.get('avatar_url', ''),
        followers=profile_data.get('followers', 0),
        following=profile_data.get('following', 0),
        total_likes=profile_data.get('total_likes', 0),
        post_count=profile_data.get('post_count', 0),
        avg_views=profile_data.get('avg_views', 0),
        last_scraped_at=datetime.utcnow().isoformat()
    )
    
    if videos:
        add_posts(profile_id, videos)
    
    log_scrape(profile_id, 'success', len(videos), duration_ms=duration_ms)
    
    print(f"  [✓] Scraped @{username}: {profile_data.get('followers', 0)} followers, {len(videos)} videos ({duration_ms}ms)")
    
    return {**profile_data, 'videos': videos, 'profile_id': profile_id}


def _parse_profile_data(api_data: dict, username: str) -> dict:
    """Extract profile metadata from various data sources."""
    result = {
        'username': username,
        'display_name': '',
        'bio': '',
        'avatar_url': '',
        'followers': 0,
        'following': 0,
        'total_likes': 0,
        'post_count': 0,
        'avg_views': 0,
    }
    
    user_info = None
    
    # Try API response
    if 'user_detail' in api_data:
        d = api_data['user_detail']
        user_info = d.get('userInfo', d.get('user', {}))
        if 'userInfo' in d:
            user = d['userInfo'].get('user', {})
            stats = d['userInfo'].get('stats', {})
            result['display_name'] = user.get('nickname', '')
            result['bio'] = user.get('signature', '')
            result['avatar_url'] = user.get('avatarLarger', user.get('avatarMedium', ''))
            result['followers'] = stats.get('followerCount', 0)
            result['following'] = stats.get('followingCount', 0)
            result['total_likes'] = stats.get('heartCount', stats.get('heart', 0))
            result['post_count'] = stats.get('videoCount', 0)
            return result
    
    # Try universal data
    if 'universal' in api_data:
        try:
            default_scope = api_data['universal'].get('__DEFAULT_SCOPE__', {})
            user_detail = default_scope.get('webapp.user-detail', {})
            user_info_data = user_detail.get('userInfo', {})
            user = user_info_data.get('user', {})
            stats = user_info_data.get('stats', {})
            result['display_name'] = user.get('nickname', '')
            result['bio'] = user.get('signature', '')
            result['avatar_url'] = user.get('avatarLarger', '')
            result['followers'] = stats.get('followerCount', 0)
            result['following'] = stats.get('followingCount', 0)
            result['total_likes'] = stats.get('heartCount', stats.get('heart', 0))
            result['post_count'] = stats.get('videoCount', 0)
        except Exception:
            pass
    
    # Try SIGI_STATE
    if 'sigi' in api_data:
        try:
            sigi = api_data['sigi']
            user_module = sigi.get('UserModule', {})
            users = user_module.get('users', {})
            user = users.get(username, {})
            stats_mod = sigi.get('UserModule', {}).get('stats', {})
            user_stats = stats_mod.get(username, {})
            result['display_name'] = user.get('nickname', '')
            result['bio'] = user.get('signature', '')
            result['avatar_url'] = user.get('avatarLarger', '')
            result['followers'] = user_stats.get('followerCount', 0)
            result['following'] = user_stats.get('followingCount', 0)
            result['total_likes'] = user_stats.get('heartCount', 0)
            result['post_count'] = user_stats.get('videoCount', 0)
        except Exception:
            pass
    
    return result


def _parse_video_data(api_data: dict, video_list_data: list, avg_views: float) -> list[dict]:
    """Extract video list from various data sources."""
    videos = []
    raw_items = []
    
    # From API interception
    for data in video_list_data:
        items = data.get('itemList', data.get('items', []))
        raw_items.extend(items)
    
    # From universal data
    if not raw_items and 'universal' in api_data:
        try:
            default_scope = api_data['universal'].get('__DEFAULT_SCOPE__', {})
            item_module = default_scope.get('webapp.user-detail', {})
            # Sometimes items are in a different location
            post_data = default_scope.get('webapp.post-detail', {})
            user_post = default_scope.get('webapp.user-detail', {})
            # Try to find item list in various places
            for key, val in default_scope.items():
                if isinstance(val, dict):
                    for k2, v2 in val.items():
                        if isinstance(v2, list) and len(v2) > 0 and isinstance(v2[0], dict) and 'id' in v2[0]:
                            raw_items = v2
                            break
        except Exception:
            pass
    
    # From SIGI_STATE
    if not raw_items and 'sigi' in api_data:
        try:
            item_module = api_data['sigi'].get('ItemModule', {})
            raw_items = list(item_module.values())
        except Exception:
            pass
    
    # Calculate avg_views from the items if we have them
    if raw_items:
        total_views = sum(
            item.get('stats', {}).get('playCount', item.get('playCount', 0))
            for item in raw_items
        )
        if len(raw_items) > 0:
            avg_views = max(total_views / len(raw_items), 1)
    
    for item in raw_items:
        stats = item.get('stats', {})
        view_count = stats.get('playCount', item.get('playCount', 0))
        viral = round(view_count / avg_views, 1) if avg_views > 0 else 0
        
        video_data = item.get('video', {})
        create_time = item.get('createTime', 0)
        posted_at = None
        if create_time:
            try:
                posted_at = datetime.fromtimestamp(int(create_time)).isoformat()
            except Exception:
                pass
        
        videos.append({
            'platform_id': str(item.get('id', '')),
            'post_url': f"https://www.tiktok.com/@/video/{item.get('id', '')}",
            'thumbnail_url': video_data.get('cover', video_data.get('dynamicCover', '')),
            'description': item.get('desc', ''),
            'views': view_count,
            'likes': stats.get('diggCount', item.get('diggCount', 0)),
            'comments': stats.get('commentCount', item.get('commentCount', 0)),
            'shares': stats.get('shareCount', item.get('shareCount', 0)),
            'duration_seconds': video_data.get('duration', item.get('duration', 0)),
            'viral_score': viral,
            'posted_at': posted_at,
        })
    
    return videos


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python -m scraper.tiktok @username")
        sys.exit(1)
    
    username = sys.argv[1].lstrip('@')
    result = scrape_profile(username)
    print(f"\nProfile: @{result['username']}")
    print(f"  Display name: {result.get('display_name', 'N/A')}")
    print(f"  Followers: {result.get('followers', 0)}")
    print(f"  Videos scraped: {len(result.get('videos', []))}")
    for v in result.get('videos', [])[:5]:
        print(f"  - {v['description'][:50]}... | views: {v['views']} | viral: {v['viral_score']}x")
