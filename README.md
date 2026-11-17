# Nenormalizm Recs Radio

A React + Vite Telegram Mini App and web player for the Nenormalizm Recs archive.

## Features

- Browses and searches archive.org releases
- Plays tracks with queue, shuffle, repeat, seek, volume, and resume controls
- Syncs selected user state through Telegram CloudStorage
- Supports Telegram deep links and native Mini App features
- Provides optional privacy-aware statistics through Vercel and Upstash Redis

## Development

```powershell
npm install
npm run dev
npm run build
npm run lint
npm test
npm run preview
```

## Deployment

The Vercel serverless API routes are in `api/` and the Redis helpers are in `lib/`.

Optional server environment variables:

- `TELEMETRY=1` to enable aggregate telemetry collection
- `STATS_KEY` to protect statistics and diagnostics
- `ADMIN_KEY` to validate owner-page access
- `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN`

Keep all secret values in the deployment environment, never in source-controlled files.
