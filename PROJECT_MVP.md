# Project Status & MVP Readiness

**Reviewed:** 2026-11-18
**Basis:** `main` after `5b6d070` ("Fix and tune logo display"), current `src/App.jsx`, `src/index.css`, `src/Logo.jsx`, and the prior `PROJECT_SUMMARY.md`.

---

## 1. Executive summary

Nenormalizm Recs is a React 19 single-page application with optional Vercel serverless endpoints. It works both as a regular web app and as a Telegram Mini App. It presents the label's archive hosted on archive.org as a browsable catalogue with a persistent radio-style player, and gives the owner privacy-respecting aggregate statistics and a deep-link generator behind an admin key.

**MVP verdict: READY for first daily users**, with a short pre-launch hygiene list (Section 8). The runtime architecture is strong enough: static stateless frontend, cache-first data access, graceful degradation on every external failure, and a minimal batched write path. The weakest links are maintainability (a single ~2,000-line component, no automated tests) and secret hygiene — iteration risks, not runtime risks.

---

## 2. Feature inventory (current state)

### Listener-facing
- Catalogue of up to 300 audio releases from archive.org, cached in `localStorage`, refreshable.
- Search across title, artist, identifier, catalogue number and archive tags (`subject`).
- Filters: favorites, decade chips; sort popover (new/old/title/artist); grid/list density; dark/light theme.
- Album page with instant shell (no stale-album flash), skeletons, description expand, tag pills.
- Playback: format dedupe per track (best format wins), queue with drag-reorder and remove-with-undo, shuffle, repeat off/all/album, seek with buffered range, volume/mute, resume across sessions and (in Telegram) across devices.
- Radio mode (random release from current filter pool).
- Keyboard shortcuts: Space, arrows, M, S, R, Q, N, P, F, `/`, Escape hierarchy.
- Deep links: album, search, decade, favorites, radio — as Telegram direct links or web links.
- Downloads unlocked only after listening: per-track file, per-release ZIP (existing `.zip` in the item or on-the-fly `archive.org/compress`).
- Sharing: copy link, Telegram story with cover and widget link; home-screen shortcut; fullscreen mode.

### Owner-facing (admin-key gated)
- Statistics: local device counters, audience summary from Upstash Redis (key-validated), JSON export, storage diagnostics.
- Deep-link generator for Telegram and web.
- Admin entry via `?k=` parameter in the URL hash, verified server-side; session remembered in `sessionStorage`.

### Telegram Mini App integration (capability-gated)
- Native Main/Secondary/Back/Settings buttons, haptics, closing confirmation while playing, bottom bar color, safe-area and header insets, CloudStorage sync of preferences, favorites, hidden releases and playback session (chunked, timestamped, last-write-wins).

### Privacy posture
- Aggregate counters only, no PII, no cookies.
- Do Not Track / Global Privacy Control blocks transmission; owner can override for the current session only.

---

## 3. Architecture

### Frontend
| Module | Responsibility |
|---|---|
| `index.html` | Loads Telegram WebApp SDK, mounts React |
| `src/main.jsx` | Theme pre-paint, Telegram/browser presentation, safe-area insets, root mount |
| `src/App.jsx` (~2,000 lines) | Catalogue, routing, album metadata, player/queue, storage, layout |
| `src/telegram.js` | Capability detection + safe wrappers for all Telegram APIs |
| `src/sync.js` | CloudStorage sync with 4096-char chunking and envelope timestamps |
| `src/deeplink.js` | Launch-param encoding, hash routing, link builders |
| `src/analytics.js` | Local aggregate counters, privacy gates, batched posting |
| `src/Stats.jsx`, `src/Links.jsx` | Owner views |
| `src/Logo.jsx`, `src/index.css` | Brand rendering and the full design system |

### Backend (Vercel serverless)
| Endpoint | Purpose | Protection |
|---|---|---|
| `/api/stats` | Ingest aggregate batches | Shape validation, telemetry flag |
| `/api/summary` | Date-bounded audience aggregates | `STATS_KEY` |
| `/api/diag` | Upstash diagnostics | Owner key |
| `/api/verify-admin` (rewrite in `vercel.json`) | Admin key check | Key comparison |
| `/api/config` | Safe feature status | None needed |
| `lib/redis.js` | Env normalization, Redis REST pipeline helpers | — |

### Storage
| Store | Contents |
|---|---|
| `localStorage` | Preferences, catalogue cache, favorites, hidden, session, played tracks, local analytics |
| `sessionStorage` | Album metadata cache (6 h TTL, 40-key LRU), admin session flag |
| Telegram CloudStorage | Synced preferences/favorites/hidden/session |
| Upstash Redis | Aggregate telemetry counters |

### External dependency
archive.org only: `advancedsearch.php`, `metadata/{id}`, `services/img/{id}`, `download/{id}/{file}`, `compress/{id}`. Direct browser calls (CORS open). Every call site has timeout, error state and retry or fallback.

---

## 4. Current health

- `npm run build`: passes. Main JS ~344 KB raw / ~106 KB gzip; CSS ~38 KB / ~9 KB gzip.
- `npm run lint`: passes with warnings (hook dependencies, render-time ref reads, no-effect expressions).
- No test script or test files.
- Changes since the previous review: admin gating with footer buttons, tag search and card tag chips, seek hit-area redesigned to 44 px with always-visible knob, volume/queue spacing fixed, logo suppressed below 32 px.

---

## 5. Open items (status vs previous review)

