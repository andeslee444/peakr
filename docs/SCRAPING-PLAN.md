# Peakr Scraping Plan 🏔️

## Overview

Peakr needs to scrape public TikTok and Instagram profiles to display:
- Profile metadata (followers, following, bio, avatar)
- Video/post list (thumbnail, views, likes, comments, shares, date)
- Engagement metrics for viral score calculation
- Trending/explore content discovery

Official APIs won't work (TikTok Research API requires academic affiliation, Instagram Graph API requires business account ownership). We must scrape.

---

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Next.js UI  │◄──│  API Routes   │◄──│  Scraper     │
│  (frontend)  │   │  /api/scrape  │   │  Daemon      │
└─────────────┘    └──────────────┘    └─────────────┘
                          │                    │
                   ┌──────▼──────┐    ┌───────▼────────┐
                   │  SQLite DB  │    │  Camoufox +    │
                   │  (cache)    │    │  WARP Proxy    │
                   └─────────────┘    └────────────────┘
```

### Components

1. **Scraper Daemon** (Python) — Background process, scrapes profiles on schedule
2. **SQLite Database** — Stores profiles, posts, metrics, scrape history
3. **Next.js API Routes** — Serves cached data to frontend
4. **Camoufox + WARP** — Anti-detect browser through Cloudflare proxy

---

## Scraping Strategy (Lessons from Airline Scrapers)

### What We Learned (Harbor Flights)

| Lesson | Airline Context | Peakr Application |
|--------|----------------|-------------------|
| **IP burns fast** | AA blocked after 36 req/30min | Rate limit to 1 profile/30s |
| **WARP proxy works** | Restored AA scraper instantly | Route all scrapes through WARP |
| **Camoufox beats Playwright** | 0% Akamai detection vs 100% | Use Camoufox for all browser scraping |
| **Cookie harvest + API replay** | 3x faster than full browser | Scrape cookies → replay API calls via curl_cffi |
| **Session persistence** | Persistent Camoufox = faster | Keep browser session alive across scrapes |
| **Fallback chains** | AA Fast → Camoufox → Playwright | TikTok API replay → Camoufox → mobile site |
| **Dedup + cache** | Cache layer made search instant | Cache all profile data, serve from DB |
| **Background daemon** | Flight daemon runs every 30min | Scraper daemon refreshes tracked profiles |

### Anti-Detection Measures

1. **Camoufox** (Firefox anti-detect) — randomized fingerprint, human-like behavior
2. **WARP SOCKS5 proxy** (127.0.0.1:1080) — Cloudflare IP, not residential
3. **Human timing** — random delays 2-5s between actions, 30-60s between profiles
4. **Cookie persistence** — reuse sessions to avoid repeated fresh visits
5. **User-agent rotation** — rotate across realistic Firefox UAs
6. **Scroll simulation** — `humanize=True` in Camoufox handles mouse/scroll naturally
7. **No concurrent scraping** — one profile at a time, sequential

---

## Platform-Specific Strategies

### TikTok

**Primary: API Interception (fastest)**
1. Navigate to `tiktok.com/@username` in Camoufox
2. Intercept XHR responses for `api/post/item_list` and `api/user/detail`
3. Extract JSON data directly (no HTML parsing needed)
4. Cache cookies → replay API calls via `curl_cffi` for subsequent fetches

**Fallback: HTML Scraping**
1. Load profile page, wait for hydration
2. Parse `__UNIVERSAL_DATA_FOR_REHYDRATION__` script tag (contains all profile + post data as JSON)
3. Extract: username, followers, videos, views, likes, shares

**Data Available (Public Profiles):**
- Profile: username, display name, bio, avatar, follower/following count, total likes
- Videos: thumbnail, description, view count, like count, comment count, share count, duration, date posted, music used
- Viral score = views / average_views_per_video

**Rate Limits:**
- 1 profile every 30-60 seconds
- Max 50-100 profiles per hour
- Rotate user-agent every 10 requests
- Re-harvest cookies every 20 requests

### Instagram

**Primary: API Interception**
1. Navigate to `instagram.com/username/` in Camoufox
2. Intercept GraphQL responses (`/graphql/query`)
3. Extract post data from `edge_owner_to_timeline_media`

**Fallback: Embedded JSON**
1. Load profile page
2. Parse `window._sharedData` or `__additionalData` script tags
3. Instagram has gotten stricter — may need login for full data

**Data Available (Public Profiles, no login):**
- Profile: username, full name, bio, avatar, follower/following count, post count
- Posts (top 12 without login, more with scroll): thumbnail, like count, comment count, is_video, view count (videos only)
- Reels: view count, like count, comment count

**Challenges:**
- Instagram rate-limits aggressively (429 errors)
- May require login session for full post history (> 12 posts)
- Consider creating a burner IG account for session cookies

**Rate Limits:**
- 1 profile every 60-90 seconds (stricter than TikTok)
- Max 30-40 profiles per hour
- Must handle 429 with exponential backoff

---

## Database Schema (SQLite)

```sql
-- Tracked profiles
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'tiktok' | 'instagram'
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  followers INTEGER,
  following INTEGER,
  total_likes INTEGER,
  post_count INTEGER,
  avg_views REAL,
  last_scraped_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(username, platform)
);

