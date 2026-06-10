# Peakr Launch Hardening Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD (red → green → refactor). Steps use checkbox (`- [ ]`) syntax. Spec: `LAUNCH-AUDIT.md` (67 findings). This plan groups them into executable waves in priority order.

**Goal:** Close all launch-blocking gaps from the audit — security holes, the daemon livelock, data-integrity bugs — and build the three opted-in external integrations (password reset, Sentry, Stripe), with automated tests as the regression gate.

**Architecture:** Pure logic (URL validation, rate limiting, email/password rules, LLM-output validation, daemon analysis-state decisions) is extracted into small, unit-tested functions. Route authorization uses a shared `requireUser()` helper. Python DB-touching changes are verified against a throwaway Dockerized Postgres. Infra (Terraform/RDS) changes are prepared as code + a runbook the operator applies manually.

**Tech Stack:** Next.js 14 / TypeScript / Vitest; Python 3 / pytest + Docker Postgres; Auth.js v5; pg; Resend (email); Sentry; Stripe.

**Test gate (the "loop until done"):** `npm run test:run` + `npx tsc --noEmit` + `npm run build` + `npm run lint` + `python3 -m pytest` must all pass before a wave is considered complete.

---

## Wave 1 — Critical security + daemon livelock

- [ ] **1.1 SSRF guard (`image-proxy`, `video-url`)** — CRITICAL
  - Test: `tests/lib/ssrf.test.ts` — `assertSafeUrl` rejects non-http(s), private/loopback/link-local IPs (10/8, 127/8, 169.254/16, 192.168/16, ::1, fc00::/7), non-allowlisted hosts; accepts cdninstagram/tiktok hosts.
  - Fix: new `src/lib/ssrf.ts`; both routes validate before fetch/execFile; cap concurrency; add `auth()`.
- [ ] **1.2 `analyze-hook` unauthenticated** — CRITICAL
  - Test: route returns 401 without session; 403 when post not tracked by user; enforces per-user daily cap.
  - Fix: `auth()` + ownership join on `user_tracked_profiles` + cap.
- [ ] **1.3 Daemon livelock on failed analysis** — CRITICAL
  - Test (pure): `scraper/tests/test_analysis_state.py` — skip reasons (no url, >300s), attempt counting, terminal-failure detection, failure marker shape.
  - Test (db): failed posts excluded from `get_unanalyzed_viral_posts` after N attempts.
  - Fix: `scraper/analysis_state.py`; `analyze_post` writes failure marker; `get_unanalyzed_viral_posts` excludes terminal failures; daemon sleeps before `continue`.
- [ ] **1.4 Unauthenticated data routes** — HIGH
  - Test: `export`, `saved` (GET/POST/DELETE), `saved/[id]`, `saved/import`, `profiles/[username]` return 401 without session.
  - Fix: shared `src/lib/api-auth.ts#requireUser()`; apply to each; scope queries by user id.
- [ ] **1.5 RDS TLS validation + connectivity prep** — CRITICAL
  - Fix (code): `src/lib/db.ts` validates RDS CA instead of `rejectUnauthorized:false`.
  - Prepare (no apply): Terraform diffs (private subnet / IP allowlist, strong password var, backups, deletion protection) + `docs/runbooks/rds-hardening.md`.

## Wave 2 — High security + data integrity

- [ ] **2.1 Rate limiting** — HIGH. `src/lib/rate-limit.ts` (token-bucket, in-memory + optional Upstash); apply to login, signup, analyze-hook, playbook generate/regenerate, remix, track, search-accounts.
- [ ] **2.2 `saved_posts` user scoping** — HIGH. Add `user_id`; backfill is empty (legacy global); scope all saved routes; migration in both schemas.
- [ ] **2.3 `db.ts` bootstrap ordering** — HIGH. Move `creator_profiles` create before its ALTER; make init idempotent + awaited on first query.
- [ ] **2.4 Integer overflow** — HIGH. `BIGINT` for `profiles.total_likes/followers/following`, `posts.views/likes/comments/shares`; both schemas + ALTER.
- [ ] **2.5 PII logging** — remove email/user logging in `auth.ts`.
- [ ] **2.6 Email enumeration + normalization + password policy** — generic signup/login errors; lowercase+trim email on signup/login; min-strength policy shared helper.
- [ ] **2.7 JWT maxAge + revoke on password change** — set session `maxAge`; bump a `password_changed_at`/token-version to invalidate old sessions.

