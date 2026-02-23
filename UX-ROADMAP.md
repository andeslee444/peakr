# Peakr UX Roadmap

> Comprehensive UX audit findings and feature roadmap based on a full walkthrough of every page, API route, database table, and live user session. Last updated: February 2026.

### Completion Status

| Priority | Feature | Status |
|----------|---------|--------|
| P0 #1 | Guided Onboarding Flow | DONE |
| P0 #2 | Make Hook Lab the Default Landing | DONE |
| P0 #3 | Fix Analytics Scoping & Calculation | DONE |
| P1 #4 | Trending Hooks / Discovery Feed | DONE |
| P1 #5 | Niche-Filtered Default Views | DONE |
| P1 #6 | Hook Collections / Folders | DONE |
| P1 #7 | "Create Content" Workflow | DONE |
| P1 #8 | Real Notifications | DONE |
| P2 #9 | Side-by-Side Hook Comparison | DONE |
| P2 #10 | Hook Remix / Adaptation | DONE |
| P2 #11 | Creator Deep Dive Page | DONE |
| P2 #12 | Mobile-Responsive Polish | DONE |
| P2 #13 | Sound/Audio Trending | DONE |
| P2 #14 | Posting Schedule Insights | DONE |

---

## Table of Contents

- [Product Overview](#product-overview)
- [Current User Journey Map](#current-user-journey-map)
- [UX Audit Findings](#ux-audit-findings)
- [Feature Roadmap](#feature-roadmap)
- [Architecture Reference](#architecture-reference)

---

## Product Overview

**Peakr** is a content intelligence platform for Instagram and TikTok creators. It answers the question: *"Why does certain content go viral?"*

Unlike analytics tools that show what happened (views, likes), Peakr analyzes **why** content performs — extracting hook patterns, scoring viral potential, and generating personalized scripts.

### Core Value Loop

```
Track competitors → AI analyzes their hooks → Save winning patterns → Generate your own scripts
```

### Target Users

| Persona | Need | Primary Feature |
|---------|------|-----------------|
| Beginner creators | "What even works?" | Hook Lab (browse 300+ analyzed hooks) |
| Intermediate creators | "How do I make my hooks better?" | Playbook (AI-generated scripts from saved patterns) |

### What Makes It Different

- **Hook pattern deduplication** — the same hook template used by different creators is recognized and aggregated with cross-creator stats
- **Viral score normalization** — `(likes + comments) / avg(likes + comments)` per creator, so a 2.0x score means double that creator's typical engagement regardless of audience size
- **AI analysis pipeline** — every analyzed post gets: hook type, hook text, visual description, explanation of why it works, emotional trigger, niche, format, template extraction, and score (1-10)

---

## Current User Journey Map

### Ideal Flow (designed)

```
Landing Page → Sign Up → Profile Setup → Get Creator Suggestions → Track Them
    → Browse Hook Lab → Save Patterns → Generate Playbook
```

### Actual Flow (observed)

```
Landing Page → Sign Up → Empty Dashboard → Confusion → Maybe Track Someone
    → Wait for Scraping → Maybe Discover Hook Lab → Maybe Find Profile Page
```

### Page-by-Page Walkthrough

| Step | Page | What Happens | UX Grade |
|------|------|-------------|----------|
| 1 | Landing (`/`) | Clear value prop, pain points section, pricing tiers. "Go Viral with Competitive Insights." | B+ |
| 2 | Login (`/login`) | Email/password + TikTok OAuth. Clean form. | B+ |
| 3 | Dashboard (`/dashboard`) | **Empty state**: just a text input "Enter username..." and zero guidance. 6-page sidebar is overwhelming with no data anywhere. | D |
| 4 | Hook Lab (`/dashboard/hook-lab`) | 303 analyzed hooks, flippable cards, rich filters, AI breakdowns. The best feature — but it's the 2nd sidebar item. | A- |
| 5 | My Hooks (`/dashboard/saved`) | Saved patterns with expandable examples. "Import Video" feature at top. Feels sparse with few saves. | C+ |
| 6 | Playbook (`/dashboard/playbook`) | AI-generated scripts based on saved hooks + niche. Blocked until profile is complete. | B (when working) |
| 7 | Profile (`/dashboard/profile`) | 3-step onboarding flow. Niche picker, AI suggestions, creator recommendations. Buried as 5th sidebar item. | B (content), D (discoverability) |
| 8 | Account (`/dashboard/account`) | Shows user info and account stats. Bare minimum. | C |

### What Works Well

- **Landing page to login**: Value prop is clear, login options are appropriate for the audience
- **Hook Lab**: Genuinely impressive — flippable cards, rich filters, AI analysis, pattern saving
- **AI hook analysis**: Hook type, score, why it works, template extraction, deduplication into patterns
- **Hook pattern system**: Global deduplication means the same hook used by different creators is recognized and aggregated
- **Playbook generation**: Personalized scripts from saved patterns + user's niche/style

---

## UX Audit Findings

### Critical: Empty State Paralysis

**Problem**: After signup, users land on a nearly empty dashboard with just a text input and zero guidance. The 6-page sidebar is overwhelming when there's no data anywhere. A new user clicking through Tracked (empty) → Hook Lab (has seed data but no context) → My Hooks (empty) → Playbook (blocked) → Profile (blank form) → Account (bare) will bounce.

**Evidence**: Dashboard screenshot shows only "Enter a username..." input and "Posts from Tracked Accounts" with nothing loaded.

**Impact**: First-session churn. Users never discover the actual product (Hook Lab + Playbook).

**Affected files**: `src/app/dashboard/page.tsx`, `src/app/dashboard/layout.tsx`

---

### Critical: No Onboarding Flow

**Problem**: The Profile page has a 3-step onboarding (niche → suggestions → complete), but it's buried as the 5th sidebar item. A new user has no reason to click "Profile" first. The ideal flow should be: Profile setup → get creator suggestions → track them → browse Hook Lab → save hooks → generate playbook. Nothing guides users through this.

**Evidence**: Profile page contains the full onboarding flow with niche picker, AI-generated creator suggestions, and "Track Creator" buttons — but users have to discover it themselves.

**Affected files**: `src/app/dashboard/profile/page.tsx`, `src/app/dashboard/layout.tsx`

---

### Critical: Hook Lab Is the Real Product But Hidden

**Problem**: Hook Lab has 303 analyzed hooks from 174 seed creators, flippable cards, rich filters, and AI breakdowns — it's the most impressive feature. But it's positioned as a secondary tool behind "Tracked" (a utility feature). A new user might never discover it.

**Evidence**: Hook Lab is the 2nd item in the sidebar. The default landing is the empty Tracked page.

**Affected files**: `src/app/dashboard/layout.tsx` (sidebar order), `src/app/dashboard/page.tsx` (default route)

---

### High: Confusing Naming and Information Architecture

**Problem**: The distinction between pages is unclear:
- "Tracked" vs "Hook Lab" — Tracked shows posts from YOUR accounts. Hook Lab shows posts from seed creators + tracked accounts WITH analysis. The difference is non-obvious.
- "My Hooks" sounds like hooks the user wrote, not patterns they saved.
- "Playbook" is vague — could be a strategy doc, templates, or scripts.
- Two sidebar items both use the hook emoji (🪝), making them visually identical.

**Affected files**: `src/app/dashboard/layout.tsx` (sidebar labels and icons)

---

### High: Analytics Page Shows Wrong Data

**Problem**: The analytics page shows 75 "Tracked Accounts" when the user only tracks 3 — it's showing ALL profiles in the database (seed creators + user-tracked), not just the user's tracked accounts. Engagement rate of 109.4% for one creator is clearly a calculation bug. The page isn't accessible from the sidebar.

**Evidence**: Database query confirmed 75 total profiles vs 3 user-tracked profiles.

**Affected files**: `src/app/dashboard/analytics/page.tsx`, `src/app/api/analytics/route.ts`

---

### Medium: "Upgrade to Pro" CTA Has No Destination

**Problem**: The sidebar upgrade button and pricing page CTAs don't connect to any payment flow. Users who click "Go Viral" or "Upgrade" hit dead ends.

**Affected files**: `src/app/dashboard/layout.tsx` (sidebar CTA), `src/components/Pricing.tsx`

---

### Medium: Profile Page Is Disconnected

**Problem**: The completed profile view shows raw text with no visual hierarchy. "View Your Playbook" is the only action. No connection shown between profile data and what it actually powers (personalized suggestions, playbook generation).

**Affected files**: `src/app/dashboard/profile/page.tsx`

---

### Medium: My Hooks Lacks Context

**Problem**: Each saved pattern shows "1 example" for all hooks. The expand interaction (chevron) is subtle and the value of expanding is unclear. The "Import Video" feature at the top is powerful but unexplained.

**Affected files**: `src/app/dashboard/saved/page.tsx`

---

### Low: My Hooks Page Performance

**Problem**: During testing, navigating to `/dashboard/saved` caused multiple timeouts (60s, 90s, 120s). The page eventually loaded after a dev server restart, suggesting a performance or data-loading issue.

**Affected files**: `src/app/dashboard/saved/page.tsx`, `src/app/api/user-hooks/route.ts`

---

## Feature Roadmap

### P0 — Critical for User Retention

#### 1. Guided Onboarding Flow — DONE

**Problem**: New users land on an empty dashboard with no guidance. The profile/onboarding flow is buried 5 clicks deep. Users churn before discovering Hook Lab or the playbook.

**Solution**: After signup, immediately route to a focused onboarding wizard:
- Step 1: "What's your niche?" (quick profile setup — reuse existing `creator_profiles` form)
- Step 2: "Here are creators in your space" (auto-suggest via existing `/api/creator-profile/suggestions` + one-click track)
- Step 3: "Check out what's working" (land in Hook Lab, filtered to their niche)
- Skip the empty dashboard entirely until they have data

**Acceptance criteria**:
- [x] New users (no `creator_profiles` record or `onboarding_step != 'complete'`) are redirected to onboarding
- [x] Onboarding flow reuses existing profile form fields and suggestion API
- [x] After onboarding, user lands in Hook Lab filtered to their niche
- [x] Returning users bypass onboarding and go to their normal landing page
- [x] User can skip onboarding and go to dashboard directly

**What was done**:
- `src/app/dashboard/layout.tsx` — added one-time onboarding check on mount; fetches `/api/creator-profile` and redirects to `/dashboard/profile` if `onboarding_step !== 'complete'` (skips check if already on profile page; uses ref to avoid re-checking on navigation)
- `src/app/dashboard/profile/page.tsx` — after completing onboarding (suggestions step), redirects to `/dashboard/hook-lab?niche={niche}` instead of showing profile summary; added "Skip for now" button below the Continue button on the round1 form that marks onboarding complete and goes to Hook Lab
- `src/app/dashboard/hook-lab/page.tsx` — reads `?niche=` from URL params on mount and applies as initial filter; existing filter UI shows it as active so user can clear it

---

#### 2. Make Hook Lab the Default Landing — DONE

**Problem**: The dashboard default page shows tracked accounts, which is empty for new users. Hook Lab always has content (303+ analyzed hooks from seed creators) and is the most compelling feature.

**Solution**: Change the default dashboard route to Hook Lab. Move "Tracked Accounts" to a secondary position in the sidebar.

**Acceptance criteria**:
- [x] `/dashboard` redirects to `/dashboard/hook-lab` (server-side redirect)
- [x] Sidebar reorders: Hook Lab first, Tracked Accounts second
- [x] My Hooks icon changed from `🪝` to `📌` to differentiate from Hook Lab
- [ ] Hook Lab shows a contextual banner for users who haven't tracked any accounts yet

**What was done**:
- `src/app/dashboard/page.tsx` — replaced with server-side `redirect('/dashboard/hook-lab')`
- `src/app/dashboard/tracked/page.tsx` — new file, moved tracked accounts page here (unchanged logic)
- `src/app/dashboard/layout.tsx` — reordered sidebar (Hook Lab first), updated Tracked href to `/dashboard/tracked`, changed My Hooks icon to `📌`, simplified `isActive` logic (removed `/dashboard` special case)

---

#### 3. Fix Analytics Scoping and Calculation — DONE

**Problem**: Analytics shows all 75 profiles in the database instead of the user's 3 tracked accounts. Engagement rate calculation produces impossible values (109.4%).

**Solution**: Scope analytics queries to `user_tracked_profiles` join. Fix engagement rate formula.

**Acceptance criteria**:
- [x] Analytics only shows stats for the authenticated user's tracked accounts
- [x] Engagement rate values are mathematically valid (0-100%)
- [x] Analytics is accessible from sidebar navigation
- [x] Empty state shown when user has no tracked accounts

**What was done**:
- `src/app/api/analytics/route.ts` — added auth check, rewrote all queries to join through `user_tracked_profiles` scoped by `user_id`, combined overview stats into a single query, capped engagement rate with `LEAST(..., 100)`
- `src/app/api/analytics/hooks/route.ts` — added auth check, scoped all queries (distribution, top hooks, overall stats) through `user_tracked_profiles` join
- `src/app/dashboard/analytics/page.tsx` — added empty state with CTA to track first account when `totalAccounts === 0`
- `src/app/dashboard/layout.tsx` — added Analytics (📈) to sidebar between Playbook and Profile

---

### P1 — High Value Features

#### 4. Trending Hooks / Discovery Feed — DONE

**Problem**: Once a user has set up and saved some hooks, there's no pull to come back daily. The `daily_top_hooks` table exists but isn't surfaced in the UI.

**Solution**: A daily/weekly curated view of top-performing hooks across all seed creators, sorted by recency + viral score. Give users a reason to return without tracking anyone.

**Acceptance criteria**:
- [x] New "Trending This Week" section at the top of Hook Lab
- [x] Shows top hooks ranked by the daemon's daily computation
- [x] Updates automatically as daemon recomputes daily rankings
- [ ] Filterable by niche (future enhancement)

**What was done**:
- `src/app/api/hook-lab/trending/route.ts` — new endpoint that queries `daily_top_hooks` for the most recent date, returns top 8 posts with full post data. Falls back to recently analyzed high-scoring posts if no `daily_top_hooks` data exists.
- `src/app/dashboard/hook-lab/page.tsx` — added "Trending This Week" horizontal scroll section above filters. Shows compact cards with hook type, score, text preview, creator, and viral score. Clicking a card opens the InsightsPanel.

---

#### 5. Niche-Filtered Default Views — DONE

**Problem**: Nothing feels personalized until you manually filter. Once a user sets their niche in profile, all views should default to that niche.

**Solution**: Read the user's `creator_profiles.niche` and use it as the default filter across Hook Lab, suggestions, and playbook.

**Acceptance criteria**:
- [x] Hook Lab defaults to user's niche filter (with option to clear)
- [x] "Showing hooks in your niche: [tech]" banner when filter is active
- [x] User can clear the filter to see all hooks

**What was done**:
- `src/app/dashboard/hook-lab/page.tsx` — on mount, checks for `?niche=` URL param first (from onboarding redirect); if none, fetches `/api/creator-profile` and applies user's niche as default filter. Shows indigo banner "Showing hooks in your niche: [niche]" with "Show all" button when profile niche is active. Tracks `nicheSource` to distinguish URL vs profile-based filtering.

---

#### 6. Hook Collections / Folders — DONE

**Problem**: The flat list of saved patterns in My Hooks doesn't scale. Users can't organize hooks by purpose.

**Solution**: Let users create collections (e.g., "for my cooking channel," "competitor teardowns," "hooks to try this week") and assign saved patterns to them.

**Acceptance criteria**:
- [x] User can create named collections
- [x] Saved patterns can be assigned to one or more collections
- [x] My Hooks page shows collection tabs/filter
- [x] Default "All Hooks" view still works

**What was done**:
- Added `hook_collections` and `hook_collection_patterns` tables to both `src/lib/db.ts` and `scraper/db.py` (dual schema)
- Created `src/app/api/collections/route.ts` with GET (list with pattern counts), POST (create), DELETE, PATCH (add/remove pattern)
- Updated `src/app/api/user-hooks/route.ts` GET to support `collection_id` query param filter
- Updated `src/app/api/user-hooks/[id]/route.ts` to return `collection_ids` for each pattern
- Updated `src/app/dashboard/saved/page.tsx` with:
  - Collection tabs (pill buttons) above filters with pattern counts
  - Inline "New" button to create collections
  - Delete (x) button on collection tabs (hover to reveal)
  - Folder icon on each hook card that opens a checkbox dropdown to assign/remove from collections
  - Click-outside handler to close the assign menu
  - Optimistic UI updates when toggling collection membership

---

#### 7. "Create Content" Workflow — DONE

**Problem**: The playbook generates scripts, but the workflow to go from "I want to make a video" to "here's my script" is fragmented across multiple pages.

**Solution**: A dedicated page/modal where a user can: pick a topic → browse their saved hooks → generate scripts → save/export. Consolidates the playbook flow into a single, guided experience.

**Acceptance criteria**:
- [x] Single page with topic input, pattern selection, and generated output
- [x] Shows user's saved patterns as selectable cards
- [x] "Generate" produces 3-5 script variations
- [x] Scripts can be copied or exported

**What was done**:
- `src/app/dashboard/playbook/page.tsx` — redesigned page layout:
  - Hero section: "Create Your Hooks" with gradient background, topic textarea, pattern toggles, and generate button. Always visible with contextual CTAs (profile setup, Hook Lab) when prerequisites aren't met.
  - Results section: generated hooks shown in a separate card with "Copy All" and "New Topic" buttons
  - Playbook Library: existing sections re-labeled as "Playbook Library" with compact export button, positioned as secondary reference material below the creation flow

---

#### 8. Real Notifications — DONE

**Problem**: The bell icon in the dashboard header is a placeholder. No notifications exist.

**Solution**: Implement notifications that drive re-engagement:
- "Your tracked account @hormozi just posted a 5x viral post"
- "3 new hooks analyzed in your niche this week"
- "Your playbook has new suggestions based on recent trends"

**Acceptance criteria**:
- [x] Bell icon shows unread count badge
- [x] Dropdown shows recent notifications
- [x] Notifications generated when: tracked account posts viral content
- [x] Mark as read functionality

**What was done**:
- Added `notifications` table (with `link` column for click-through) to both `src/lib/db.ts` and `scraper/db.py` (dual schema), with indexes on `user_id` and `created_at`
- Created `src/app/api/notifications/route.ts` — GET returns last 20 notifications + unread count, PATCH marks as read (single/all)
- Updated `src/app/dashboard/layout.tsx`:
  - Bell icon now shows red unread badge (9+ cap)
  - Click opens a dropdown with notification list (unread highlighted in indigo)
  - "Mark all read" button in header
  - Click a notification to navigate to its link
  - Auto-polls every 60 seconds, click-outside closes dropdown
  - `timeAgo` helper for relative timestamps
- Added `generate_viral_post_notifications()` to `scraper/db.py` — detects posts with 3x+ viral score scraped in last 5 hours, notifies all tracking users (with dedup)
- Added `create_notification()` helper to `scraper/db.py` for programmatic notifications
- Updated `scraper/daemon.py` to call `generate_viral_post_notifications()` after each successful user-tracked profile scrape

---

### P2 — Nice to Have

#### 9. Side-by-Side Hook Comparison — DONE

**Problem**: Users can't easily compare hooks to understand what makes one better than another.

**Solution**: Multi-select hooks in Hook Lab and view them in a split comparison panel showing structure, score, type, and analysis side by side.

**What was done**:
- Added Compare mode toggle button to Hook Lab header
- When active, each card gets a selection checkbox overlay (+/check icon), clicking selects/deselects (up to 3)
- Selected cards get an indigo ring highlight
- Floating compare bar at bottom shows selected creators with remove buttons and "Compare (n)" action
- Full-screen comparison modal shows 2-3 hooks side by side with:
  - Creator header (platform + username)
  - Stats row (viral score, views, hook score)
  - Hook type, template, opening words, why it works, tags
  - Engagement stats
- All contained in `src/app/dashboard/hook-lab/page.tsx` — no HookCard changes needed

---

#### 10. Hook Remix / Adaptation — DONE

**Problem**: Users see great hooks but struggle to adapt them to their niche.

**Solution**: Given a saved hook template, generate 3-5 variations adapted to the user's specific niche/angle/audience using their creator profile data.

**What was done**:
- Created `src/app/api/hooks/remix/route.ts` — POST takes `pattern_id`, fetches the pattern + its top 5 examples + user's creator profile, sends to DeepSeek to generate 5 niche-adapted variations
- Updated `src/app/dashboard/saved/page.tsx`:
  - Remix button (refresh icon) added to each hook card's action buttons
  - Click generates variations via AI, shows loading spinner
  - Results appear in an amber-tinted section below the hook card with:
    - Each variation as a quoted script with copy button
    - Angle tag and explanation for each
  - Toggle to close/reopen results

---

#### 11. Creator Deep Dive Page — DONE

**Problem**: Clicking a creator in the Tracked list doesn't show a dedicated analysis. Users can't see a creator's best hooks, viral score distribution, or posting patterns in one place.

**Solution**: A dedicated creator profile page showing: top hooks, viral score distribution chart, posting cadence, common formats, and content style analysis.

**What was done**:
- Created `src/app/dashboard/creator/[username]/page.tsx` with:
  - Profile header (avatar, name, bio, platform badge)
  - Stats row (followers, posts tracked, avg views, avg viral score)
  - Viral Score Distribution — horizontal bar chart showing < 1x / 1-2x / 2-3x / 3-5x / 5x+ buckets, with peak and hit counts
  - Hook Types Used — bar chart of hook type breakdown with percentages (from analyzed posts)
  - Posts grid with Top / Analyzed tab toggle, viral score badges, analysis indicators
  - Click any post to open InsightsPanel with full hook analysis
- Enhanced `src/app/api/profiles/[username]/route.ts` GET to return `hook_types` breakdown and `stats` (total/analyzed posts, avg/max viral, avg/max views, 2x/5x hit counts)
- Updated `src/app/dashboard/tracked/page.tsx`:
  - Creator usernames in the accounts list now link to `/dashboard/creator/{username}?platform={platform}`
  - Usernames in the posts grid also link to the creator page

---

#### 12. Mobile-Responsive Polish — DONE

**Problem**: The sidebar layout and card grids need responsive testing. Hook Lab cards with flip animations likely don't work well on mobile.

**Solution**: Responsive audit and fixes across all dashboard pages. Consider bottom nav for mobile instead of sidebar.

**What was done**:
- Added mobile bottom navigation bar to `src/app/dashboard/layout.tsx`:
  - Fixed to bottom of screen, visible only on `< lg` breakpoint
  - Shows 5 key nav items (Lab, Tracked, Hooks, Playbook, More) with icons + labels
  - Active item highlighted in indigo
- Content area gets bottom padding (`pb-24`) on mobile to clear the bottom nav
- Main content padding reduced on mobile (`p-4 sm:p-6`)
- Notification dropdown made responsive (`w-[calc(100vw-2rem)] sm:w-80`)
- "Sign out" text hidden on mobile (`hidden sm:block`), accessible via Account page instead
- Sidebar remains available via hamburger menu on mobile for full nav access

---

#### 13. Sound/Audio Trending — DONE

**Problem**: The landing page mentions "See which sounds are driving viral videos" but there's no audio/sound tracking feature.

**Solution**: Extract audio metadata during scraping and surface trending sounds. Requires scraper changes.

**What was done**:
- Added `audio_name TEXT` and `audio_author TEXT` columns to posts table in both `src/lib/db.ts` and `scraper/db.py`
- Added `migrate_audio_columns()` to `scraper/db.py` for existing databases
- Updated `add_posts()` in `scraper/db.py` to insert/upsert audio fields with COALESCE to preserve existing values
- Updated `scraper/tiktok.py` `_parse_ytdlp_items()` to extract `track` and `artist` from yt-dlp output
- Updated `scraper/instagram.py` feed parsing to extract audio metadata from `clips_metadata.music_info.music_asset_info` (title, display_artist, ig_username)
- Added `audio_name` and `audio_author` to Post interface in `src/lib/types.ts`
- Created `src/app/api/hook-lab/trending-sounds/route.ts` — aggregates top 20 sounds by post count in last 30 days with avg views and viral score
- Added "Trending Sounds" section to Hook Lab page (`src/app/dashboard/hook-lab/page.tsx`):
  - Ranked grid of sounds with position badge, song name, artist, post count, and avg views
  - Collapsible: shows top 6 by default with "View all" toggle
  - Purple-to-pink gradient rank badges for visual appeal

---

#### 14. Posting Schedule Insights — DONE

**Problem**: Users don't know when to post for maximum reach.

**Solution**: Analyze `posted_at` timestamps for tracked creators and show when they typically post, correlated with viral score.

**What was done**:
- Extended `src/app/api/analytics/route.ts` with two new queries:
  - `scheduleByDay`: Groups posts by day-of-week (0=Sun..6=Sat) with count and avg viral score
  - `scheduleByHour`: Groups posts by hour-of-day (0-23) with count and avg viral score
  - Both scoped through `user_tracked_profiles` join
- Added "Posting by Day" and "Posting by Hour" cards to `src/app/dashboard/analytics/page.tsx`:
  - **By Day**: Horizontal bar chart with post counts, avg viral score per day, best day highlighted in indigo
  - **By Hour**: 6x4 heatmap grid (24 cells), color intensity proportional to volume, best hour highlighted with ring
  - Both auto-detect the highest-performing time slot and display it as a recommendation

---

## Architecture Reference

### Page Map

```
src/app/
├── page.tsx                              # Landing page (public)
├── login/page.tsx                        # Auth (email + TikTok OAuth)
├── signup/page.tsx                       # Redirects to login
└── dashboard/
    ├── layout.tsx                        # Sidebar + topbar + auth check
    ├── page.tsx                          # Redirect → /dashboard/hook-lab
    ├── hook-lab/page.tsx                 # Hook Lab (browse analyzed hooks, DEFAULT)
    ├── tracked/page.tsx                  # Tracked accounts
    ├── saved/page.tsx                    # My Hooks (saved patterns)
    ├── playbook/page.tsx                 # AI playbook + hook generation
    ├── profile/page.tsx                  # Creator profile / onboarding
    ├── account/page.tsx                  # Account settings
    ├── analytics/page.tsx               # Analytics (needs fixes)
    └── explore/page.tsx                  # Deprecated, redirects to hook-lab
```

### API Route Map

```
src/app/api/
├── auth/[...nextauth]/route.ts          # Auth.js handler
├── auth/signup/route.ts                 # Email signup
├── track/route.ts                       # POST: track a profile
├── profiles/route.ts                    # GET: user's tracked profiles
├── profiles/[username]/route.ts         # GET/DELETE: single profile
├── tracked-posts/route.ts              # GET: posts from tracked accounts
├── search-accounts/route.ts            # GET: autocomplete search
├── hook-lab/route.ts                    # GET: analyzed hooks with filters
├── hook-lab/stats/route.ts             # GET: hook lab statistics
├── analyze-hook/route.ts               # POST: queue post for AI analysis
├── user-hooks/route.ts                 # GET/POST/DELETE: saved patterns
├── user-hooks/[id]/route.ts            # GET: pattern detail + examples
├── saved/route.ts                       # GET: legacy saved posts
├── saved/[id]/route.ts                 # GET/DELETE: legacy saved post
├── saved/import/route.ts               # POST: import video by URL
├── playbook/route.ts                    # GET: playbook sections
├── playbook/regenerate/route.ts         # POST: regenerate section
├── playbook/generate-hooks/route.ts     # POST: generate hooks for topic
├── playbook/export/route.ts             # GET: export playbook
├── creator-profile/route.ts             # GET/PUT: creator profile
├── creator-profile/suggestions/route.ts # POST: AI creator suggestions
├── creator-profile/questions/route.ts   # GET: onboarding questions
├── analytics/route.ts                   # GET: dashboard stats
├── analytics/hooks/route.ts             # GET: hook analytics
└── export/route.ts                      # GET: CSV export
```

### Database Tables

```
Core:
  users                    — Auth users (tiktok_id, email, password_hash)
  profiles                 — Tracked Instagram/TikTok accounts
  posts                    — Individual posts with hook_analysis JSONB
  user_tracked_profiles    — Many-to-many: user tracks profile

Hook System:
  hook_patterns            — Global deduplicated hook templates
  hook_pattern_posts       — Many-to-many: pattern ↔ post examples
  user_saved_patterns      — User's saved patterns + notes

Content Pipeline:
  seed_creators            — 174 hand-curated creators for Hook Lab
  daily_top_hooks          — Cached top hooks by date/niche
  playbook_sections        — AI-generated playbook per user

User Data:
  creator_profiles         — Onboarding data (niche, style, topics)

Infrastructure:
  scrape_log               — Scraper job history
  scrape_queue             — Analysis/scraping queue
  video_url_cache          — Cached video URLs (1-hour TTL)

Legacy (being replaced):
  saved_posts              — Old bookmarking system
  saved_hooks              — Old user-hook saves
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| HookCard | `src/components/HookCard.tsx` | Flippable card with thumbnail, analysis, save button |
| HookFilters | `src/components/HookFilters.tsx` | Filter panel (type, niche, format, trigger, score, platform) |
| HookStats | `src/components/HookStats.tsx` | Stats bar for Hook Lab |
| HookBadge | `src/components/HookBadge.tsx` | Type and niche badge pills |
| InsightsPanel | `src/components/InsightsPanel.tsx` | Slide-out panel with full hook analysis + video |
| VideoHover | `src/components/VideoHover.tsx` | Hover-to-play video component |
| Navigation | `src/components/Navigation.tsx` | Landing page top nav |
| Pricing | `src/components/Pricing.tsx` | Pricing tier cards |

### Live Data Snapshot (at time of audit)

| Metric | Count |
|--------|-------|
| Total profiles in DB | 75 |
| Seed creators | 174 |
| User 1 tracked profiles | 3 |
| Total posts | 1,634 |
| Analyzed posts (with hooks) | 303 |
| Hook patterns | 6 |
| User 1 saved patterns | 6 |
| Playbook sections | 1 |
