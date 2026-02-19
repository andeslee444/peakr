"""Look up a TikTok user by username via their profile page. Outputs JSON array to stdout.

TikTok's search API requires signed requests, so instead we fetch the user's
profile page directly (same technique as scraper/tiktok.py) and extract their
info from __UNIVERSAL_DATA_FOR_REHYDRATION__.
"""

import json
import re
import sys

from curl_cffi import requests

from scraper.proxy import is_wireproxy_running


def _get_session() -> requests.Session:
    """Create a curl_cffi session with browser impersonation."""
    session = requests.Session(impersonate='chrome')
    if is_wireproxy_running():
        session.proxies = {
            'http': 'socks5://127.0.0.1:1080',
            'https': 'socks5://127.0.0.1:1080',
        }
    return session


def lookup_user(username: str) -> list[dict]:
    """Fetch a TikTok profile page and return user info as a single-element list."""
    username = username.lstrip('@').strip()
    if not username:
        return []

    session = _get_session()
    url = f'https://www.tiktok.com/@{username}'

    try:
        resp = session.get(url, timeout=10)
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return []

    if resp.status_code != 200:
        print(f"HTTP {resp.status_code}", file=sys.stderr)
        return []

    html = resp.text

    match = re.search(
        r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
        html, re.DOTALL
    )
    if not match:
        print("No UNIVERSAL_DATA found", file=sys.stderr)
        return []

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        print("Failed to parse JSON", file=sys.stderr)
        return []

    scope = data.get('__DEFAULT_SCOPE__', {})
    user_detail = scope.get('webapp.user-detail', {})
    user_info = user_detail.get('userInfo', {})
    user = user_info.get('user', {})
    stats = user_info.get('stats', {})

    uid = user.get('uniqueId', '')
    if not uid:
        return []

    return [{
        'username': uid,
        'display_name': user.get('nickname', ''),
        'avatar_url': user.get('avatarThumb', user.get('avatarMedium', '')),
        'followers': stats.get('followerCount', 0),
        'verified': user.get('verified', False),
    }]


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 -m scraper.search_tiktok USERNAME", file=sys.stderr)
        sys.exit(1)

    query = sys.argv[1]
    results = lookup_user(query)
    print(json.dumps(results))
