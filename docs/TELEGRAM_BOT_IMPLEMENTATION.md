# Telegram Bot Layer — Implementation Guide

**Project:** Nenormalizm Radio (`telegram-radio-app`)
**Scope:** server-side bot behaviour for an existing Telegram Mini App
**Package type:** additive — no frontend file is modified
**Files:** `lib/telegram.js`, `api/telegram.js`, `api/telegram-setup.js`

---

## 1. Problem this solves

The Mini App itself already works: a static React frontend on Vercel that Telegram
opens in a WebView. BotFather settings (name, description, about, botpic, Mini App
button) only *describe* the bot — they give it no behaviour. Without a webhook:

- `/start` in a private chat produces silence
- a bot added to a group sits in the member list and does nothing
- there is no way to share a release into a chat

These three files close that gap. The player, catalogue, album pages, owner pages,
telemetry and existing API routes are untouched. You can deploy this without
changing or rebuilding the client.

---

## 2. Request flow

```
Telegram user
   |  /start, /radio, /find ...   OR   @bot query   OR   bot added to group
   v
Telegram Bot API
   |  HTTPS POST + X-Telegram-Bot-Api-Secret-Token
   v
https://<domain>/api/telegram            (api/telegram.js)
   |--- verify secret header
   |--- route update: inline_query | my_chat_member | message
   |--- read catalogue (lib/telegram.js) --> archive.org advancedsearch
   |--- build buttons:  private -> web_app URLs with a screen route
   |                    group   -> url only
   v
Telegram Bot API (sendMessage / answerInlineQuery)
   v
Chat message with a button that opens the Mini App at a specific screen
```

Configuration flow, run once and after any env change:

```
You --POST + x-admin-key--> /api/telegram-setup --> Bot API
                            setWebhook
                            setMyCommands (private scope)
                            setMyCommands (group scope)
                            setChatMenuButton
                            getMe / getWebhookInfo --> verification response
```

---

## 3. File placement

```
<repo>/
  lib/
    redis.js            existing, untouched
    telegram.js         NEW
  api/
    config.js           existing, untouched
    stats.js            existing, untouched
    summary.js          existing, untouched
    diag.js             existing, untouched
    telegram.js         NEW
    telegram-setup.js   NEW
  docs/
    TELEGRAM_BOT_IMPLEMENTATION.md   this document
```

**Why the helper lives in `lib/`:** Vercel exposes every file inside `api/` as a
public HTTP endpoint. `lib/telegram.js` holds the token logic and must not be
reachable from the internet. Same reasoning as your existing `lib/redis.js`.

**Runtime:** Vite 8 requires Node 20.19+ or 22.12+. Use Node 22.x in Vercel
Project Settings -> Node.js Version. The serverless helpers also use
`AbortSignal.timeout` (available in Node 18+).

---

## 4. Environment variables

Vercel -> Settings -> Environments -> **Production**.

| Key | Value | Notes |
| --- | --- | --- |
| `BOT_TOKEN` | token from BotFather | server only |
| `BOT_USERNAME` | username without `@` | e.g. `NenormalizmRadio_bot` |
| `APP_SHORT_NAME` | Mini App short name | e.g. `radio`; empty = Main Mini App link |
| `APP_URL` | `https://telegram-radio-app-six.vercel.app` | no trailing slash, no hash, no query |
| `TELEGRAM_WEBHOOK_SECRET` | random `A-Z a-z 0-9 _ -`, 1–256 | Telegram `secret_token` rules |
| `ADMIN_KEY` | owner key you already have | falls back to `STATS_KEY` |

Generate the secret locally in PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

In **Vercel → Project → Settings → Environment Variables**, set the exact name
`TELEGRAM_WEBHOOK_SECRET` and paste the generated 64-character value. Select
**Production** (and Preview/Development only if you will test separate deployments).
Do not add quotes or a `Bearer ` prefix, do not rename it with `VITE_`, and never
put it in source code or a committed `.env` file. After saving, redeploy so the
serverless functions receive the variable.

The value is sent to Telegram as the webhook's `secret_token`; incoming webhook
requests must present the matching `X-Telegram-Bot-Api-Secret-Token` header.
If the value is missing or invalid, the webhook fails closed and setup refuses to
register it.