| # | Item | Status |
|---|---|---|
| 1 | `src/statskey.txt` tracked in git | **IN REMEDIATION** — file removed and ignored; rotate live credentials and purge history if needed |
| 2 | Admin key sent as query parameter | **FIXED** — verification uses POST plus `X-Admin-Key`/body and strips `k` after success |
| 2b | Initial deep link to `#/stats` / `#/links` renders owner view before/without admin check (render is not gated, only navigation) | **FIXED** — owner routes are deferred until validation |
| 3 | Album-bar logo invisible (`h={28}` vs 32 px threshold) → empty button | **FIXED** — call site uses 32 px and component no longer suppresses valid sizes |
| 3b | `max-width: min(46%, 240px)` on logo is circular (percentage of auto-width parent); `force-cache` makes logo updates stick forever; no text fallback when SVG missing | **OPEN** |
| 4 | Maintainability: giant `App.jsx`, no tests, lint warnings | **OPEN** |
| 5 | Starter `README.md` and `src/App.css` leftovers | **OPEN** |
| 6 | New/minor: IntersectionObserver prefetch deps stale after sort change; invalid `role="listitem button"` on track rows; sort-menu footer claims cross-device save unconditionally; no React error boundary; no MediaSession metadata | **OPEN** |

None of these block listening. Items 1, 2, 2b block *trusted* sharing of owner links.

---

## 6. MVP readiness assessment

### Verdict
**Yes — ship to first daily users.** The architecture matches the load profile of an early audience.

### Why the runtime is safe
1. **Stateless static frontend.** Served from CDN; any number of concurrent listeners costs nothing beyond edge cache hits. No server sessions to lose.
2. **Cache-first data path.** Catalogue from `localStorage` on paint; album metadata from memory/sessionStorage; network only for misses. Repeat visits are near-instant and survive flaky connections.
3. **Graceful degradation everywhere.** Cover fallback, logo threshold, capability gates for every Telegram API, error states with retry for catalogue/album/audio, DNT-aware telemetry. A failed subsystem degrades the feature, not the app.
4. **Bandwidth offloaded.** Audio and ZIPs stream from archive.org; your infra never proxies media.
5. **Tiny write path.** Telemetry is debounced, batched and privacy-gated; per active listener this is a handful of requests per hour. Upstash free/pro tiers comfortably absorb hundreds of DAU; `/api/diag` exists to verify.
6. **Recovery built in.** Resume position, queue undo, session restore, cloud sync — daily-use friction points are already handled.

### Where it is not "strong" yet (and why that is acceptable for MVP)
- **Iteration safety, not runtime safety:** one giant component plus zero tests means every change is a manual regression sweep. Fine for a stable launch build; becomes expensive once user feedback drives weekly changes.
- **No monitoring:** failures surface via users. `/api/diag` plus Vercel logs are enough for the first weeks; add a scheduled health probe later.
- **Single external dependency:** archive.org availability and response shapes. Mitigated by caching and error states, but an upstream format change would need a code fix. Acceptable and unavoidable for this content source.
- **Browser storage eviction:** Safari may purge `localStorage` after ~7 days of no interaction; favorites/resume would reset for dormant web users. Telegram users are covered by CloudStorage sync. Acceptable for MVP.

### Rough capacity sketch (order-of-magnitude, not a benchmark)
- First paint: ~115 KB gzip of app assets — fine on 3G.
- Per album open: 0 bytes (cache hit) or ~50–300 KB metadata (miss), cached 6 h.
- Telemetry: ≤ ~10 requests per listener-hour, each < 2 KB.
- Serverless invocations: linear in listeners but tiny; hundreds of DAU stay within free-tier limits with headroom.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation now | Mitigation later |
|---|---|---|---|---|
| Secret leak via tracked file or URL | Medium | High | Rotate + purge (item 1); stop sharing owner links with `?k=` | POST transport, distinct keys |
| archive.org outage/shape change | Low–Medium | Medium | Cache + error states + retry | Server-side proxy with schema pinning |
| Regression from untested refactor | Medium | Medium | Freeze refactors until launch stabilizes | Vitest units + CI |
| Render crash white-screens app | Low | High | — | React error boundary with retry (add pre-launch) |
| Storage quota/eviction | Low | Low | LRU purge already in place | CloudStorage expansion |

---

## 8. Pre-launch checklist

### Must (before first users)
1. Confirm `src/statskey.txt`; rotate keys if live; remove file and purge history; add to `.gitignore`.
2. Add a top-level React error boundary with a retry button (prevents white-screen on unexpected render errors).
3. Verify Vercel env: `TELEMETRY`, `STATS_KEY`, `ADMIN_KEY`, `UPSTASH_REST_URL`, `UPSTASH_REST_TOKEN`.
4. Smoke test matrix: Telegram iOS + Android (portrait, album open, play, resume, download), desktop Chrome/Firefox, light theme, DNT on/off.

### Should (first week)
5. Gate the initial render of `stats`/`links` on the resolved admin check (or defer initial route).
6. Move admin verification to POST/header; strip `?k=` from the URL after success.
7. Album-bar logo: raise call site to ≥ 32 px or lower threshold; fix circular `max-width`; add text fallback; version the logo fetch.

### Later (post-launch waves)
8. Vitest units for deeplink, track building, parsing, sync chunking; CI on PR.
9. Extract hooks (`useCatalog`, `usePlayer`, `useAlbumMeta`, `useRoute`, `useTelegramChrome`).
10. MediaSession metadata + lock-screen controls; prefetch dependency fix; ARIA role cleanup; README and starter-file cleanup.

---

## 9. Bottom line

The product surface is complete and polished enough that first users will experience a working, fast, private radio app. The architecture's runtime characteristics (stateless, cached, degraded-failure-tolerant, minimal writes) are appropriate for daily use by an early audience. Ship after the "Must" list; schedule the maintenance waves once real feedback arrives.