-- Individual posts/videos
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  platform_id TEXT NOT NULL, -- TikTok video ID or IG post shortcode
  post_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  viral_score REAL, -- views / profile avg_views
  posted_at DATETIME,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(profile_id, platform_id)
);

-- Scrape history (for monitoring success rates)
CREATE TABLE scrape_log (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  status TEXT, -- 'success' | 'blocked' | 'error' | 'rate_limited'
  posts_found INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Saved content (user's library)
CREATE TABLE saved_posts (
  id INTEGER PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  folder TEXT DEFAULT 'default',
  notes TEXT,
  saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Implementation Plan

### Phase 1: TikTok Scraper (Week 1)
**Goal:** Scrape any public TikTok profile and display real data in Peakr

1. **Day 1-2: Core scraper** (`scraper/tiktok.py`)
   - Camoufox + WARP proxy setup
   - Navigate to profile → intercept API responses
   - Parse profile metadata + video list
   - Calculate viral scores
   - Store in SQLite

2. **Day 2-3: Scraper daemon** (`scraper/daemon.py`)
   - Background process (like flight-daemon)
   - Refreshes tracked profiles every 2-4 hours
   - Rate limiting: 1 profile/30s
   - Error handling + retry logic
   - PID file at /tmp/peakr-daemon.pid

3. **Day 3-4: API routes** (`src/app/api/`)
   - `POST /api/track` — Add profile to track
   - `GET /api/profiles` — List tracked profiles
   - `GET /api/profiles/[username]` — Profile detail + posts
   - `GET /api/explore` — Trending content across tracked profiles
   - All serve from SQLite cache

4. **Day 4-5: Wire up frontend**
   - Replace mock data with real API calls
   - Dashboard shows real tracked profiles
   - Content grid shows real videos with viral scores
   - Search triggers profile scrape if not cached

### Phase 2: Instagram Scraper (Week 2)
**Goal:** Add Instagram support alongside TikTok

5. **Day 6-7: Instagram scraper** (`scraper/instagram.py`)
   - Same Camoufox + WARP pattern
   - Handle GraphQL API interception
   - Create burner account if needed for full data
   - Parse posts, reels, engagement

6. **Day 7-8: Unified daemon**
   - Both TikTok + IG in one daemon
   - Platform-specific rate limits
   - Shared cookie management

### Phase 3: Advanced Features (Week 3)
7. **Explore/Discovery** — Scrape trending pages for content discovery
8. **Export to Excel** — Download tracked data as CSV/XLSX
9. **Analytics** — Growth over time, comparison charts
10. **Alerts** — Notify when tracked account posts viral content (WhatsApp?)

---

## File Structure

```
peakr/
├── src/                    # Next.js frontend (existing)
│   ├── app/
│   │   ├── api/            # API routes (NEW)
│   │   │   ├── track/route.ts
│   │   │   ├── profiles/route.ts
│   │   │   └── explore/route.ts
│   │   └── dashboard/      # Existing pages
│   └── components/
├── scraper/                # Python scraping backend (NEW)
│   ├── tiktok.py           # TikTok profile scraper
│   ├── instagram.py        # Instagram profile scraper
│   ├── daemon.py           # Background scraper daemon
│   ├── db.py               # SQLite database layer
│   ├── proxy.py            # WARP proxy configuration
│   └── utils.py            # Shared utilities (rate limit, UA rotation)
├── data/                   # Runtime data (gitignored)
│   ├── peakr.db            # SQLite database
│   ├── cookies/            # Session cookies
│   └── scrape-log.json     # Scrape history
├── docs/
│   └── SCRAPING-PLAN.md    # This document
└── package.json
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| TikTok scrape success rate | > 90% |
| Instagram scrape success rate | > 80% |
| Time to scrape 1 profile | < 15 seconds |
| Profiles per hour | 50-100 |
| Data freshness | < 4 hours for tracked profiles |
| Viral score accuracy | Views within 5% of actual |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| IP ban from TikTok/IG | WARP proxy + rate limiting (proven with AA) |
| Anti-bot detection | Camoufox (0% detection rate on Akamai) |
| API structure changes | Fallback to HTML parsing, monitor for changes |
| Rate limiting (429) | Exponential backoff, reduce frequency |
| WARP proxy blocked | Fallback to direct IP, router reset as last resort |
| Cookie expiry | Re-harvest every 20 requests |
| Legal concerns | Only scraping public data, no login bypass, respecting robots.txt spirit |

---

## Quick Start (for development)

```bash
# Start WARP proxy (if not already running)
nohup /tmp/wireproxy -c /tmp/wireproxy.conf > /tmp/wireproxy.log 2>&1 &

# Test TikTok scraper
cd peakr/scraper
python3 tiktok.py @charlidamelio

# Start scraper daemon
python3 daemon.py

# Start Next.js frontend
cd peakr && npm run dev
```
