# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint (flat config, v9)
```

Python scraper (requires Python 3.10+ and dependencies):
```bash
pip3 install --break-system-packages curl_cffi 'camoufox[geoip]' psycopg2-binary
brew install yt-dlp  # or pip3 install yt-dlp

python3 -m scraper.tiktok @username       # Scrape TikTok profile
python3 -m scraper.instagram @username    # Scrape Instagram profile
python3 -m scraper.instagram --login      # Interactive login for session cookies
python3 scraper/daemon.py                 # Background re-scraping daemon
```

No test framework is configured.

## Architecture

**Peakr** is a viral content tracker for Instagram and TikTok.

```
Vercel (Next.js)  ──────┐
                         ├──▶  AWS RDS PostgreSQL
Mac Mini (Python) ───────┘
```

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS v4
- **Backend**: Next.js API routes + PostgreSQL (AWS RDS via `pg` pool)
- **Auth**: Auth.js v5 (next-auth@beta) with TikTok OAuth provider, JWT sessions
- **Scraper**: Python 3 modules using Camoufox/Playwright (Instagram) and curl_cffi + yt-dlp (TikTok), psycopg2 for DB

### Data Flow
1. User signs in via TikTok OAuth → Auth.js JWT session
2. User submits a username via the dashboard Track form
3. `POST /api/track` inserts a profile row into PostgreSQL (no Python subprocess)
4. Mac Mini daemon picks up profiles with `last_scraped_at IS NULL` or stale (>4 hours)
5. Daemon scrapes profile metadata + posts, writes to PostgreSQL
6. Dashboard fetches from API routes which read from PostgreSQL

### Dual Schema Warning
The database schema is defined in **both** `src/lib/db.ts` (auto-creates on first Node access) and `scraper/db.py` (auto-creates on first Python import). These must stay in sync.

### Database
- PostgreSQL on AWS RDS, connected via `DATABASE_URL` env var
- Tables: `users`, `profiles`, `posts`, `scrape_log`, `saved_posts`
- Posts are upserted via `ON CONFLICT(profile_id, platform_id)`
- `is_video` is a native `BOOLEAN` column
- `users` table stores TikTok OAuth users (tiktok_id as unique key)

### Auth
- Auth.js v5 with TikTok provider (`next-auth/providers/tiktok`)
- JWT session strategy — no database sessions
- `signIn` callback upserts user in `users` table
- `jwt` callback attaches `userId` and `username` to token
- Middleware protects `/dashboard/*` routes, redirects to `/login`
- Env vars: `AUTH_SECRET`, `AUTH_TIKTOK_ID`, `AUTH_TIKTOK_SECRET`, `AUTH_URL`

### Viral Score Formula
```
viral_score = (likes + comments) / avg(likes + comments) across all posts for that creator
```
A score of 2.0x means the post got double the creator's typical engagement. This normalizes across creators with different audience sizes.

### Key Patterns
- Import alias: `@/*` maps to `./src/*`
- All dashboard pages are client components (`'use client'`) using useState/useEffect for data fetching
- API routes use `getPool()` from `src/lib/db.ts` — a lazy `pg.Pool` singleton
- No SWR/React Query — plain fetch with useCallback
- Styling uses Tailwind utilities with custom CSS vars (primary: `#6366f1`, accent: `#f59e0b`)
- `reactStrictMode` is disabled in `next.config.js`
- `serverExternalPackages: ['pg']` in next.config.js prevents webpack bundling issues

### Scraper Infrastructure
- Instagram: Camoufox (Playwright-based stealth browser) + SOCKS5 proxy at 127.0.0.1:1080. Falls back through multiple extraction strategies (API intercept, GraphQL, page source, meta tags). Supports optional login sessions stored in `data/cookies/`.
- TikTok: curl_cffi browser impersonation for profile metadata from embedded `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON. Video data fetched via yt-dlp for request signing.
- `scraper/daemon.py` re-scrapes stale profiles (>4 hours old) and newly tracked profiles (`last_scraped_at IS NULL`) with rate limiting and jitter
- Scraper uses `psycopg2` with `RealDictCursor` to connect to the same RDS instance via `DATABASE_URL`