**Never prefix these with `VITE_`.** Vite inlines `VITE_*` into the browser bundle.
A bot token there would let anyone control your bot.

After changing variables you must **Redeploy** — an older deployment will not see them.

---

## 5. Implementation steps

### Step 1 — Verify the implementation files
The three server files should be present at the paths in section 3. The helper is
under `lib/` so it is not exposed as a public Vercel function. The API files under
`api/` become the webhook and setup endpoints. Run the tests and build before
deploying.

### Step 2 — Check `vercel.json`
Your existing rewrite for `/api/verify-admin` must use an **exact** `source`, not a
catch-all like `/(.*)` or `/api/(.*)`, otherwise it will swallow `/api/telegram`.
The webhook function is configured for up to 20 seconds because an inline search
may need to fetch the Archive.org catalogue:

```json
{ "functions": { "api/telegram.js": { "maxDuration": 20 } } }
```

### Step 3 — Deploy
```powershell
git add lib/telegram.js api/telegram.js api/telegram-setup.js docs/TELEGRAM_BOT_IMPLEMENTATION.md
git commit -m "Feat: Telegram bot webhook, inline release search, owner setup endpoint"
git push
```
Wait for **Ready**.

### Step 4 — Configure in one call
```powershell
$h = @{ 'x-admin-key' = 'YOUR_ADMIN_KEY'; 'Content-Type' = 'application/json' }
Invoke-RestMethod -Method Post -Uri 'https://telegram-radio-app-six.vercel.app/api/telegram-setup' -Headers $h -Body '{"action":"all"}'
```

```bash
curl -X POST 'https://telegram-radio-app-six.vercel.app/api/telegram-setup' \
  -H 'x-admin-key: YOUR_ADMIN_KEY' -H 'Content-Type: application/json' \
  -d '{"action":"all"}'
```

The setup endpoint accepts POST only. Actions: `info`, `webhook`, `commands`,
`menu`, `all`, `delete`. The webhook URL is built from the configured HTTPS
`APP_URL`, not the incoming request's `Host` header. Registering or deleting a
webhook does not discard Telegram's pending updates.

### Step 5 — Verify the response
| Field | Expected |
| --- | --- |
| `webhook.url` | `https://<domain>/api/telegram` |
| `webhook.pending_update_count` | near 0 |
| `webhook.last_error_message` | absent |
| `me.can_join_groups` | `true` |
| `me.can_read_all_group_messages` | `false` (privacy ON) |
| `me.supports_inline_queries` | `true` after step 6 |
| `commands_private.commands` | 6 |
| `commands_group.commands` | 4 |

### Step 6 — BotFather manual items
See section 10. `/setinline` has no Bot API equivalent and blocks inline sharing.

### Step 7 — Functional test
| Test | Where | Expected |
| --- | --- | --- |
| `/start` | private chat | welcome + Open player button |
| `/radio` | private chat | Radio button starts random playback |
| `/find glitch` | private chat | up to 5 release buttons |
| `@your_bot sij` | Saved Messages | inline cards with covers |
| add bot to test group | test group | bot posts its own greeting |
| `/radio@your_bot` | test group | url buttons open the Mini App |
| release link from channel | any chat | opens that exact release |

Test in a throwaway group first, not the label chat.

Private-chat buttons open the Mini App directly at the selected screen and
request fullscreen when the Telegram client supports it. Group buttons remain
`t.me` links because Telegram does not allow inline `web_app` buttons in groups.
Telegram may still show client-controlled notices; a bot cannot suppress a
required Telegram consent prompt.

---

## 6. How each file works

### `lib/telegram.js`
- `tgCfg()` reads and normalises env values (strips quotes/whitespace that often
  arrive from dashboard pasting), same pattern as `lib/redis.js`.
- `botApi(method, payload)` POSTs to the Bot API with a 9 s timeout, throws on
  `ok:false`. The token never leaves the server.
- `albumParam(id)` encodes `a_<base64url>` capped at 64 chars — **identical to the
  client's `deeplink.js`**, so bot links and in-app share links open the same screen.
  Over-long ids fall back to `webLink()` (`?nr=`), which has no length limit.
- `catalog()` runs the same advancedsearch query as the client (three uploader
  accounts, `mediatype:audio`, 300 rows, `subject` included), cached in instance
  memory for 10 minutes, returning stale cache on failure.
