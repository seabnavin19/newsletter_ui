# AI Signal — visitor analytics

A tiny Cloudflare Worker + D1 database that counts visitors per day.

- **`/stats`** – JSON keyed by date: visits, unique visitors, audio plays, shares,
  story videos, and the top referrers / countries / devices for each day.
- **`/`** – the same numbers as a simple dashboard.

Raw IP addresses are never stored. Each visitor is a SHA-256 hash of
IP + browser + a secret that changes daily, so a person counts once per day but
can't be tracked across days or identified. Bots and link-preview crawlers are skipped.

## Deploy (one time, ~5 minutes)

You need Node.js installed. From this `analytics/` folder:

```bash
npx wrangler login                                   # opens Cloudflare in your browser
npx wrangler d1 create ai-signal-analytics           # prints a database_id
#   → paste that id into wrangler.toml (database_id = "...")
npx wrangler d1 execute ai-signal-analytics --remote --file=schema.sql
npx wrangler secret put SALT_SECRET                  # type any long random text
npx wrangler secret put STATS_TOKEN                  # optional: password for /stats
npx wrangler deploy                                  # prints https://ai-signal-analytics.<you>.workers.dev
```

Then set `ANALYTICS_URL` in `../app.js` to that URL (no trailing slash) and push.

## Viewing the numbers

- Dashboard: `https://ai-signal-analytics.<you>.workers.dev/?key=YOUR_STATS_TOKEN`
- JSON: `https://ai-signal-analytics.<you>.workers.dev/stats?days=30&key=YOUR_STATS_TOKEN`

Leave out `?key=` if you didn't set a `STATS_TOKEN`.

```json
{
  "2026-10-14": {
    "visits": 312, "unique": 187,
    "audio_plays": 41, "shares": 9, "story_videos": 3,
    "referrers": { "direct": 120, "tiktok.com": 44, "youtube.com": 15 },
    "countries": { "KH": 90, "US": 40 },
    "devices": { "mobile": 140, "desktop": 47 }
  }
}
```

Days are in UTC. The free Cloudflare plan (100k requests/day, 5 GB of D1) is far
more than this site needs.
