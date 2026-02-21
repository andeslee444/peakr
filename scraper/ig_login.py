"""Quick Instagram login using standard Playwright (not Camoufox).
Saves cookies in the format the Instagram scraper expects.

Usage: python3 scraper/ig_login.py
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

COOKIE_FILE = Path(__file__).parent.parent / "data" / "cookies" / "instagram.json"
COOKIE_FILE.parent.mkdir(parents=True, exist_ok=True)

def main():
    print("\n🔐 Opening Instagram login (standard browser)...")
    print("   Log in manually, then press Enter here when done.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")

        input("Press Enter after you've logged in successfully...")

        cookies = context.cookies()
        COOKIE_FILE.write_text(json.dumps(cookies, indent=2))
        print(f"✅ Saved {len(cookies)} cookies to {COOKIE_FILE}")

        # Verify by checking if we can access the API
        page.goto("https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram", wait_until="domcontentloaded")
        body = page.inner_text("body")
        if "user" in body.lower():
            print("✅ Session verified — scraping will work!")
        else:
            print("⚠️  Session may not be valid — try logging in again")

        browser.close()

if __name__ == "__main__":
    main()