## Wave 3 — External integrations (opted in)

- [ ] **3.1 Password reset** — `password_reset_tokens` table; `/api/auth/forgot-password` + `/api/auth/reset-password`; Resend email (gated on `RESEND_API_KEY`); login "forgot password" link. Tests: token issue/verify/expiry/single-use (pure + db).
- [ ] **3.2 Sentry** — `@sentry/nextjs` gated on `SENTRY_DSN` (no-op if unset); Python `sentry_sdk` in daemon. Test: init no-ops without DSN.
- [ ] **3.3 Stripe checkout** — `/api/billing/checkout` + webhook; `users.plan`/`stripe_customer_id`; plan gating helper; wire pricing UI. Tests: webhook signature validation, plan-gating logic (pure).

## Wave 4 — Scraper reliability

- [ ] **4.1 Daemon crash resilience** — wrap loop body in try/except; `launchd` plist + single-instance lock (PID file already exists — add liveness check). Doc supervisor setup.
- [ ] **4.2 Stuck `in_progress` recovery** — reclaim queue rows older than N minutes. Test (db).
- [ ] **4.3 IG session expiry detection** — detect login wall; mark profile error + notify operator; surface status.
- [ ] **4.4 IG proxy** — route IG scrape + yt-dlp through proxy when configured; fail loudly if required-but-down (config-driven).
- [ ] **4.5 Error visibility** — write scrape status to `scrape_log`/profile; `/api/worker-status` health endpoint + daemon heartbeat row; surface `last_scraped_at` in UI.
- [ ] **4.6 Misc** — proxy fallback not silent; retry cap/backoff for failing profiles; seed-batch yields to on-demand queue; notification dedup by stable key; complete `requirements.txt`.

## Wave 5 — AI robustness

- [ ] **5.1 Validate LLM output** — zod schema on regenerate/generate-hooks; reject malformed instead of nulling sections. Test (pure).
- [ ] **5.2 Prompt-injection containment** — delimit/escape scraped caption/transcript in prompts; never trust model output as control flow.
- [ ] **5.3 LLM timeouts + `maxDuration`** — abort slow DeepSeek calls; set route `maxDuration`.
- [ ] **5.4 Pin models** — pin DeepSeek/OpenClaw model ids.

## Wave 6 — Frontend / UX

- [ ] **6.1 Signup redirect** preserves intent. **6.2** API errors show error (not empty) states. **6.3** scrape freshness badge. **6.4** Track/Hook-Lab action feedback. **6.5** login/signup spinner resets on failure. **6.6** avatar-initial operator-precedence bug. **6.7** destructive-action confirms. **6.8** remove "Mac Mini" from customer UI.

## Wave 7 — Infra prep, ops, docs

- [ ] **7.1 Terraform**: backups/retention, deletion protection, restrict ingress — prepared + runbook (no apply). **7.2** lint config drift (align eslint-config-next / @types/react with Next 14 / React 18). **7.3** `vercel.json`/route `maxDuration` for AI routes. **7.4** pool sizing for serverless. **7.5** Terms + Privacy pages (scaffold). **7.6** account deletion / data export (GDPR). **7.7** README rewrite. **7.8** stop tracking terraform state in working tree. **7.9** add indexes for hot queries. **7.10** live IG/TikTok lookup error handling. **7.11** track-endpoint metadata trust.

---

## Execution notes
- One finding (or tight cluster) per commit, TDD throughout.
- Update `LAUNCH-AUDIT.md` checkboxes as items land.
- Infra/legal-content items are prepared in code + documented; the operator applies/authors the live + legal parts.
