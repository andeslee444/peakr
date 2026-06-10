# Peakr

Track viral content on Instagram and TikTok. Find what's working, fast.

## Features

- **Track Public Accounts** — Monitor any public Instagram or TikTok creator
- **Viral Scores** — Engagement-based scoring that shows which posts outperform a creator's average
- **Hook Lab** — Analyze what makes top hooks work (transcript + AI hook analysis)
- **Playbook** — Generate personalized hook templates from the hooks you save
- **Save & Collections** — Bookmark patterns and organize them into collections
- **Export Data** — Download CSV/JSON for offline analysis

## Architecture

```
Vercel (Next.js)  ──────┐
                         ├──▶  AWS RDS PostgreSQL
Mac Mini (Python) ───────┘
```

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS v4 |
| Backend | Next.js API routes, PostgreSQL via `pg` pool (AWS RDS) |
| Auth | Auth.js v5 (TikTok OAuth + email/password), JWT sessions |
| Scraper | Python 3 daemon on a Mac Mini — Camoufox/Playwright (Instagram), curl_cffi + yt-dlp (TikTok) |
| Integrations | Resend (email), Stripe (billing), Sentry (errors) — all gated on env vars |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+ (for the scraper, run on the Mac Mini)
- A PostgreSQL database (`DATABASE_URL`)

### Install & Run

```bash
npm install
npm run dev            # dev server at localhost:3000

# Scraper deps (on the Mac Mini)
pip3 install --break-system-packages -r requirements.txt
brew install yt-dlp
```

### Commands

```bash
npm run dev        # Dev server
npm run build      # Production build
npm run start      # Production server
npm run lint       # ESLint (flat config, v9)
npm run test       # Vitest (watch)
npm run test:run   # Vitest (once)

python3 -m pytest                       # Python tests (Docker Postgres for db-marked tests)
python3 scraper/daemon.py               # Background scraping daemon (use the launchd plist in deploy/)
python3 -m scraper.tiktok @username     # Scrape a TikTok profile
python3 -m scraper.instagram @username  # Scrape an Instagram profile
```

## Environment Variables

**Web (`.env.local`)**: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TIKTOK_ID`, `AUTH_TIKTOK_SECRET`, `AUTH_URL`, `DEEPSEEK_API_KEY`. Optional integrations: `RESEND_API_KEY` + `EMAIL_FROM` (password reset), `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_MONTHLY`/`STRIPE_PRICE_ANNUAL` (billing), `SENTRY_DSN` (errors), `DATABASE_CA_CERT` (pin RDS TLS), `DATABASE_POOL_MAX`.

**Scraper (Mac Mini)**: `DATABASE_URL`, optionally `SENTRY_DSN`, `WORKER_ID`, AWS creds for S3.

## How It Works

1. User signs in (TikTok OAuth or email/password) → Auth.js JWT session.
2. User tracks a username → `POST /api/track` inserts a profile row and enqueues a scrape.
3. The Mac Mini daemon picks up new/stale profiles, scrapes metadata + posts, runs hook analysis, and writes to PostgreSQL. It records a heartbeat (`/api/worker-status` reports liveness).
4. Dashboard pages read from API routes.

### Viral Score

```
viral_score = (likes + comments) / avg(likes + comments) across all posts for that creator
```

A score of 2.0x means double the creator's typical engagement, normalizing across audience sizes.

### Dual schema

The schema is defined in **both** `src/lib/db.ts` (web) and `scraper/db.py` (daemon); both auto-create/migrate on first access and must stay in sync.

## Testing

- **Vitest** (`tests/`) — unit + route tests for the Next.js app.
- **pytest** (`scraper/tests/`) — pure-logic tests plus integration tests against a throwaway Dockerized Postgres (db-marked tests skip if Docker is unavailable). Production RDS is never used by tests.

## Operations

- Run the daemon under launchd using `deploy/com.peakr.daemon.plist` (KeepAlive restarts on crash).
- RDS hardening steps (password rotation, TLS, ingress lockdown, backups) are in `docs/runbooks/rds-hardening.md`.
- Pre-launch audit + remediation tracker: `LAUNCH-AUDIT.md` and `docs/superpowers/plans/2026-06-10-launch-hardening.md`.

## License

Private