- `searchCatalog()` filters in JavaScript across title/creator/identifier/subject.
  It deliberately does **not** build a Solr query from user input — no injection risk.
- Formatting helpers mirror the client so cards look consistent.

### `api/telegram.js`
- POST only; 503 if the secret is missing or malformed; verifies
  `X-Telegram-Bot-Api-Secret-Token` against the env secret using a
  timing-safe comparison; 401 on mismatch.
- Logs only the update ID on processing errors and returns 500 so Telegram can
  retry. A duplicate reply is possible if an outgoing Bot API call succeeds but
  the webhook fails before Telegram receives the 200 response.
- Handles three update types: `inline_query`, `my_chat_member`, `message` starting with `/`.
- Commands: `/start` (also accepts `t.me/bot?start=<param>` payloads), `/radio`,
  `/catalog`, `/find` (`/search`), `/favorites`, `/help`.
- Private vs group branching is deliberate — see section 7.
- Per-chat cooldown ~1.2 s reduces bursts in a warm instance; Vercel instances do
  not share memory, so it is not a global rate limiter.

### `api/telegram-setup.js`
- Owner auth via `x-admin-key` **header**, not a query parameter, so the key does
  not land in URLs or logs.
- Accepts POST only; validates the configured HTTPS `APP_URL` and secret before
  calling Telegram.
- `webhook` registers `secret_token`, `allowed_updates`, and `max_connections:20`.
  It does not discard pending updates.
- `commands` sets separate scopes for private and group chats.
- `menu` sets the private-chat menu button to the Mini App.
- `info` returns a sanitised `getMe` plus webhook state for verification.
- Nothing in the response contains the token or the key.

---

## 7. Platform constraints that shaped the design

| Constraint | Consequence in code |
| --- | --- |
| Inline `web_app` buttons are not allowed in groups | group replies use `url` buttons with `t.me` deep links only |
| `/setinline` cannot be set via Bot API | manual BotFather step, section 10 |
| Webhook delivery may be retried after a server error | Return 500 on processing failure; duplicate side effects remain possible if a send succeeded just before a failure |
| `secret_token` charset is restricted | format validated before `setWebhook` |
| Privacy mode limits what a group bot receives | commands and replies only; greeting text states this explicitly |
| Deep-link `startapp` is limited to 64 chars | base64url param with web-link fallback |

---

## 8. Group and channel integration

### Channel (broadcast)
Do **not** make the bot an administrator for MVP. Publish posts yourself with links:
catalogue, radio, or a specific release (copy it from the release page share button).
Links open the Mini App directly from the post. Automatic posting of new releases is
a separate post-MVP feature requiring admin rights and a scheduler.

### Group — option A (recommended): inline only, bot not added
After `/setinline`, anyone types `@your_bot sij` in the message field and sends a
release card. Zero intrusion, no rights needed, the bot reads nothing, and it works
in other chats too.

### Group — option B: add as a plain member
1. BotFather: `/setjoingroups` Enable, `/setprivacy` Enable.
2. Group -> Add members -> find the bot -> add as **member, not admin**.
3. The bot posts its own greeting with links.
4. Pin a message listing `/radio`, `/catalog`, `/find` and the `@bot query` hint.
5. Confirm `me.can_read_all_group_messages === false`.

### Do not
- grant admin rights "just in case"
- disable privacy mode
- forward any link containing `?k=ADMIN_KEY` into a chat

---

## 9. Security and privacy

- Telemetry stays aggregate-only: no Telegram user id, no IP, no cookies.
- The webhook does **not** persist user identifiers. `chat.id` is used only to reply
  within the current request.
- Owner endpoints authenticate by header, never by query string.
- If you later add mailings or subscriptions, that becomes personal-data processing
  and requires a published policy, regulator notification and localisation.

Short text you can pin in the group:

> The bot answers commands only and does not read the conversation. Listening
> statistics are collected anonymously: no names, ids or IP addresses.

---

## 10. BotFather checklist — what may still be missing

Settings such as name/description/about/botpic are separate from the items below.

