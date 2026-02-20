# Hook Lab — Complete Build Plan

> Comprehensive spec for transforming Peakr from a viral content tracker into a **hook intelligence platform**. Covers expanded AI analysis, Hook Lab page, seed creator pipeline, creator profiles, and personalized playbooks.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Expanded Analysis + Hook Lab Page](#phase-1-expanded-analysis--hook-lab-page)
3. [Phase 2: Seed Creator Pipeline + Daily Top Hooks](#phase-2-seed-creator-pipeline--daily-top-hooks)
4. [Phase 3: Creator Profile + Personalized Playbook](#phase-3-creator-profile--personalized-playbook)
5. [Navigation & Page Structure](#navigation--page-structure)
6. [Data Model — All New Tables & Columns](#data-model--all-new-tables--columns)
7. [API Endpoints — All New Routes](#api-endpoints--all-new-routes)
8. [Seed Creator List](#seed-creator-list)
9. [Hashtag Discovery List](#hashtag-discovery-list)
10. [File Change Summary](#file-change-summary)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        USERS                                 │
│  TikTok OAuth  |  Email/Password sign-in                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│              Vercel (Next.js 14 App Router)                   │
│                                                               │
│  Pages:                                                       │
│    /dashboard        — Tracked accounts overview              │
│    /dashboard/hook-lab — Hook feed + filters + flashcards     │
│    /dashboard/saved    — Bookmarked posts + saved hooks       │
│    /dashboard/playbook — Personalized hook templates          │
│    /dashboard/profile  — Creator profile wizard               │
│                                                               │
│  API Routes:                                                  │
│    /api/hook-lab       — Filterable hook feed                 │
│    /api/hook-lab/stats — Aggregate hook statistics            │
│    /api/video-url      — Proxied yt-dlp URL extraction        │
│    /api/creator-profile— CRUD + AI question generation        │
│    /api/saved-hooks    — Save/unsave hooks for playbook       │
│    /api/playbook       — Generate + retrieve playbook         │
│    /api/playbook/export— PDF/Markdown/DOCX export             │
│    /api/auth/[...nextauth] — TikTok OAuth + Credentials       │
│    (existing routes unchanged)                                │
└────────────────────────┬─────────────────────────────────────┘
                         │
                    AWS RDS PostgreSQL
                         │
┌────────────────────────▼─────────────────────────────────────┐
│              Mac Mini (Python Daemon)                          │
│                                                               │
│  Scraping:                                                    │
│    - User-tracked creators (existing, every 4 hours)          │
│    - Seed creators: full scrape every 3 days                  │
│    - Seed creators: daily top 50 most viral                   │
│    - Hashtag discovery pipeline (weekly)                       │
│                                                               │
│  Analysis:                                                    │
│    - Overnight batch at 4AM EST via Claude Max                │
│    - Staggered: 1 post every 30 seconds to avoid throttle     │
│    - On-demand queue (user opens InsightsPanel) — immediate   │
│                                                               │
│  Storage:                                                     │
│    - data/keyframes/{post_id}.jpg (first frame, ~50KB each)   │
│    - Served via /api/keyframe/[post_id] proxy route           │
│                                                               │
│  Video URL Cache:                                             │
│    - yt-dlp extracts CDN stream URLs on demand                │
│    - Cached in video_url_cache table (1-hour TTL)             │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Expanded Analysis + Hook Lab Page

### 1A. Expand the AI Prompt

**File: `scraper/hooks.py`**

Current output: `hook_type`, `hook_text`, `hook_visual`, `hook_explanation`, `hook_score`

**New output fields:**

| Field | Type | Example | Purpose |
|---|---|---|---|
| `hook_type` | string | "curiosity gap" | **Expanded** from 8 → 12 types (see below) |
| `hook_text` | string | "What if I told you..." | Opening words (unchanged) |
| `hook_visual` | string | "Face-to-camera with text overlay" | Visual description (unchanged) |
| `hook_explanation` | string | "Creates information gap..." | Why it works (unchanged) |
| `hook_score` | int | 8 | 1-10 rating (unchanged) |
| `niche` | string | "fitness" | AI-detected content category |
| `hook_format` | string | "face-to-camera" | Visual delivery method |
| `target_audience` | string | "gym beginners" | Who this hook is designed to stop |
| `emotional_trigger` | string | "curiosity" | Core emotion leveraged |
| `cta_type` | string \| null | "wait til end" | Payoff promise in hook, null if none |
| `hook_template` | string | "What if I told you [claim about topic]?" | Generalized reusable template |

**Expanded `hook_type` values (12 total):**
1. question
2. shock/surprise
3. curiosity gap
4. story opener
5. bold claim
6. visual spectacle
7. direct address
8. trend/sound
9. before/after
10. social proof
11. POV
12. tutorial/value

**Expanded `hook_format` values:**
- face-to-camera
- text-overlay
- b-roll-voiceover
- action-shot
- split-screen
- green-screen
- unboxing/reveal
- reaction/duet

**Expanded `emotional_trigger` values:**
- curiosity
- fear
- aspiration
- FOMO
- humor
- outrage
- relatability
- surprise
- empathy

**Niche values (15 to start):**
fitness, finance, business, beauty, food, comedy, lifestyle, health, fashion, tech, real-estate, education, motivation, travel, parenting

### 1B. Expanded HookAnalysis Type

**File: `src/lib/types.ts`**

```typescript
export interface HookAnalysis {
  // Existing fields
  hook_type: string;
  hook_text: string;
  hook_visual: string;
  hook_explanation: string;
  hook_score: number;
  // New fields
  niche: string;
  hook_format: string;
  target_audience: string;
  emotional_trigger: string;
  cta_type: string | null;
  hook_template: string;
}
```

All new fields go into the existing `hook_analysis` JSONB column. No schema migration needed for posts table.

### 1C. Profile Niche Rollup

**New column on `profiles` table:**

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_niche TEXT;
```

Daemon recalculates after each analysis pass:
```sql
UPDATE profiles SET primary_niche = (
  SELECT hook_analysis->>'niche'
  FROM posts
  WHERE profile_id = profiles.id AND analyzed_at IS NOT NULL
  GROUP BY hook_analysis->>'niche'
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE id IN (SELECT DISTINCT profile_id FROM posts WHERE analyzed_at IS NOT NULL);
```

### 1D. Hook Lab Page (Replaces Explore)

**Route: `/dashboard/hook-lab`**
**File: `src/app/dashboard/hook-lab/page.tsx` (new)**

This replaces the existing Explore page as the main content discovery hub.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Hook Lab                                                    │
│                                                              │
│  ┌─ Aggregate Stats Bar ──────────────────────────────────┐  │
│  │ 🔥 Top Hook: Curiosity Gap (8.2 avg)                  │  │
│  │ 📊 1,247 hooks analyzed  │  🏆 Best: Finance + Bold   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Filter Bar ───────────────────────────────────────────┐  │
│  │ [Hook Type ▾] [Niche ▾] [Format ▾] [Emotion ▾]       │  │
│  │ [Score ▾] [Platform ▾] [🔄 Flip All] [Analyzed Only]  │  │
│  │ [Search by username or description...]                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                           │
│  │     │ │ ╔══╗│ │     │ │     │   Cards in a grid.        │
│  │ 📷  │ │ 📝 ║│ │ 📷  │ │ 📷  │   Some flipped to show   │
│  │thumb│ │text ║│ │thumb│ │thumb│   hook analysis text.     │
│  │     │ │ ╚══╝│ │     │ │     │                           │
│  ├─────┤ ├─────┤ ├─────┤ ├─────┤                           │
│  │stats│ │stats│ │stats│ │stats│                           │
│  └─────┘ └─────┘ └─────┘ └─────┘                           │
│                                                              │
│  [Load More]                                                 │
└─────────────────────────────────────────────────────────────┘
```

**Flashcard mechanic:**
- Default: thumbnail front (like current cards)
- Click card thumbnail → CSS 3D flip animation (rotateY 180deg, 0.6s)
- Back side shows:
  - Hook template (large, prominent, copyable)
  - Hook type badge + score badge
  - Opening words quoted
  - Visual hook description
  - Why it works explanation
  - Emotional trigger + target audience tags
- Click again → flip back to thumbnail
- "Flip All" button → toggles all visible cards
- Bottom info area (username/stats) → opens InsightsPanel (same as Dashboard)

**Video hover-to-play (on thumbnail front side):**
1. User hovers thumbnail for 300ms (debounced)
2. Frontend calls `GET /api/video-url?url=<post_url>`
3. If success within 3s → replace `<Image>` with `<video src={cdnUrl} autoPlay muted loop playsInline />`
4. If fail/timeout → show play button overlay (▶️ icon)
5. On mouse leave → revert to `<Image>` thumbnail
6. On click → always `window.open(post_url, '_blank')`

### 1E. Video URL API Route

**Route: `GET /api/video-url`**
**File: `src/app/api/video-url/route.ts` (new)**

```
GET /api/video-url?url=https://tiktok.com/@user/video/123

Response:
{
  "video_url": "https://v16-webapp-prime.tiktok.com/video/...",
  "expires_at": "2026-02-20T06:00:00Z"
}
```

**Implementation:**
- Check `video_url_cache` table first (1-hour TTL)
- If cache miss, call Mac Mini daemon endpoint (new) or run yt-dlp via Node child_process
- Cache result in DB
- Limit: 1 concurrent extraction per user session

**New table:**
```sql
CREATE TABLE IF NOT EXISTS video_url_cache (
  id SERIAL PRIMARY KEY,
  post_url TEXT UNIQUE NOT NULL,
  video_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

### 1F. Keyframe Storage & Serving

**Storage location:** Mac Mini at `data/keyframes/{post_id}.jpg`

**During analysis pipeline** (`scraper/analyze.py`):
- After `extract_keyframes()`, copy the first keyframe to `data/keyframes/{post_id}.jpg`
- Add `keyframe_path` to the DB update (new column on posts or just convention-based path)

**Serving route: `GET /api/keyframe/[post_id]`**
**File: `src/app/api/keyframe/[post_id]/route.ts` (new)**

Returns the JPEG file. Falls back to thumbnail_url if keyframe doesn't exist.

Alternatively, since the Mac Mini stores them locally and Vercel can't access the filesystem, we have two options:
- **Option A**: Mac Mini runs a tiny HTTP server (e.g., Python `http.server` or Flask) that serves keyframes. Vercel proxies to it.
- **Option B**: Upload keyframes to S3 during analysis. Serve directly from S3/CloudFront.
- **Option C**: Store keyframes as base64 in a `keyframes` JSONB column on the posts table (50KB base64 = ~67KB stored, fine for PostgreSQL).

**Recommendation: Option C** for simplicity. No extra infrastructure. The daemon already writes to PostgreSQL. We add a `keyframe_base64` column and the frontend reads it directly.

### 1G. Update Dashboard Page

**File: `src/app/dashboard/page.tsx`**

Remove the "Top Performing Content" grid section entirely. Dashboard becomes:
- Tracked Accounts section (track form + account cards) — unchanged
- Quick stats summary (total tracked, total posts, total analyzed)
- "Go to Hook Lab →" CTA button

### 1H. Remove Explore Page

**File: `src/app/dashboard/explore/page.tsx`** → Delete or redirect to Hook Lab

### 1I. Auth: Add Email/Password Sign-in

**Files:**
- `src/app/api/auth/[...nextauth]/route.ts` — Add Credentials provider alongside TikTok
- `src/app/login/page.tsx` — Add email/password form alongside TikTok OAuth button
- `src/app/signup/page.tsx` — Update to create user with hashed password
- Use `bcrypt` for password hashing

### 1J. Re-Analyze Existing Posts

One-time daemon job:
```sql
UPDATE posts SET analyzed_at = NULL WHERE analyzed_at IS NOT NULL;
```
This resets all posts for re-analysis with the expanded prompt. Run overnight. The daemon will pick them up in priority order.

### 1K. Update InsightsPanel

**File: `src/components/InsightsPanel.tsx`**

Add new fields to the panel:
- Niche badge
- Hook format tag
- Target audience
- Emotional trigger
- CTA type
- Hook template (highlighted, copyable with a copy button)

---

## Phase 2: Seed Creator Pipeline + Daily Top Hooks

### 2A. Seed Creators Table

```sql
CREATE TABLE IF NOT EXISTS seed_creators (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  niche TEXT NOT NULL,
  tier TEXT DEFAULT 'seed',        -- 'seed' (curated) or 'discovered' (from hashtag pipeline)
  follower_count INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, platform)
);
```

Pre-populated with ~190 verified creators (see [Seed Creator List](#seed-creator-list) below).

Seed creators are auto-tracked by the daemon but do NOT appear in users' personal tracked lists. They feed the shared Hook Lab dataset.

### 2B. Daemon Scraping Schedule

**File: `scraper/daemon.py`** — Major expansion

```
┌──────────────────────────────────────────────────────────┐
│                    DAEMON SCHEDULE                        │
│                                                          │
│  EVERY 5 SECONDS:                                        │
│    ► Check scrape_queue (on-demand user requests)        │
│                                                          │
│  EVERY 60 SECONDS:                                       │
│    ► Refresh stale user-tracked profiles (>4 hours)      │
│    ► Run analysis pass (up to 5 posts)                   │
│                                                          │
│  DAILY at 12:00 AM EST:                                  │
│    ► Scrape top 50 most viral seed creators              │
│      (ranked by avg viral_score of recent posts)         │
│    ► Platform split: ~25 TikTok (30s delay) +            │
│                       ~25 Instagram (60s delay)          │
│    ► Total time: ~12 + 25 = ~37 minutes                  │
│                                                          │
│  EVERY 3 DAYS at 1:00 AM EST:                            │
│    ► Full scrape of ALL seed creators (~190)             │
│    ► TikTok: ~95 creators × 30s = ~48 minutes           │
│    ► Instagram: ~95 creators × 60s = ~95 minutes         │
│    ► Total time: ~2.5 hours                              │
│                                                          │
│  DAILY at 4:00 AM EST:                                   │
│    ► Overnight analysis batch                            │
│    ► Analyze all unanalyzed posts from seed creators     │
│    ► Route through Claude Max plan                       │
│    ► Rate: 1 post every 30 seconds                       │
│    ► ~50 posts/night = ~25 minutes                       │
│    ► Skip posts without transcripts                      │
│                                                          │
│  WEEKLY (Sunday 2:00 AM EST):                            │
│    ► Hashtag discovery pipeline                          │
│    ► Scrape top posts for each niche hashtag             │
│    ► Extract creators, rank by frequency                 │
│    ► Auto-add new high-frequency creators as seeds       │
│                                                          │
│  DAILY at 6:00 AM EST:                                   │
│    ► Compute daily top hooks ranking                     │
│    ► Update profile primary_niche rollup                 │
│    ► Clean expired video_url_cache entries               │
└──────────────────────────────────────────────────────────┘
```

### 2C. Daily Top Hooks Table

```sql
CREATE TABLE IF NOT EXISTS daily_top_hooks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  rank INTEGER,
  date DATE NOT NULL,
  niche TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, date)
);
```

**Ranking formula:** `hook_score × viral_score` (best hooks on most viral content)

Daily job:
1. Find all posts analyzed in last 24 hours (or since last run)
2. Rank by `hook_score * viral_score` DESC
3. Insert top 50 overall into `daily_top_hooks`
4. Insert top 10 per niche

### 2D. Hashtag Discovery Pipeline

**New file: `scraper/discover.py`**

Uses existing TikTok/Instagram scrapers to:
1. Fetch top posts for each niche hashtag (see [Hashtag List](#hashtag-discovery-list))
2. Extract the creator usernames from those posts
3. Count frequency (creators appearing on multiple trending hashtags = consistently viral)
4. Creators with 3+ appearances → auto-added to `seed_creators` with `tier='discovered'`

### 2E. Hook Lab API

**Route: `GET /api/hook-lab`**
**File: `src/app/api/hook-lab/route.ts` (new)**

```
GET /api/hook-lab?hook_type=curiosity+gap&niche=fitness&format=face-to-camera
    &emotion=curiosity&min_score=7&platform=tiktok&analyzed_only=true
    &sort=viral_score&page=1&limit=24

Response:
{
  "posts": [...],      // Posts with full hook_analysis
  "total": 847,
  "page": 1,
  "pages": 36
}
```

Supported filters:
- `hook_type` — comma-separated list
- `niche` — comma-separated list
- `format` — single value
- `emotion` — single value
- `min_score` / `max_score` — integer range
- `platform` — "tiktok", "instagram", "all"
- `analyzed_only` — boolean (default true)
- `sort` — "viral_score", "hook_score", "recent", "views"
- `search` — text search in username/description
- `page` / `limit` — pagination

**Route: `GET /api/hook-lab/stats`**
**File: `src/app/api/hook-lab/stats/route.ts` (new)**

```
Response:
{
  "total_analyzed": 1247,
  "avg_score_by_type": {
    "curiosity gap": 8.2,
    "bold claim": 7.5,
    ...
  },
  "best_niche_combo": { "niche": "finance", "hook_type": "bold claim", "avg_score": 8.7 },
  "top_hook_type": "curiosity gap",
  "posts_analyzed_today": 48,
  "niche_counts": { "fitness": 234, "finance": 198, ... }
}
```

### 2F. Hook Lab Components

**New files:**
- `src/components/HookCard.tsx` — Flippable card with 3D CSS transform
- `src/components/HookFilters.tsx` — Filter bar with dropdowns and toggles
- `src/components/HookStats.tsx` — Aggregate stats bar at top of Hook Lab
- `src/components/VideoHover.tsx` — Thumbnail with hover-to-play logic

**HookCard flip mechanic (CSS):**
```css
.card-container {
  perspective: 1000px;
}
.card-inner {
  transition: transform 0.6s;
  transform-style: preserve-3d;
}
.card-inner.flipped {
  transform: rotateY(180deg);
}
.card-front, .card-back {
  backface-visibility: hidden;
  position: absolute;
  width: 100%;
  height: 100%;
}
.card-back {
  transform: rotateY(180deg);
}
```

**VideoHover component behavior:**
1. `onMouseEnter` → start 300ms debounce timer
2. After 300ms → fetch `GET /api/video-url?url=<post_url>`
3. Set loading state (small spinner on thumbnail corner)
4. If response in <3s → mount `<video>` element with CDN URL, autoPlay muted loop playsInline
5. If timeout/error → show play button overlay (semi-transparent ▶️)
6. `onMouseLeave` → cancel timer, unmount video, show thumbnail
7. `onClick` → `window.open(post_url, '_blank')` (always)

---

## Phase 3: Creator Profile + Personalized Playbook

### 3A. Creator Profile Table

```sql
CREATE TABLE IF NOT EXISTS creator_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) UNIQUE,
  -- Round 1 answers (user-submitted)
  niche TEXT,
  content_style TEXT,              -- 'educational', 'entertaining', 'storytelling', 'motivational', 'mixed'
  target_audience TEXT,
  unique_angle TEXT,               -- "I'm a dentist who makes finance content"
  platforms JSONB,                 -- ["tiktok", "instagram"]
  inspiration_creators JSONB,      -- ["@garyvee", "@alexhormozi"]
  -- Round 2 answers (AI-generated questions + user responses)
  background_qa JSONB,             -- [{"q": "...", "a": "..."}, ...]
  -- Metadata
  onboarding_step TEXT DEFAULT 'not_started',  -- 'not_started', 'round1', 'round2', 'complete'
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3B. Creator Profile Page

**Route: `/dashboard/profile`**
**File: `src/app/dashboard/profile/page.tsx` (new)**

**UX flow:**

**Step 1 — Round 1 (6 questions):**
```
┌───────────────────────────────────────────────────┐
│  Tell us about your content                        │
│                                                    │
│  What's your niche/topic?                          │
│  [ Fitness ▾ ] (dropdown of 15 niches + "Other")   │
│                                                    │
│  What's your content style?                        │
│  ○ Educational  ○ Entertaining  ○ Storytelling     │
│  ○ Motivational  ○ Mix of styles                   │
│                                                    │
│  Who's your target audience?                       │
│  [________________________________]                │
│  e.g., "College students interested in investing"  │
│                                                    │
│  What's your unique angle or background?           │
│  [________________________________]                │
│  e.g., "I'm a nurse who teaches wellness"          │
│                                                    │
│  What platforms do you post on?                    │
│  ☑ TikTok  ☑ Instagram                            │
│                                                    │
│  Any creators you admire? (optional)               │
│  [________________________________]                │
│  e.g., "@alexhormozi, @melrobbins"                 │
│                                                    │
│  [Continue →]                                      │
└───────────────────────────────────────────────────┘
```

**Step 2 — AI generates Round 2 questions:**

API call: `POST /api/creator-profile/questions`
- Sends Round 1 answers to Claude
- Claude generates 4-6 tailored follow-up questions about their background
- Example: User says "I'm a personal trainer" →
  - "What's your training specialty (HIIT, strength, flexibility)?"
  - "What personal fitness transformation have you been through?"
  - "What myth in the fitness industry frustrates you most?"
  - "What's a surprising story from training clients?"
  - "What result do your clients value most?"

```
┌───────────────────────────────────────────────────┐
│  Let's personalize your playbook                   │
│                                                    │
│  Based on what you told us, we have a few more     │
│  questions to help generate better hook templates.  │
│                                                    │
│  [AI-generated question 1]                         │
│  [________________________________]                │
│                                                    │
│  [AI-generated question 2]                         │
│  [________________________________]                │
│                                                    │
│  [AI-generated question 3]                         │
│  [________________________________]                │
│                                                    │
│  [AI-generated question 4]                         │
│  [________________________________]                │
│                                                    │
│  [Complete Profile →]                              │
└───────────────────────────────────────────────────┘
```

**Step 3 — Profile complete → redirect to Playbook**

Profile can be edited anytime. Editing triggers playbook regeneration.

### 3C. Saved Hooks Table

```sql
CREATE TABLE IF NOT EXISTS saved_hooks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  post_id INTEGER REFERENCES posts(id),
  notes TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);
```

Different from `saved_posts` (which is for the content library). `saved_hooks` feeds the playbook.

**UI: "Save Hook" button** appears on Hook Lab cards (heart icon in top-right corner of the back/flipped side).

### 3D. Playbook Tables

```sql
CREATE TABLE IF NOT EXISTS playbook_sections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT,                        -- "Curiosity Gap Hooks for Fitness"
  hook_type TEXT,
  niche TEXT,
  templates JSONB,                   -- Generated script templates personalized to user
  source_post_ids JSONB,             -- Post IDs that inspired this section
  why_it_works TEXT,                 -- AI explanation of why these hooks work for THIS user
  generated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3E. Playbook Generation Logic

**Trigger:** When a user saves 3+ hooks of the same `hook_type` OR same `niche`:
1. System detects the pattern
2. Pulls the user's creator profile (niche, angle, audience, background)
3. Sends to Claude: "Generate 3 hook script templates for [hook_type] in [niche], personalized for a creator who [unique_angle] targeting [audience]. Their background: [background_qa]. Inspired by these hooks: [saved hook texts]."
4. Claude returns templates with placeholders adapted to the user's story
5. Stored in `playbook_sections`

**Regeneration:** Any time the user:
- Saves a new hook that affects an existing section
- Updates their creator profile
- Manually clicks "Regenerate" on a section

### 3F. Playbook Page

**Route: `/dashboard/playbook`**
**File: `src/app/dashboard/playbook/page.tsx` (new)**

```
┌─────────────────────────────────────────────────────────┐
│  Your Hook Playbook                      [Export ▾]     │
│  Based on 24 saved hooks + your creator profile          │
│                                                          │
│  ┌─ Curiosity Gap × Fitness ────────────────────────┐   │
│  │  Based on 5 saved hooks you liked                │   │
│  │                                                  │   │
│  │  Template 1:                                     │   │
│  │  "I tried [fitness method] for 30 days as a      │   │
│  │   [your background]... here's what happened      │   │
│  │   to my [specific metric]"                [📋]   │   │
│  │                                                  │   │
│  │  Template 2:                                     │   │
│  │  "Nobody told me [surprising fitness fact]       │   │
│  │   when I started [your journey]"          [📋]   │   │
│  │                                                  │   │
│  │  Template 3:                                     │   │
│  │  "Stop doing [common mistake] if you're          │   │
│  │   [target audience]. Here's why..."       [📋]   │   │
│  │                                                  │   │
│  │  💡 Why these work for YOU:                      │   │
│  │  Your background as [angle] makes the            │   │
│  │  transformation story especially compelling      │   │
│  │  for [target audience] because...                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ Bold Claim × Finance ──────────────────────────┐    │
│  │  Based on 3 saved hooks you liked               │    │
│  │  ...                                            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ No sections yet? ─────────────────────────────┐     │
│  │  Save 3+ hooks of the same type in Hook Lab    │     │
│  │  to generate your first playbook section.      │     │
│  │  [Go to Hook Lab →]                            │     │
│  └────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 3G. Export

**Route: `GET /api/playbook/export?format=pdf|markdown|docx`**

- **PDF**: Use `puppeteer` or `@react-pdf/renderer` to generate from HTML
- **Markdown**: Direct text generation (simplest)
- **DOCX**: Use `docx` npm package

Each export includes all playbook sections with templates, explanations, and source attribution.

---

## Navigation & Page Structure

```
Sidebar / Top Nav:
┌──────────────────────┐
│  🏠 Dashboard        │  ← Tracked accounts overview, quick stats
│  🔬 Hook Lab         │  ← Main feed + filters + flashcards (replaces Explore)
│  💾 Saved            │  ← Bookmarked posts + saved hooks
│  📖 Playbook         │  ← Personalized hook templates (Phase 3)
│                      │
│  ──────────────────  │
│  👤 Profile          │  ← Creator profile wizard (Phase 3)
│  ⚙️ Account          │  ← Existing account settings
└──────────────────────┘
```

---

## Data Model — All New Tables & Columns

### New columns on existing tables

```sql
-- profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_niche TEXT;

-- posts table (optional, for keyframe storage Option C)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS keyframe_base64 TEXT;
```

### New tables

```sql
-- Seed creator management
CREATE TABLE IF NOT EXISTS seed_creators (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  niche TEXT NOT NULL,
  tier TEXT DEFAULT 'seed',
  follower_count INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, platform)
);

-- Daily curated top hooks
CREATE TABLE IF NOT EXISTS daily_top_hooks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  rank INTEGER,
  date DATE NOT NULL,
  niche TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, date)
);

-- Video URL cache for hover-to-play
CREATE TABLE IF NOT EXISTS video_url_cache (
  id SERIAL PRIMARY KEY,
  post_url TEXT UNIQUE NOT NULL,
  video_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Creator profiles for personalization (Phase 3)
CREATE TABLE IF NOT EXISTS creator_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) UNIQUE,
  niche TEXT,
  content_style TEXT,
  target_audience TEXT,
  unique_angle TEXT,
  platforms JSONB,
  inspiration_creators JSONB,
  background_qa JSONB,
  onboarding_step TEXT DEFAULT 'not_started',
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved hooks for playbook (Phase 3, separate from saved_posts)
CREATE TABLE IF NOT EXISTS saved_hooks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  post_id INTEGER REFERENCES posts(id),
  notes TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- Playbook sections (Phase 3)
CREATE TABLE IF NOT EXISTS playbook_sections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT,
  hook_type TEXT,
  niche TEXT,
  templates JSONB,
  source_post_ids JSONB,
  why_it_works TEXT,
  generated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**IMPORTANT**: All tables must be added to BOTH `src/lib/db.ts` and `scraper/db.py` to maintain dual schema sync.

---

## API Endpoints — All New Routes

### Phase 1

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/hook-lab` | Filterable hook feed with pagination |
| GET | `/api/hook-lab/stats` | Aggregate statistics |
| GET | `/api/video-url` | Extract streaming URL via yt-dlp |
| GET | `/api/keyframe/[post_id]` | Serve first keyframe image |

### Phase 2

No additional API routes. Daemon handles scraping/analysis internally.

### Phase 3

| Method | Route | Purpose |
|---|---|---|
| GET/PUT | `/api/creator-profile` | Read/update creator profile |
| POST | `/api/creator-profile/questions` | AI generates Round 2 questions |
| GET/POST/DELETE | `/api/saved-hooks` | Save/unsave hooks for playbook |
| GET | `/api/playbook` | Retrieve all playbook sections |
| POST | `/api/playbook/regenerate` | Force regenerate a section |
| GET | `/api/playbook/export` | Export as PDF/Markdown/DOCX |

---

## Seed Creator List

### TikTok (~95 creators)

#### Fitness / Gym
| Username | Followers | Niche |
|---|---|---|
| sam_sulek | 2.6M | fitness |
| jeffnippard | ~1M | fitness |
| soheefit | 168K | fitness |
| blogilates | ~1.5M | fitness |
| syattfitness | ~800K | fitness |
| megsquats | ~500K | fitness |

#### Personal Finance / Investing
| Username | Followers | Niche |
|---|---|---|
| humphreytalks | 3.4M | finance |
| yourrichbff | 2.7M | finance |
| erikakullberg | ~3M | finance |
| herfirst100k | 2.4M | finance |
| austinhankwitz | 784K | finance |
| calltoleap | ~800K | finance |
| pricelesstay | 1M | finance |

#### Business / Entrepreneurship
| Username | Followers | Niche |
|---|---|---|
| ahormozi | 1.6M | business |
| realcodiesanchez | 2M | business |
| garyvee | 15.1M | business |
| melrobbins | 5.6M | business |
| simonsquibb | 7.8M | business |
| stevenbartlett | ~2M | business |

#### Beauty / Skincare
| Username | Followers | Niche |
|---|---|---|
| skincarebyhyram | 5.8M | beauty |
| dr.mamina | 1.2M | beauty |
| cassandrabankson | ~800K | beauty |
| jameswelsh | ~700K | beauty |
| doctorly | ~1.5M | beauty |
| dermdoctor | 17.8M | beauty |

#### Food / Cooking
| Username | Followers | Niche |
|---|---|---|
| halfbakedharvest | 876K | food |
| cooking4wifey | 1.3M | food |
| feelgoodfoodie | 2.1M | food |
| cooking_comedy_chaos | 749K | food |
| bdylanhollis | 10.2M | food |
| chefchrischo | 2.2M | food |

#### Comedy / Entertainment
| Username | Followers | Niche |
|---|---|---|
| mattcutshall | 1.6M | comedy |
| drewafualo | 8.1M | comedy |
| robynschallcomic | 765K | comedy |
| nataliecuomo | 506K | comedy |
| lucaszelnick | 739K | comedy |
| theandrewschulz | 4.9M | comedy |

#### Lifestyle / Vlogs
| Username | Followers | Niche |
|---|---|---|
| alixearle | 7.7M | lifestyle |
| tinx | 1.5M | lifestyle |
| valentinafradegrada | 1.5M | lifestyle |
| wishbonekitchen | ~1M | lifestyle |
| emmachamberlain | 536K | lifestyle |
| chrisolsen | ~800K | lifestyle |

#### Health / Wellness
| Username | Followers | Niche |
|---|---|---|
| doctormike | 2.7M | health |
| dr.karanr | 5.4M | health |
| therapyjeff | ~2M | health |
| nurse.john | 7.7M | health |
| jamesmitypt | ~1M | health |
| theguthealthdoctor | ~500K | health |

#### Fashion / Style
| Username | Followers | Niche |
|---|---|---|
| wisdomkaye | ~5.2M | fashion |
| oldloserinbrooklyn | 613K | fashion |
| raeannlangas | 638K | fashion |
| devanondeck | ~500K | fashion |
| davisburleson | 586K | fashion |
| kerifay | 539K | fashion |

#### Tech / Gadgets
| Username | Followers | Niche |
|---|---|---|
| tatechtips | 3.4M | tech |
| mrwhosetheboss | 2.5M | tech |
| mkbhd | 2.3M | tech |
| ijustine | 1.6M | tech |
| supersaf | ~500K | tech |
| aliabdaal | 379K | tech |

#### Real Estate
| Username | Followers | Niche |
|---|---|---|
| heider_realestate | 3.7M | real-estate |
| tatlondono | 2.7M | real-estate |
| ryanserhant | 1.3M | real-estate |
| glenndabaker | 875K | real-estate |
| zachloft | 1.8M | real-estate |
| seanlovesrealestate | 1.3M | real-estate |

#### Education / Study Tips
| Username | Followers | Niche |
|---|---|---|
| hankgreen1 | 7.2M | education |
| mndiaye_97 | 16M | education |
| aliabdaal | 379K | education |
| studyw.tok | 875K | education |
| creativeexplained | ~1M | education |

#### Motivation / Mindset
| Username | Followers | Niche |
|---|---|---|
| jayshetty | 6.1M | motivation |
| melrobbins | 5.6M | motivation |
| davidgoggins | 886K | motivation |
| andyfrisella | ~1M | motivation |
| lewishowes | ~1M | motivation |
| crystalstjohn | ~500K | motivation |

#### Travel
| Username | Followers | Niche |
|---|---|---|
| drewbinsky | ~4M | travel |
| florina_toma | 5.9M | travel |
| thebucketlistfamily | 514K | travel |
| heyshetravels | ~500K | travel |
| jordentually | ~1M | travel |
| backpackingkitty | 6M | travel |

#### Parenting / Family
| Username | Followers | Niche |
|---|---|---|
| dadchats | 2.9M | parenting |
| lauralove5514 | 7.6M | parenting |
| nycgaydad | 555K | parenting |
| krystianatiana | 8.3M | parenting |
| jordanpagefun | ~1M | parenting |
| makenziewaters | ~500K | parenting |

### Instagram (~95 creators)

#### Fitness / Gym
| Username | Followers | Niche |
|---|---|---|
| jeffnippard | 4M | fitness |
| hannaoeberg | 2M | fitness |
| whitneysimmons | 4M | fitness |
| noeldeyzel_bodybuilder | 6.6M | fitness |
| natacha.oceane | 1M | fitness |
| sam_sulek | 7M | fitness |
| cbum | 26M | fitness |

#### Personal Finance / Investing
| Username | Followers | Niche |
|---|---|---|
| humphreytalks | 849K | finance |
| personalfinanceclub | 693K | finance |
| moneywithkatie | 326K | finance |
| your.richbff | 4M | finance |
| grahamstephan | 1.5M | finance |
| calebhammercomposer | 500K | finance |

#### Business / Entrepreneurship
| Username | Followers | Niche |
|---|---|---|
| garyvee | 11M | business |
| hormozi | 4M | business |
| codiesanchez | 3M | business |
| leilahormozi | 1M | business |

#### Beauty / Skincare
| Username | Followers | Niche |
|---|---|---|
| mikaylajmakeup | 4M | beauty |
| glamzilla | 1M | beauty |
| hyram | 738K | beauty |
| doctorly | 1.2M | beauty |
| james_s_welsh | 410K | beauty |

#### Food / Cooking
| Username | Followers | Niche |
|---|---|---|
| the_pastaqueen | 5.7M | food |
| halfbakedharvest | 5M | food |
| joshuaweissman | 1.3M | food |
| rainbowplantlife | 1M | food |

#### Comedy / Entertainment
| Username | Followers | Niche |
|---|---|---|
| khaby00 | 78M | comedy |
| trevorwallace | 5M | comedy |
| calebwsimpson | 3M | comedy |
| drewafualo | 880K | comedy |
| thebrokeagent | 545K | comedy |

#### Lifestyle / Vlogs
| Username | Followers | Niche |
|---|---|---|
| zachking | 29M | lifestyle |
| emmachamberlain | 14.5M | lifestyle |
| tinx | 642K | lifestyle |
| best.dressed | 1.4M | lifestyle |
| taramilktea | ~1.2M | lifestyle |

#### Health / Wellness
| Username | Followers | Niche |
|---|---|---|
| hubermanlab | 8M | health |
| doctor.mike | 5.2M | health |
| thebodycoach | 4.8M | health |
| drjuliesmith | 4.8M | health |
| drmarkhyman | 1.5M | health |
| melissawoodhealth | 342K | health |

#### Fashion / Style
| Username | Followers | Niche |
|---|---|---|
| wisdm | 8M | fashion |
| marta__sierra | 1M | fashion |
| best.dressed | 1.4M | fashion |
| monikh | 386K | fashion |
| jessicawang | ~1.6M | fashion |

#### Tech / Gadgets
| Username | Followers | Niche |
|---|---|---|
| mkbhd | 5.2M | tech |
| unboxtherapy | 2.9M | tech |
| ijustine | 1.7M | tech |
| austinevans | 507K | tech |
| supersaf | 3M | tech |

#### Real Estate
| Username | Followers | Niche |
|---|---|---|
| ryanserhant | 2.7M | real-estate |
| grahamstephan | 1.5M | real-estate |
| neeldhingra | 190K | real-estate |
| thebrokeagent | 545K | real-estate |
| loidavelas | 33K | real-estate |

#### Education / Study Tips
| Username | Followers | Niche |
|---|---|---|
| aliabdaal | 1.1M | education |
| studyquill | 247K | education |
| jayshetty | 18.2M | education |
| hubermanlab | 8M | education |

#### Motivation / Mindset
| Username | Followers | Niche |
|---|---|---|
| jayshetty | 18.2M | motivation |
| melrobbins | 12M | motivation |
| lewishowes | 4.7M | motivation |
| lisabilyeu | 843K | motivation |
| hormozi | 4M | motivation |
| tombilyeu | ~4M | motivation |

#### Travel
| Username | Followers | Niche |
|---|---|---|
| chrisburkard | 3.9M | travel |
| lexielimitless | 1.7M | travel |
| drewbinsky | 1.4M | travel |
| doyoutravel | 2.5M | travel |
| karaandnate | 1.2M | travel |
| lostleblanc | 718K | travel |
| muradosmann | 4M | travel |

#### Parenting / Family
| Username | Followers | Niche |
|---|---|---|
| busytoddler | 2.4M | parenting |
| dadadvicefrombo | 5M | parenting |
| mrchazz | 733K | parenting |
| kristinakuzmic | ~1M | parenting |
| mothercould | 2M | parenting |
| jerricasannes | 282K | parenting |

---

## Hashtag Discovery List

### TikTok Hashtags by Niche

| Niche | Hashtags |
|---|---|
| fitness | #GymTok, #FitTok, #WorkoutRoutine, #GymRat, #GymMotivation, #FitnessJourney, #LiftTok, #PersonalTrainer |
| finance | #MoneyTok, #FinTok, #PersonalFinance, #Investing, #BudgetTok, #FinanceTips, #SideHustle, #MoneyTips |
| business | #BizTok, #SmallBusiness, #EntrepreneurLife, #StartupLife, #BusinessTips, #SideHustle, #OnlineBusiness, #FounderLife |
| beauty | #BeautyTok, #SkinTok, #SkincareRoutine, #BeautyHacks, #MakeupTutorial, #GRWM, #GlowUp, #Skincare |
| food | #FoodTok, #TikTokFood, #EasyRecipes, #TikTokEats, #HomeChef, #CookingTikTok, #RecipeTok, #AirFryerSnacks |
| comedy | #Comedy, #Funny, #Humor, #FunnyVideos, #TikTokFunny, #ComedySketch, #Relatable, #Skit |
| lifestyle | #DayInMyLife, #DayInTheLife, #GRWM, #LifestyleTok, #Vlog, #DailyVlog, #Aesthetic, #ThatGirlRoutine |
| health | #WellnessTok, #HealthTok, #MentalHealthMatters, #SelfCare, #HolisticHealth, #GutHealth, #Mindfulness, #HealthyLifestyle |
| fashion | #FashionTok, #OOTD, #GRWM, #OutfitIdeas, #StreetWear, #StyleInspo, #FashionTikTok, #ThriftTok |
| tech | #TechTok, #TechReview, #GadgetTok, #TechGadgets, #iPhone, #AI, #CodingTikTok, #SetupTour |
| real-estate | #RealEstateTok, #HouseTour, #DreamHome, #RealEstateAgent, #HouseHunting, #FirstTimeHomeBuyer, #LuxuryRealEstate, #JustListed |
| education | #StudyTok, #EduTok, #LearnOnTikTok, #BookTok, #StudyWithMe, #TeacherTok, #StudyTips, #CollegeLife |
| motivation | #MotivationTok, #Mindset, #SuccessMindset, #DailyMotivation, #GrindTok, #SelfImprovement, #LevelUp |
| travel | #TravelTok, #TravelTips, #HiddenGems, #BucketList, #SoloTravel, #LuxuryTravel, #Wanderlust, #DigitalNomad |
| parenting | #MomTok, #DadTok, #ParentingTok, #MomLife, #NewMom, #ParentingHacks, #ToddlerLife, #FamilyTime |

### Instagram Hashtags by Niche

| Niche | Hashtags |
|---|---|
| fitness | #FitFam, #FitnessMotivation, #GymLife, #WorkoutRoutine, #StrengthTraining, #Fitspo, #FitnessJourney, #GymGoals |
| finance | #FinancialFreedom, #InvestingTips, #PersonalFinance, #BudgetingTips, #MoneyMindset, #FinancialLiteracy, #DebtFreeCommunity, #FIRE |
| business | #EntrepreneurJourney, #SmallBizInspo, #BusinessGrowth, #StartupJourney, #GrowYourBrand, #BusinessOwner, #ScalingUp, #DigitalMarketing |
| beauty | #SkincareRoutine, #BeautyTips, #GlowingSkin, #MakeupLook, #SkincareProducts, #InstaBeauty, #SelfCare, #AntiAging |
| food | #Foodie, #InstaFood, #FoodPhotography, #HomeCooking, #FoodBlogger, #Foodstagram, #EasyRecipes, #HealthyFood |
| comedy | #FunnyMemes, #ComedyReels, #FunnyVideos, #Memes, #MemesDaily, #Humor, #InstagramComedy, #ReelsFunny |
| lifestyle | #LifestyleBlogger, #DailyRoutine, #LifestyleReels, #InstaLife, #SlowLiving, #EverydayLife, #LifestyleContent, #Aesthetic |
| health | #WellnessJourney, #HealthyLifestyle, #MentalHealth, #SelfCare, #HolisticHealth, #Wellbeing, #MindBodySoul, #HealthyLiving |
| fashion | #OOTD, #FashionBlogger, #StyleInspo, #InstaFashion, #FashionReels, #LookOfTheDay, #StreetStyle, #SustainableFashion |
| tech | #TechNews, #Gadgets, #TechGadgets, #ArtificialIntelligence, #CoolGadgets, #SmartHome, #TechReview |
| real-estate | #RealEstate, #Realtor, #RealtorLife, #HomeForSale, #LuxuryHomes, #RealEstateInvesting, #JustSold, #DreamHome |
| education | #StudyGram, #StudyMotivation, #StudyTips, #Education, #LearningEveryday, #StudentLife, #BookStagram, #AcademicLife |
| motivation | #MotivationalQuotes, #Mindset, #SuccessQuotes, #InspirationalQuotes, #GoalSetting, #PositiveVibes, #GrowthMindset |
| travel | #TravelGram, #TravelPhotography, #Wanderlust, #InstaTravel, #TravelBlogger, #ExploreMore, #Adventure, #TravelReels |
| parenting | #MomsOfInstagram, #MomLife, #Motherhood, #ParentingTips, #FamilyFirst, #MomBlogger, #NewMom, #FamilyTime |

---

## File Change Summary

### Phase 1 — Files to modify/create

| File | Action | Description |
|---|---|---|
| `scraper/hooks.py` | Modify | Expand prompt with 6 new fields, 12 hook types |
| `scraper/analyze.py` | Modify | Save first keyframe to data/keyframes/ or base64 |
| `scraper/db.py` | Modify | Add primary_niche column, niche rollup query, new tables |
| `src/lib/db.ts` | Modify | Add primary_niche column, video_url_cache table, new tables |
| `src/lib/types.ts` | Modify | Expand HookAnalysis type with new fields |
| `src/app/api/hook-lab/route.ts` | **New** | Filterable hook feed endpoint |
| `src/app/api/hook-lab/stats/route.ts` | **New** | Aggregate statistics endpoint |
| `src/app/api/video-url/route.ts` | **New** | yt-dlp video URL extraction |
| `src/app/api/keyframe/[post_id]/route.ts` | **New** | Serve keyframe images |
| `src/app/dashboard/hook-lab/page.tsx` | **New** | Hook Lab page (replaces Explore) |
| `src/components/HookCard.tsx` | **New** | Flippable card component |
| `src/components/HookFilters.tsx` | **New** | Filter bar component |
| `src/components/HookStats.tsx` | **New** | Aggregate stats bar |
| `src/components/VideoHover.tsx` | **New** | Thumbnail with hover-to-play |
| `src/components/InsightsPanel.tsx` | Modify | Show expanded analysis fields |
| `src/components/HookBadge.tsx` | Modify | New badges for niche, format, emotion |
| `src/app/dashboard/page.tsx` | Modify | Remove post grid, keep tracked accounts only |
| `src/app/dashboard/explore/page.tsx` | Delete | Replaced by Hook Lab |
| `src/app/api/auth/[...nextauth]/route.ts` | Modify | Add Credentials provider |
| `src/app/login/page.tsx` | Modify | Add email/password form |
| `src/app/signup/page.tsx` | Modify | Hash password on signup |
| Dashboard layout/sidebar | Modify | Update navigation links |

### Phase 2 — Files to modify/create

| File | Action | Description |
|---|---|---|
| `scraper/daemon.py` | Modify | Add scheduled seed scraping, overnight analysis, daily ranking |
| `scraper/discover.py` | **New** | Hashtag discovery pipeline |
| `scraper/db.py` | Modify | Add seed_creators, daily_top_hooks tables and queries |
| `src/lib/db.ts` | Modify | Add seed_creators, daily_top_hooks tables |
| `data/seed_creators.json` | **New** | Initial seed creator data for bulk import |

### Phase 3 — Files to modify/create

| File | Action | Description |
|---|---|---|
| `src/app/api/creator-profile/route.ts` | **New** | CRUD for creator profile |
| `src/app/api/creator-profile/questions/route.ts` | **New** | AI-generated Round 2 questions |
| `src/app/api/saved-hooks/route.ts` | **New** | Save/unsave hooks |
| `src/app/api/playbook/route.ts` | **New** | Retrieve playbook sections |
| `src/app/api/playbook/regenerate/route.ts` | **New** | Force regenerate section |
| `src/app/api/playbook/export/route.ts` | **New** | PDF/Markdown/DOCX export |
| `src/app/dashboard/profile/page.tsx` | **New** | Creator profile wizard |
| `src/app/dashboard/playbook/page.tsx` | **New** | Playbook page |
| `src/lib/db.ts` | Modify | Add creator_profiles, saved_hooks, playbook_sections tables |
| `scraper/db.py` | Modify | Add same tables |
| Hook Lab cards | Modify | Add "Save Hook" button on flipped side |

---

## Implementation Order

### Phase 1 (Expanded Analysis + Hook Lab)
1. Expand `scraper/hooks.py` prompt → test with a few posts
2. Update `src/lib/types.ts` HookAnalysis type
3. Add `primary_niche` column to both DB schemas
4. Build `/api/hook-lab` and `/api/hook-lab/stats` endpoints
5. Build HookCard, HookFilters, HookStats components
6. Build Hook Lab page (`/dashboard/hook-lab`)
7. Build VideoHover component + `/api/video-url` endpoint
8. Update InsightsPanel with new fields
9. Update Dashboard page (remove post grid)
10. Delete Explore page, update nav
11. Add email/password auth
12. Re-analyze existing posts overnight
13. Build keyframe storage + serving

### Phase 2 (Seed Pipeline)
1. Create seed_creators table, bulk import from seed list
2. Build daemon scheduled scraping (daily top 50, 3-day full cycle)
3. Build overnight analysis batch job (4AM EST)
4. Build daily top hooks ranking job
5. Build hashtag discovery pipeline
6. Wire seed creator data into Hook Lab feed

### Phase 3 (Profiles + Playbook)
1. Create creator_profiles, saved_hooks, playbook_sections tables
2. Build creator profile API + wizard page
3. Build AI Round 2 question generation
4. Build saved-hooks API + UI on Hook Lab cards
5. Build playbook generation logic
6. Build playbook page
7. Build export functionality (PDF, Markdown, DOCX)
