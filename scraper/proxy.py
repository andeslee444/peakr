"""WARP proxy configuration for Camoufox."""

import os
import subprocess


PID_FILE = '/tmp/wireproxy.pid'
PROXY_HOST = '127.0.0.1'
PROXY_PORT = 1080


def is_wireproxy_running() -> bool:
    """Check if wireproxy is running."""
    if not os.path.exists(PID_FILE):
        return False
    try:
        pid = int(open(PID_FILE).read().strip())
        os.kill(pid, 0)
        return True
    except (ValueError, OSError):
        return False


def get_proxy_config() -> dict:
    """Return proxy config dict for Camoufox."""
    return {"server": f"socks5://{PROXY_HOST}:{PROXY_PORT}"}


def test_proxy() -> bool:
    """Test if the proxy is working."""
    try:
        result = subprocess.run(
            ['curl', '-s', '--socks5', f'{PROXY_HOST}:{PROXY_PORT}',
             'https://cloudflare.com/cdn-cgi/trace', '--max-time', '10'],
            capture_output=True, text=True, timeout=15
        )
        return 'warp=' in result.stdout
    except Exception:
        return False


if __name__ == '__main__':
    print(f"Wireproxy running: {is_wireproxy_running()}")
    print(f"Proxy config: {get_proxy_config()}")
    print(f"Proxy working: {test_proxy()}")