| Item | Command / place | Why it matters | Check |
| --- | --- | --- | --- |
| Inline mode | `/setinline` + placeholder | without it `@bot query` returns nothing; **cannot be set via API** | `me.supports_inline_queries === true` |
| Inline placeholder | same flow | hint shown before typing | e.g. `Search release: artist, title, tag…` |
| Join groups | `/setjoingroups` -> Enable | otherwise the bot cannot be added | `me.can_join_groups === true` |
| Privacy mode | `/setprivacy` -> Enable | keeps the bot from reading all messages | `me.can_read_all_group_messages === false` |
| Main Mini App | `/mybots` -> Bot Settings -> Main Mini App | makes `t.me/<bot>` open the player directly | open the bare bot link |
| Mini App URL hygiene | Edit Mini App URL | must be https, no `#`, no `?k=` | inspect the field |
| Mini App appearance | Configure Splash Screen, Background Color, Header Color | defaults produce a light flash before your dark UI loads | background and header `#07080c`, white splash icon |
| Second Mini App for admin | `/myapps` | if one was created with the key in the URL, remove the key | inspect stored apps |
| Commands | set by `action:"commands"` | no manual work, but verify | 6 private / 4 group |
| Menu button | set by `action:"menu"` | private chats only | button label present |
| Attachment menu | Bot Settings -> Configure Attachment Menu | optional | optional |
| Inline feedback | `/setinlinefeedback` | leave disabled; webhook ignores `chosen_inline_result` | disabled |

Non-BotFather items:

- **Privacy change after joining:** toggling privacy while the bot is already in a
  group may require removing and re-adding the bot.
- **Vercel env + Redeploy:** variables added after a deployment are invisible to it.
- **`vercel.json` rewrite scope:** must not shadow `/api/telegram`.
- **Node version:** 18+ for `AbortSignal.timeout`.
- **Webhook retries:** Telegram may retry non-2xx webhook requests. The current
  handler does not persist update IDs for durable deduplication; consider a shared
  idempotency store if duplicate replies become a problem.
- **Token hygiene:** if the token ever appeared in a screenshot, chat or client
  bundle, revoke it in BotFather and update `BOT_TOKEN`.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/start` silent | webhook not set | `action:"webhook"`, then read `getWebhookInfo` |
| `last_error_message: Wrong response from the webhook` | function crashing or not deployed | check function logs and env vars |
| 401 in webhook logs | secret mismatch | compare `TELEGRAM_WEBHOOK_SECRET`, re-run `action:"webhook"` |
| `@bot` offers nothing | inline disabled | BotFather `/setinline` |
| group buttons do not open the app | `web_app` used in a group | groups must use `url` deep links |
| inline returns empty list | archive.org timeout on cold start | retry; if frequent, raise `maxDuration` |
| `503 bot_not_configured` | missing `BOT_TOKEN` / `BOT_USERNAME` / `APP_URL` | add and Redeploy |
| `503 owner_key_not_configured` | no `ADMIN_KEY` or `STATS_KEY` | add and Redeploy |
| `400 webhook_secret_format` | secret has invalid characters | regenerate as hex |

---

## 12. Rollback

1. `action:"delete"` removes the webhook without discarding pending updates. The
   bot becomes silent again but the Mini App keeps working.
2. Revert the commit to remove the three files.
3. No client, database or storage migration is involved, so rollback is clean.

---

## 13. After MVP

- Automatic channel posting of new releases (needs admin rights + scheduler).
- `chosen_inline_result` handling to count which releases get shared.
- Per-artist inline search once artist profiles ship.
- Rate limiting per chat at the edge instead of instance memory.
- A scheduled health probe hitting `action:"info"` and alerting on `last_error_message`.

---

## 14. Acceptance checklist

- [ ] Three files present at the exact paths
- [ ] Six env variables set in Production, deployment Ready
- [ ] `action:"all"` returned `ok:true` with no `last_error_message`
- [ ] `supports_inline_queries: true`, `can_read_all_group_messages: false`
- [ ] `/start`, `/radio`, `/find` work in private chat
- [ ] `@bot query` produces cards in Saved Messages
- [ ] Test group: greeting posted, group buttons open the Mini App
- [ ] Mini App splash/background/header colours set to the dark palette
- [ ] No admin key present in any BotFather URL field
- [ ] Label channel post with catalogue and radio links opens the right screens