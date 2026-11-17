# Project Analysis

**Reviewed:** 2026-11-17  
**Repository:** `illocanblo/telegram-radio-app`  
**Branch / commit:** `main` / `5b6d070` (`Fix and tune logo display`)

## Executive summary

This is a React 19 single-page web app for **Nenormalizm Recs**, a music archive and radio player built around recordings hosted by the Internet Archive. It is designed to work both in a regular browser and as a Telegram Mini App. The frontend is a Vite application; optional serverless endpoints provide aggregate telemetry, Redis-backed statistics, and configuration/admin-key checks.

The project currently builds successfully. Its main maintenance concern is that the core app is concentrated in a large [`src/App.jsx`](./src/App.jsx), while automated behavior tests are not configured. The README and some CSS are still the original Vite template. There are also a few specific items worth reviewing: a tracked key-named file, initial-route admin gating, and the small-logo threshold on album pages.

## What the app does

- Queries Archive.org for up to 300 audio releases associated with configured uploader accounts, then filters, searches, sorts, and displays those releases.
- Loads release metadata and audio-file listings from Archive.org on demand; selects supported audio formats and exposes track/album playback and downloads.
- Provides a persistent audio player with queue editing, shuffle/repeat, seeking, volume, keyboard shortcuts, radio-style random release selection, and resume support.
- Saves preferences, favorites, hidden releases, playback session, and listened-track state in browser storage. When Telegram CloudStorage is available, selected state is synchronized across Telegram clients.
- Supports deep links to albums, search queries, decade filters, favorites, radio, and owner pages.
- Integrates Telegram Mini App features where supported, including native buttons, haptics, safe-area handling, fullscreen, downloads, sharing, and home-screen shortcuts.
- Collects aggregate usage counters locally and can send anonymized totals to Vercel API routes backed by Upstash Redis. Owners can view local or remote statistics and export JSON.

## Architecture and data flow

### Frontend

- [`index.html`](./index.html) loads the Telegram Web App SDK and mounts the React application.
- [`src/main.jsx`](./src/main.jsx) initializes Telegram/browser presentation state, theme, safe-area insets, and the React root.
- [`src/App.jsx`](./src/App.jsx) owns the main application state and most workflows: Archive.org requests, catalogue filtering, routes, album metadata, queue/player logic, storage, and the page layout. It is approximately 1,958 lines.
- [`src/telegram.js`](./src/telegram.js) wraps optional Telegram APIs and reports runtime capabilities.
- [`src/sync.js`](./src/sync.js) synchronizes selected state through Telegram CloudStorage with chunked values and timestamp envelopes.
- [`src/deeplink.js`](./src/deeplink.js) encodes/decodes launch parameters and stores app routes in the URL hash.
- [`src/analytics.js`](./src/analytics.js) maintains local aggregate counters, observes privacy preferences, and posts batches to the API when configured.
- [`src/Stats.jsx`](./src/Stats.jsx) provides owner-facing local/audience statistics, diagnostics, and export.
- [`src/Links.jsx`](./src/Links.jsx) creates Telegram and web deep links.
- [`src/Logo.jsx`](./src/Logo.jsx) renders the public logo asset; [`src/index.css`](./src/index.css) contains the production design system and responsive styling.

### Backend and deployment

- [`api/config.js`](./api/config.js) exposes safe feature/configuration status and handles the `/api/verify-admin` rewrite.
- [`api/stats.js`](./api/stats.js) validates and ingests aggregate event batches.
- [`api/summary.js`](./api/summary.js) returns date-bounded aggregates after validating the statistics key.
- [`api/diag.js`](./api/diag.js) performs owner-authorized Upstash diagnostics.
- [`lib/redis.js`](./lib/redis.js) normalizes environment settings and provides Redis REST pipeline helpers.
- [`vercel.json`](./vercel.json) contains the `/api/verify-admin` rewrite. The API layout and config indicate Vercel serverless deployment, but the repository does not itself prove the current production deployment status.

