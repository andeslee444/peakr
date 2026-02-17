"""TikTok profile scraper using curl_cffi + WARP proxy."""

import json
import re
import sys
import time
from datetime import datetime
from typing import Optional

from curl_cffi import requests

from scraper.db import add_profile, update_profile, add_posts, get_profile, log_scrape
from scraper.proxy import get_proxy_config, is_wireproxy_running
from scraper.utils import random_delay, save_cookies, load_cookies


def _get_session() -> requests.Session:
    """Create a curl_cffi session with browser impersonation."""
    session = requests.Session(impersonate='chrome')
    if is_wireproxy_running():
        session.proxies = {
            'http': 'socks5://127.0.0.1:1080',
            'https': 'socks5://127.0.0.1:1080',
        }
    return session


def _fetch_profile_page(session: requests.Session, username: str) -> Optional[dict]:
    """Fetch TikTok profile page and extract __UNIVERSAL_DATA_FOR_REHYDRATION__."""
    url = f'https://www.tiktok.com/@{username}'
    resp = session.get(url, timeout=30)
    
    if resp.status_code != 200:
        print(f"  [!] HTTP {resp.status_code} for {url}")
        return None
    
    html = resp.text
    
    # Extract __UNIVERSAL_DATA_FOR_REHYDRATION__
    match = re.search(
        r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
        html, re.DOTALL
    )
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            print("  [!] Failed to parse UNIVERSAL_DATA JSON")
    
    # Fallback: try SIGI_STATE
    match = re.search(r'<script id="SIGI_STATE"[^>]*>(.*?)</script>', html, re.DOTALL)
    if match:
        try:
            return {'__SIGI__': json.loads(match.group(1))}
        except json.JSONDecodeError:
            pass
    
    print("  [!] No data found in page")
    return None


