"""Shared utilities for scraping."""

import json
import os
import random
import time
from pathlib import Path

COOKIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'cookies')

FIREFOX_UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
]


def random_delay(min_s: float = 2.0, max_s: float = 5.0):
    """Sleep for a random duration."""
    time.sleep(random.uniform(min_s, max_s))


def rate_limit(min_s: float = 30.0, max_s: float = 60.0):
    """Sleep between profile scrapes."""
    time.sleep(random.uniform(min_s, max_s))


def get_random_ua() -> str:
    return random.choice(FIREFOX_UAS)


def save_cookies(cookies: list, name: str):
    os.makedirs(COOKIES_DIR, exist_ok=True)
    path = os.path.join(COOKIES_DIR, f'{name}.json')
    with open(path, 'w') as f:
        json.dump(cookies, f)


def load_cookies(name: str) -> list:
    path = os.path.join(COOKIES_DIR, f'{name}.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []


def format_number(n: int) -> str:
    """Format number like 1.2M, 45.3K etc."""
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)
