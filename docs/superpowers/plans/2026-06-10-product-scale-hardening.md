# Peakr Product & Scale Hardening — Execution Plan

> **For agentic workers:** TDD each item (red → green → gate). Gate = `npx vitest run` + `npx tsc --noEmit` + `npm run lint` + (for Python) `python3 -m pytest`. Commit per finding. Source: the 65-finding adversarial review (product / broken-process / scale lenses).

**Goal:** Address all 65 verified findings in highest-priority order, each closed by a genuine test that encodes the bug/behavior.

**Branch:** `product-scale-hardening`

---

## Wave 1 — Correctness bugs (pure bugs, small diffs, ship-first) ✅ DONE

- [x] **1.1 `saved_posts` join leaks/duplicates** — add `AND sp.user_id = $userId` to LEFT JOINs in `explore/route.ts:27` and `hook-lab/route.ts:104`; fixes row fan-out (post saved by N users → N rows), COUNT/rows desync, and cross-user `is_saved` leak. Test: query builder includes user predicate; no dup rows for multi-user saves.
- [x] **1.2 `forgot-password` claims success when email no-ops** — branch on `sendEmail()` `{sent:false}`; return an honest "email not configured / temporarily unavailable" signal; UI stops asserting "we sent a link" when it didn't. Test: route returns `emailSent:false` when RESEND unset; still no user-enumeration.
- [x] **1.3 Nav "Go Viral" CTA routes to sign-in** — `Navigation.tsx:51,99` → `/signup`. Test: component renders the CTA href as `/signup`.
- [x] **1.4 `keyframe` open-redirect** — validate `thumbnail_url` against `INSTAGRAM_IMAGE_HOSTS` (reuse ssrf allowlist) before 302, else 404/route via image-proxy. Test: disallowed host → not redirected.
- [x] **1.5 analyze-hook reopen double-burns daily quota** — the `already_analyzed` short-circuit is gated on `analyzed_at` (still null while pending), so re-requesting a queued post re-charges the cap. Gate on pending/queued state too. Test: second request for a queued post does not increment usage.

## Wave 2 — Monetization (highest leverage)

- [ ] **2.1 Carry `plan` in JWT** — extend `SELECT` in `auth.ts` session/jwt callback; expose `session.user.plan`. Test: jwt callback attaches plan.
- [ ] **2.2 Enforce track limit in `/api/track`** — `COUNT user_tracked_profiles`; reject with 402 at `>= trackLimit(plan)`; wire `src/lib/plan.ts` (currently dead). Test: free user at limit → 402; pro allowed.
- [ ] **2.3 Reconcile limit numbers** — one source of truth (`plan.ts`); fix account page (15) + `Pricing.tsx` (15/50) to match. Test: Pricing copy derives from plan constants.
- [ ] **2.4 Gate costly actions behind `isPro()`** — `/api/export` + AI generation volume; return 402 with upgrade hint. Test: free export blocked or metered.
- [ ] **2.5 Upgrade banner + checkout guard** — banner hidden when `plan==='pro'`; checkout rejects already-pro. Test: layout gate; checkout 409 when pro.
- [ ] **2.6 Account page reflects real plan + self-serve cancel** — Stripe Customer Portal route; annual reachable from upgrade. Test: portal route requires auth + customer id.

## Wave 3 — Billing robustness

- [ ] **3.1 Webhook event coverage** — handle `customer.subscription.updated`, `invoice.payment_failed`; downgrade/past_due. Test: payment_failed flips plan/grace.
- [ ] **3.2 Webhook idempotency** — `stripe_events(event_id)` dedup table. Test: replayed event is a no-op.
- [ ] **3.3 Customer-id fallback** — resolve user by `stripe_customer_id` when metadata absent. Test: sub without metadata still maps.

## Wave 4 — Activation UX

