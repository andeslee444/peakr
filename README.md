# Peakr

Track viral content on Instagram and TikTok. Find what's working, fast.

## Features

- **Track Public Accounts** — Monitor any public Instagram or TikTok creator
- **Viral Scores** — Engagement-based scoring that shows which posts outperform a creator's average
- **Sort & Filter** — Rank content by viral score, views, or recency across platforms
- **Save to Library** — Bookmark posts into folders for reference
- **Export Data** — Download CSV/JSON for offline analysis
- **Analytics Dashboard** — Compare accounts side-by-side with engagement rates and top content

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS v4 |
| Backend | Next.js API routes, better-sqlite3 (synchronous SQLite) |
| Scraper | Python 3 — Camoufox/Playwright (Instagram), curl_cffi + yt-dlp (TikTok) |
| Database | SQLite with WAL mode at `data/peakr.db` |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+

### Install & Run

```bash
# Install Node dependencies
npm install

# Install Python scraper dependencies
pip3 install --break-system-packages curl_cffi 'camoufox[geoip]'
brew install yt-dlp  # or pip3 install yt-dlp

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database is created automatically on first API call.

### Commands

```bash
npm run dev       # Dev server at localhost:3000
npm run build     # Production build
npm run start     # Production server
npm run lint      # ESLint

# Scrape directly from CLI
python3 -m scraper.tiktok @username
python3 -m scraper.instagram @username
python3 -m scraper.instagram --login   # Interactive login for session cookies
```

## How It Works

### Data Flow

1. User enters a username and platform in the dashboard Track form
2. `POST /api/track` spawns a Python scraper subprocess (90s timeout)
3. Scraper fetches profile metadata + post data, writes to SQLite
4. API reads the profile back from the DB and returns it to the client
5. Dashboard re-fetches and displays the tracked account with its content

### Viral Score

Both platforms use the same formula:

```
viral_score = (likes + comments) / avg(likes + comments) across all posts for that creator
```

A score of 2.0x means the post got double the creator's typical engagement. This normalizes across creators with different audience sizes.

### Scraper Details

**Instagram:** Uses Camoufox (a Playwright-based stealth browser) to load profile pages and intercept Instagram's internal API responses. Supports optional login sessions stored in `data/cookies/` for accessing more data. Falls back through multiple extraction strategies (API, GraphQL intercept, page source parsing, meta tags).

**TikTok:** Uses curl_cffi with browser impersonation to fetch profile metadata from the page's embedded JSON (`__UNIVERSAL_DATA_FOR_REHYDRATION__`). Video data is fetched via yt-dlp, which handles TikTok's request signing that the raw API requires.

**Daemon:** `python3 scraper/daemon.py` runs a background process that re-scrapes stale profiles (>4 hours old) with rate limiting and jitter.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── login/page.tsx              # Login (mock)
│   ├── signup/page.tsx             # Signup (mock)
│   ├── dashboard/
│   │   ├── layout.tsx              # Sidebar navigation
│   │   ├── page.tsx                # Main dashboard — track accounts, view top content
│   │   ├── explore/page.tsx        # Browse all tracked content
│   │   ├── saved/page.tsx          # Saved posts with folder management
│   │   ├── analytics/page.tsx      # Account comparison and stats
│   │   └── account/page.tsx        # Account settings (mock)
│   └── api/
│       ├── track/route.ts          # POST — trigger scraper for a username
│       ├── profiles/route.ts       # GET — list tracked profiles
│       ├── profiles/[username]/    # GET/DELETE — single profile
│       ├── explore/route.ts        # GET — sorted/filtered post feed
│       ├── saved/route.ts          # GET/POST — saved posts
│       ├── saved/[id]/route.ts     # DELETE — remove saved post
│       ├── search/route.ts         # GET — search tracked profiles
│       ├── analytics/route.ts      # GET — aggregated stats
│       └── export/route.ts         # GET — CSV/JSON export
├── components/                     # Landing page components
│   ├── Navigation.tsx
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── Pricing.tsx
│   ├── FAQ.tsx
│   └── Footer.tsx
└── lib/
    ├── db.ts                       # SQLite connection singleton + schema
    ├── format.ts                   # Number formatting helpers
    └── types.ts                    # TypeScript interfaces

scraper/
├── instagram.py                    # Instagram scraper (Camoufox + Playwright)
├── tiktok.py                       # TikTok scraper (curl_cffi + yt-dlp)
├── db.py                           # Python SQLite interface (mirrors db.ts schema)
├── daemon.py                       # Background re-scraping daemon
├── proxy.py                        # SOCKS5/WARP proxy config
└── utils.py                        # Random delays, cookie management, UA rotation
```

## Database Schema

Four tables, auto-created on first access:

- **profiles** — Tracked accounts (username, platform, followers, avatar, etc.)
- **posts** — Individual content items (views, likes, comments, shares, viral_score)
- **saved_posts** — User bookmarks with folder organization
- **scrape_log** — Scraping history with timing and error tracking

Posts are upserted via `ON CONFLICT(profile_id, platform_id)` to avoid duplicates on re-scrape.

## Status

MVP with mock authentication. Login/signup forms work visually but don't enforce access control. The scraping infrastructure is functional — TikTok works out of the box, Instagram requires a Camoufox-compatible environment and optionally a logged-in session for full data access.

## License

Private
