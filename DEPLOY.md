# Combo Tracker — Deployment Guide

## Prerequisites
- [Vercel account](https://vercel.com)
- Vercel CLI: `npm i -g vercel`

---

## 1. Create the Vercel project

From the game-server repo root, link the app directory as a new Vercel project:

```bash
cd tools/combo-tracker/osmw-arg
vercel link          # follow prompts: create or select the app project
```

Set the **Root Directory** to `tools/combo-tracker/osmw-arg` when deploying from the game-server repository, or `.` when deploying this app's standalone repository. Use **Build Command** `npm run build` and **Output Directory** `dist` if Vercel doesn't detect them automatically.

---

## 2. Attach a KV database

```bash
vercel storage create          # choose KV (Upstash Redis), accept defaults
vercel link --storage          # link the new KV store to this project
vercel env pull .env.production.local   # pulls KV_* vars locally for verification
```

---

## 3. Set the API key

Generate any long random string as the shared secret:

```bash
vercel env add COMBO_UNLOCK_API_KEY   # paste your secret, select all environments
```

Store the same value somewhere safe — you'll need it for the game server config.

---

## 4. Deploy

```bash
vercel --prod
```

Note the production URL (e.g. `https://combo-tracker-abc123.vercel.app`).

### Shared-link previews

Deploy the functions and `vercel.json` alongside the frontend. Planner links at `/` (and `/index.html`) are routed to `api/share.ts` before the static HTML lookup, which adds Open Graph/Twitter metadata while serving the same app. `api/og.ts` supplies the 1200×630 PNG. `dist/index.html` is explicitly included in the HTML function bundle.

For a custom public domain, optionally configure `PUBLIC_SITE_URL` as its HTTPS origin with no path or query. Vercel's production/deployment URL is used when this is unset. Previews use only the shared A/B selections; local storage, finder settings, and chart preferences do not enter them.

Run `npm run test:sharing`, both typechecks, `npm run build`, and the browser suite before deployment. `npm start` and `npm run preview` support local previews through Vite. After deployment, verify an existing comparison link such as `/?planner=1&a=0m-3m-2f&b=1f-1m-1f`: inspect its **HTTP response source** for `og:image`, then fetch that absolute image URL and confirm `Content-Type: image/png`. Also verify a single path and an invalid link. This smoke check matters because local middleware tests do not exercise Vercel's production routing. Finally paste a link into the intended social/chat service to confirm its own cache and preview behavior.

Implementation references: [Vercel OG image generation](https://vercel.com/docs/og-image-generation) and [conditional routing configuration](https://vercel.com/docs/project-configuration/vercel-json#routes).

---

## 5. Configure the game server

Add to `server.config.json`:

```json
"comboUnlock": {
    "enabled": true,
    "url": "https://combo-tracker-abc123.vercel.app/api/unlock",
    "apiKey": "<your secret>"
}
```

Restart the game server.

---

## 6. Verify end-to-end

```bash
cd tools/combo-tracker

# Fire a test unlock directly at the live endpoint
COMBO_UNLOCK_API_KEY=<your secret> DEV_URL=https://combo-tracker-abc123.vercel.app \
    node scripts/test-unlock.mjs 3_2 "TestPlayer"

# Confirm it appears on the live site
open https://combo-tracker-abc123.vercel.app
```

Then do a second rebirth in-game and confirm the webhook fires (check game server logs for any `Combo unlock webhook failed` errors).

---

## Shutdown (all 16 discovered)

Set `"enabled": false` in `server.config.json` and restart the game server. The site remains live as a permanent record — no Vercel changes needed.
