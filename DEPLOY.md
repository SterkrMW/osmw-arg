# Combo Tracker — Deployment Guide

## Prerequisites
- [Vercel account](https://vercel.com)
- Vercel CLI: `npm i -g vercel`

---

## 1. Create the Vercel project

From the repo root, link the `tools/combo-tracker/` directory as a new Vercel project:

```bash
cd tools/combo-tracker
vercel link          # follow prompts: create new project, root dir is tools/combo-tracker
```

Set the **Root Directory** to `tools/combo-tracker` and the **Build Command** to `npm run build` if Vercel doesn't detect it automatically.

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