- [ ] **4.1 First-track scrape state + polling** — render "Fetching @x… ~1 min" when `last_scraped_at IS NULL`; poll `/api/tracked-posts` with backoff. Test: helper picks pending state from payload.
- [ ] **4.2 Creator page pending vs dead** — don't render hard-zeroed stats as a real (dead) account. Test: pending profile → loading state.
- [ ] **4.3 Queued analysis polls to resolution** — poll until `analyzed_at`; call `onPostUpdate`. Test: poll helper stops on resolved.
- [ ] **4.4 Pending posts not shown "Analyzed"** — check `status !== 'pending'`, not bare truthiness on `hook_analysis`. Test: pending → not "analyzed".

## Wave 5 — Scraper reliability (Python / pytest)

- [ ] **5.1 `pop_scrape_queue` concurrency-safe** — `FOR UPDATE SKIP LOCKED`; add daemon PID guard. Test (db): two concurrent pops don't double-claim.
- [ ] **5.2 Transient vs deterministic analysis failure** — separate transient (LLM/infra) from deterministic; cooldown reset + circuit breaker; no permanent terminal-fail on a blip. Test: transient failure is retryable after cooldown.
- [ ] **5.3 Health = success/freshness, not liveness** — heartbeat carries scrape success-rate; `/api/worker-status` reflects data freshness. Test: zero-fresh-data → not "healthy".
- [ ] **5.4 Heartbeat during seed batches** — beat from inside seed inner loop. Test: heartbeat updated mid-batch.
- [ ] **5.5 Persistent per-profile backoff + reap dead** — persist failure count; terminal "unreachable" after K. Test (db): dead profile excluded after K.
- [ ] **5.6 TikTok empty-vs-broken + pin yt-dlp** — distinguish; alert on fleet-wide zero spike; startup self-test. Test: broken layout ≠ "success 0".
- [ ] **5.7 Route yt-dlp/IG video through proxy** — no raw home-IP egress. Test: download invoked with proxy.

## Wave 6 — Scale / performance (DB + client)

- [ ] **6.1 Hook Lab indexes** — partial index `posts(viral_score DESC) WHERE analyzed_at IS NOT NULL`; JSONB facet expression indexes; gate `COUNT(*)` to first page/keyset. Mirror both schemas.
- [ ] **6.2 Drop `keyframe_base64` from feed SELECT** — serve via `/api/keyframe`; keep `transcript` (rendered).
- [ ] **6.3 `viral_score` skip no-op writes** — `AND viral_score IS DISTINCT FROM ROUND(...)`.
- [ ] **6.4 Analytics cache + user-hooks pagination** — short-TTL cache; fix N+1.
- [ ] **6.5 Dashboard polling** — Page Visibility gating + Cache-Control on worker-status/notifications.
- [ ] **6.6 Daemon connection pool**.

## Wave 7 — Security / session / hygiene

- [ ] **7.1 Invalidate JWTs on password change** — `password_changed_at`/`token_version`.
- [ ] **7.2 Shared rate limiter** — Upstash/Vercel KV behind `rateLimit()` (or document the limitation + gate).
- [ ] **7.3 Remove dead `saved_hooks`/`user_hooks`; fix `saved/import` stat recompute**.
- [ ] **7.4 Schema source of truth + CI drift check**.
- [ ] **7.5 Onboarding gate on JWT value**.
- [ ] **7.6 CI gate (vitest+pytest on push) + pre-restart smoke gate + rollback**.

## Wave 8 — Throughput + remaining product

- [ ] **8.1 Worker pool via queue + 4h refresh through queue + scrape-debt metric/paging**.
- [ ] **8.2 `WHISPER_MODE=api` path**.
- [ ] **8.3 Landing page reposition (copy + real screenshots)**.
- [ ] **8.4 a11y pass (labels, focus trap, keyboard)**.
- [ ] **8.5 Land-in-Hook-Lab onboarding**.
- [ ] **8.6 Hook Lab empty-state CTA / clear-niche**.
- [ ] **8.7 Value loop: track own handle + weekly digest**.
- [ ] **8.8 Persist generated hooks/remixes**.
- [ ] **8.9 Per-profile freshness rendering**.

---

## Progress log
- (updates appended as waves land)
