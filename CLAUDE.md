# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint (flat config, v9)
```

Python scraper (requires Python 3 + dependencies):
```bash
python3 -m scraper.instagram @username   # Scrape Instagram profile
python3 -m scraper.tiktok @username      # Scrape TikTok profile
```

No test framework is configured.

## Architecture

**Peakr** is a viral content tracker for Instagram and TikTok. It's an MVP using mock auth — no real authentication or route protection exists yet.

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS v4
- **Backend**: Next.js API routes + better-sqlite3 (synchronous SQLite)
- **Scraper**: Python 3 modules using Camoufox/Playwright (Instagram) and curl_cffi (TikTok)

### Data Flow
1. Python scrapers collect posts/profiles → write to SQLite (`data/peakr.db`)
2. Next.js API routes read from the same SQLite database
3. React client components fetch from API routes on mount

The database schema is defined in **both** `src/lib/db.ts` (auto-creates on first access) and `scraper/db.py` — these must stay in sync.

### Key Directories
- `src/app/dashboard/` — Main app pages (tracked accounts, explore, saved, analytics, account)
- `src/app/api/` — REST endpoints (profiles, explore, saved, track, search, export, analytics)
- `src/lib/db.ts` — SQLite connection singleton with schema initialization
- `src/lib/format.ts` — Number formatting and viral score display helpers
- `scraper/` — Python scraping modules with proxy support

### Database
- SQLite at `data/peakr.db` (gitignored), created automatically on first API call
- WAL mode + foreign keys enabled
- Tables: `profiles`, `posts`, `scrape_log`, `saved_posts`
- Posts are upserted via `ON CONFLICT(profile_id, platform_id)`

### Patterns
- All dashboard pages are client components (`'use client'`) using useState/useEffect for data fetching
- API routes use `getDb()` from `src/lib/db.ts` — a lazy singleton
- The `/api/track` route triggers the Python scraper via `execSync`
- No SWR/React Query — plain fetch with useCallback
- Styling uses Tailwind utilities with custom CSS vars (primary: `#6366f1`, accent: `#f59e0b`)
- `reactStrictMode` is disabled in `next.config.js`

### Scraper Infrastructure
- Instagram: Camoufox (Playwright-based) + SOCKS5 proxy at 127.0.0.1:1080
- TikTok: curl_cffi browser impersonation + WARP proxy
- Session cookies stored in `data/cookies/`
- `scraper/daemon.py` handles periodic re-scraping
