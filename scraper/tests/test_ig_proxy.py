"""IG scraping should route through the proxy when available, and refuse to
scrape from the raw IP when a proxy is explicitly required."""

import pytest

from scraper.instagram import resolve_ig_proxy


def test_uses_proxy_when_running():
    cfg = resolve_ig_proxy(proxy_running=True, proxy_required=False)
    assert cfg is not None
    assert cfg["server"].startswith("socks5://")


def test_no_proxy_when_down_and_not_required():
    # Falls back to direct (current behavior) but the caller logs a warning.
    assert resolve_ig_proxy(proxy_running=False, proxy_required=False) is None


def test_refuses_when_required_but_down():
    with pytest.raises(RuntimeError):
        resolve_ig_proxy(proxy_running=False, proxy_required=True)