def _fetch_video_list(session: requests.Session, sec_uid: str, count: int = 30) -> list[dict]:
    """Fetch video list via TikTok API."""
    url = 'https://www.tiktok.com/api/post/item_list/'
    params = {
        'aid': '1988',
        'count': str(count),
        'secUid': sec_uid,
        'cursor': '0',
    }
    try:
        resp = session.get(url, params=params, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('itemList', [])
    except Exception as e:
        print(f"  [!] Video list API failed: {e}")
    return []


def scrape_profile(username: str) -> dict:
    """Scrape a TikTok profile. Returns profile data dict."""
    username = username.lstrip('@')
    start_time = time.time()
    profile_id = add_profile(username, 'tiktok')
    
    print(f"[*] Scraping TikTok @{username}...")
    
    session = _get_session()
    page_data = _fetch_profile_page(session, username)
    
    if not page_data:
        duration_ms = int((time.time() - start_time) * 1000)
        log_scrape(profile_id, 'error', error_message='No data found', duration_ms=duration_ms)
        return {'username': username, 'videos': [], 'profile_id': profile_id}
    
    # Parse profile data
    profile_data = _parse_profile_data(page_data, username)
    
    # Parse videos from page data
    videos = _parse_video_data(page_data, username, profile_data.get('avg_views', 1))
    
    # Try API for more videos if we got a secUid
    if profile_data.get('sec_uid') and len(videos) < 10:
        api_videos = _fetch_video_list(session, profile_data['sec_uid'])
        if api_videos:
            avg_views = profile_data.get('avg_views', 1)
            videos = _parse_raw_items(api_videos, avg_views)
    
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
    
    print(f"  [✓] @{username}: {profile_data.get('followers', 0):,} followers, "
          f"{len(videos)} videos ({duration_ms}ms)")
    
    return {**profile_data, 'videos': videos, 'profile_id': profile_id}


def _parse_profile_data(page_data: dict, username: str) -> dict:
    """Extract profile metadata."""
    result = {
        'username': username, 'display_name': '', 'bio': '', 'avatar_url': '',
        'followers': 0, 'following': 0, 'total_likes': 0, 'post_count': 0,
        'avg_views': 0, 'sec_uid': '',
    }
    
    # UNIVERSAL_DATA path
    scope = page_data.get('__DEFAULT_SCOPE__', {})
    user_detail = scope.get('webapp.user-detail', {})
    user_info = user_detail.get('userInfo', {})
    
    if user_info:
        user = user_info.get('user', {})
        stats = user_info.get('stats', {})
        result['display_name'] = user.get('nickname', '')
        result['bio'] = user.get('signature', '')
        result['avatar_url'] = user.get('avatarLarger', user.get('avatarMedium', ''))
        result['followers'] = stats.get('followerCount', 0)
        result['following'] = stats.get('followingCount', 0)
        result['total_likes'] = stats.get('heartCount', stats.get('heart', 0))
        result['post_count'] = stats.get('videoCount', 0)
        result['sec_uid'] = user.get('secUid', '')
        
        # Estimate avg views
        if result['post_count'] > 0 and result['total_likes'] > 0:
            # Rough estimate: avg_views ≈ total_likes / post_count * 5 (typical like-to-view ratio)
            result['avg_views'] = (result['total_likes'] / result['post_count']) * 5
        return result
    
    # SIGI_STATE path
    sigi = page_data.get('__SIGI__', {})
    if sigi:
        users = sigi.get('UserModule', {}).get('users', {})
        user = users.get(username, {})
        stats = sigi.get('UserModule', {}).get('stats', {}).get(username, {})
        result['display_name'] = user.get('nickname', '')
        result['bio'] = user.get('signature', '')
        result['avatar_url'] = user.get('avatarLarger', '')
        result['followers'] = stats.get('followerCount', 0)
        result['following'] = stats.get('followingCount', 0)
        result['total_likes'] = stats.get('heartCount', 0)
        result['post_count'] = stats.get('videoCount', 0)
        result['sec_uid'] = user.get('secUid', '')
    
    return result


def _parse_video_data(page_data: dict, username: str, avg_views: float) -> list[dict]:
    """Extract videos from page data."""
    raw_items = []
    
    # UNIVERSAL_DATA: look for item list in various locations
    scope = page_data.get('__DEFAULT_SCOPE__', {})
    
    # Check webapp.user-detail for post items
    user_detail = scope.get('webapp.user-detail', {})
    
    # The video items might be in a different key
    for key, val in scope.items():
        if isinstance(val, dict):
            for k2, v2 in val.items():
                if isinstance(v2, list) and v2 and isinstance(v2[0], dict) and ('id' in v2[0] or 'video' in v2[0]):
                    raw_items = v2
                    break
            if raw_items:
                break
    
    # SIGI_STATE path
    if not raw_items:
        sigi = page_data.get('__SIGI__', {})
        items = sigi.get('ItemModule', {})
        if items:
            raw_items = list(items.values())
    
    return _parse_raw_items(raw_items, avg_views)


def _parse_raw_items(raw_items: list[dict], avg_views: float) -> list[dict]:
    """Parse raw TikTok video items into our format."""
    videos = []
    
    if not raw_items:
        return videos
    
    # Recalculate avg_views from actual data
    view_counts = [
        item.get('stats', {}).get('playCount', item.get('playCount', 0))
        for item in raw_items
    ]
    if view_counts:
        actual_avg = sum(view_counts) / len(view_counts)
        if actual_avg > 0:
            avg_views = actual_avg
    
    avg_views = max(avg_views, 1)
    
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
    print(f"  Followers: {result.get('followers', 0):,}")
    print(f"  Following: {result.get('following', 0):,}")
    print(f"  Total likes: {result.get('total_likes', 0):,}")
    print(f"  Videos scraped: {len(result.get('videos', []))}")
    for v in result.get('videos', [])[:5]:
        desc = v['description'][:50] if v['description'] else '(no desc)'
        print(f"    - {desc} | views: {v['views']:,} | viral: {v['viral_score']}x")