## Local state and external dependencies

| Area | Behavior |
|---|---|
| Catalogue and audio | Retrieved directly from `archive.org` search, metadata, image, and download endpoints. The application therefore depends on Archive.org availability and browser access to that service. |
| Preferences and playback | Browser `localStorage` / `sessionStorage`; optional Telegram CloudStorage synchronization. |
| Telemetry | Aggregate counters are stored locally. When server telemetry is enabled, the app sends them unless Do Not Track / Global Privacy Control blocks transmission; the owner can override that block for the current session. |
| Remote statistics | Vercel API routes and Upstash Redis, configured through server-side environment variables. |
| Telegram features | Optional; the app falls back to browser behavior when Mini App capabilities are absent. |

## Current health and validation

- `npm run build`: **passes**. Vite produced a production bundle; the main JavaScript bundle is about 344 KB (about 106 KB gzip) and CSS about 38 KB (about 9 KB gzip).
- `npm run lint`: **passes with warnings**. Oxlint reported warnings in `App.jsx`, `Stats.jsx`, `Links.jsx`, `analytics.js`, and `telegram.js`, including hook dependency/state-in-effect warnings, render-time ref reads, and unused/no-effect expressions. These are warnings, not build failures.
- No test script or automated test files are declared in [`package.json`](./package.json).
- The checkout was on `main` at `5b6d070`, aligned with `origin/main` when reviewed. An unrelated untracked `archive org integration.md` file was present and was not changed.

## Findings and recommended follow-up

### 1. Verify the tracked key-named file before further sharing — high priority

Git tracks [`src/statskey.txt`](./src/statskey.txt). Its name suggests it may contain a credential; its contents were deliberately not read or copied into this report. Confirm locally whether it is a real secret. If it is, revoke/rotate the credential and remove it from the repository; deleting only the current copy does not remove a value from prior Git history. Store runtime secrets only in deployment environment variables.

### 2. Make admin UI checks apply to initial deep links — medium priority

`App.jsx` initializes its route from the URL hash and renders the matching view before the asynchronous admin check completes. The later route-navigation guard does not consistently cover this initial render, so a direct link to an owner page can bypass the intended **UI-level** gate. The statistics API separately validates `STATS_KEY`, which is the important server-side protection for the data, but the client-side gate should still be made consistent.

The admin verifier also sends its key as a query parameter to `/api/verify-admin`. Prefer a request header or POST body to reduce exposure in request URLs and logs. Review the intended roles and use distinct secrets for UI access and statistics access.

### 3. Logo is intentionally suppressed at the album-page size — low priority

`Logo` returns `null` for heights below 32 px, while the album bar calls it with `h={28}`. As a result, the album-page logo button has no visible logo. Either raise that call-site size or change the minimum-size behavior if the logo is expected there.

### 4. Improve maintainability and regression coverage — medium priority

The main component combines data access, state management, playback, routing, and UI in one large file. Gradually extracting focused hooks/modules (for example catalogue loading, player/queue state, and route handling) would make changes easier to validate. Add targeted tests for deep-link parsing, track selection, route authorization, and queue transitions before or alongside that refactor.

### 5. Refresh project documentation and remove stale starter material — low priority

[`README.md`](./README.md) still describes the default React + Vite template, and [`src/App.css`](./src/App.css) contains starter styles rather than the app's current design system. Document the app's actual setup, Archive.org data dependency, Telegram behavior, deployment environment variables, and build/lint commands.

## Suggested next steps

1. Determine whether `src/statskey.txt` contains a live credential; rotate it if necessary.
2. Fix initial route authorization and move the admin verification key out of the query string.
3. Decide whether the album-page logo should be visible at 28 px and align the component/call site.
4. Add focused tests and address the existing lint warnings during related changes.
5. Replace the starter README with project-specific setup and deployment instructions.
