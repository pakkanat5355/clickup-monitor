# ClickUp Monitor

BSS team dashboard for the central ClickUp list **✅ ITSM Project & Ticket Lists**. It shows:

- who updated ClickUp today;
- per-person performance;
- daily hours from time tracking;
- project time against the estimate;
- the open tasks.

Hosted on Netlify. It syncs from ClickUp every 30 minutes, and you can also start a sync from the page.

## How it works

| Part | File | What it does |
|---|---|---|
| Page | `public/index.html` | Static page. Loads `/api/clickup`. The **Sync ตอนนี้** button calls `POST /api/sync`. |
| Login | `netlify/edge-functions/auth.mjs` | Puts every path behind one team password (`SITE_PASSWORD`). The login cookie lasts 30 days. Log out at `/logout`. |
| API | `netlify/functions/api.mjs` | `GET /api/clickup` returns the latest snapshot. `GET /api/sync` returns the sync state. `POST /api/sync` starts a sync, at most once every 2 minutes. |
| Sync | `netlify/functions/pull-background.mjs` | Background function, about 40 s and about 30 ClickUp calls. Runs `lib/pull.mjs` and saves the result to Netlify Blobs (store `clickup`). |
| Schedule | `netlify/functions/scheduled-sync.mjs` | Every 30 min, 07:00–23:30 Bangkok time, Mon–Sat. |

ClickUp is only read, never written. The token stays in Netlify environment variables. Snapshot data is never committed: `public/clickup.json` is git-ignored.

## Deploy on Netlify

1. **Add new site → Import an existing project → GitHub →** `clickup-monitor`. Leave the build settings empty; `netlify.toml` covers them.
2. **Site configuration → Environment variables**:

   | Key | Value |
   |---|---|
   | `CLICKUP_TOKEN` | ClickUp personal API token (`pk_…`) |
   | `SITE_PASSWORD` | Team password for the login page |
   | `SYNC_SECRET` | Any long random string. It protects the background function. |

3. Redeploy so the variables take effect.
4. Open the site, log in, and press **Sync ตอนนี้** once to make the first snapshot. After that the schedule keeps it fresh.

Scheduled functions only run on the published (production) deploy.

## Local

```bash
npm install
npm run pull      # uses %USERPROFILE%\.clickup-token, writes public/clickup.json
npm run preview   # http://localhost:8787. The page falls back to clickup.json when /api is missing.
```

`netlify dev` runs the full stack, including login, API and Blobs, if the Netlify CLI is installed.

## Settings worth knowing

Defined in `lib/pull.mjs`:

| Constant | Value | Meaning |
|---|---|---|
| `LIST` | — | The central list ID |
| `SINCE` | `2026-10-01` | Start of the time-entry window |
| `PROJ_SINCE` | `2025-06-01` | Start of project history |
| `MEMBERS` | — | Maps ClickUp user ID to nickname |
| `MD_H` | 8 | Hours per manday |

The team order on the page is set by `ORDER` in `public/index.html`. A utilisation of 100% means 6 hours a day (`CU_CAP`).
