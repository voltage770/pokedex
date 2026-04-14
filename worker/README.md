# pokedex-news worker

Cloudflare Worker that fetches pokemon news from PokeBeach (homepage scrape)
and Nintendo Life (RSS), normalizes them, and serves a single JSON endpoint
with CORS enabled. The pokedex frontend calls this on every page load for
live news without needing a site rebuild.

Mirrors `scripts/news/fetch-news.js` — if you change parsing logic in one,
change it in the other.

---

## endpoints

```
GET  /             health check
GET  /health       health check
GET  /news.json    the feed
GET  /news.json?refresh=1   bypass edge cache (force upstream refetch)
```

Response shape matches `app/src/data/news.json`:

```jsonc
{
  "updated": "2026-04-14T02:19:06.244Z",
  "count":   20,
  "sources": [{ "id": "pokebeach", "name": "PokeBeach", "url": "..." }, ...],
  "failed":  [],    // any sources whose fetch threw
  "entries": [ ... ]
}
```

Response headers:

```
content-type:                 application/json; charset=utf-8
cache-control:                public, max-age=1800
access-control-allow-origin:  *
x-cache:                      HIT | MISS | ERROR
```

---

## local dev

```bash
cd worker
npm install           # installs wrangler (first time only)
npm run dev           # boots workerd on http://localhost:8787
```

Test it:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/news.json | jq '.count, .entries[0].title'
curl -i http://localhost:8787/news.json   # second call → x-cache: HIT
```

To point a local frontend build at the local worker instead of the deployed
one, create `app/.env.local`:

```
VITE_NEWS_API=http://localhost:8787/news.json
```

Then `cd app && npm run dev`.

---

## deploying to cloudflare (first time)

1. **Create a Cloudflare account** if you don't have one already.
   https://dash.cloudflare.com/sign-up — free tier is all you need. Workers
   free tier is 100,000 requests/day and 10ms CPU per request, both wildly
   more than this needs.

2. **Log in from the CLI:**
   ```bash
   cd worker
   npx wrangler login
   ```
   This opens a browser, you click "Allow", and wrangler stores an auth token
   in `~/.wrangler/config/default.toml`. One-time.

3. **Deploy:**
   ```bash
   npx wrangler deploy
   ```
   This uploads `src/index.js`, compiles it, and tells you the live URL. It
   will look like:
   ```
   https://pokedex-news.<your-subdomain>.workers.dev
   ```
   Your Cloudflare subdomain is set once per account (usually the first time
   you deploy) — it'll prompt you to pick one. The URL is permanent.

4. **Paste the URL into the frontend.** Open
   `app/src/pages/news-page.jsx` and update the `NEWS_API_URL` constant:
   ```js
   const NEWS_API_URL =
     import.meta.env.VITE_NEWS_API ||
     'https://pokedex-news.<your-subdomain>.workers.dev/news.json';
   ```

5. **Commit + push.** GitHub Actions rebuilds the site. Done.

---

## updating the worker later

Any code change to `src/index.js` → `npx wrangler deploy` → live within
seconds. No git, no commit, no Pages rebuild required. Existing cached
responses expire on their own (30 min TTL).

To purge the cache immediately, just hit `/news.json?refresh=1` once.

---

## ops

**Tail live logs:**
```bash
npm run tail
```
This streams `console.log` output from the deployed worker in real time —
great for debugging upstream parsing issues.

**Check metrics:**
- Dashboard → Workers & Pages → pokedex-news → Metrics
- Shows requests/day, cpu time, error rate, cache hit ratio

**Cache behavior:** the edge cache is per-colo (each Cloudflare data center
has its own copy). First hit in a given region is a MISS, subsequent hits
there are HITs for up to 30 min. This means upstream sources get hit once
per region per 30 min in the worst case — still well within polite scraping.

---

## architecture notes

- **Zero dependencies.** `src/index.js` is self-contained. The RSS parser
  and PokeBeach HTML scraper are both hand-rolled — no `fast-xml-parser`,
  `cheerio`, etc. Keeps the worker bundle small and fast to cold-start.
- **Stateless.** No KV, no D1, no R2. The only persistence is the Cache API.
- **Promise.allSettled for sources.** One source failing doesn't kill the
  whole response — it just shows up in `failed[]` and the other sources'
  data still returns.
- **`cf: { cacheTtl: 0 }` on upstream fetches.** Prevents Cloudflare from
  double-caching (worker edge cache + Cloudflare's transparent fetch cache)
  in a way that could serve stale data beyond our 30-min window.

---

## when to update this vs the node script

| scenario                                 | update                    |
| ---------------------------------------- | ------------------------- |
| adding a new source                      | both                      |
| tweaking label derivation / topic list   | both                      |
| fixing an upstream parser bug            | both                      |
| seeding the bundled fallback in the repo | `scripts/news/fetch-news.js` only |
| changing cache TTL / CORS / endpoints    | worker only               |

The node script still exists so you can regenerate `app/src/data/news.json`
by hand — this file is bundled into the build as the fallback that renders
when the worker is unreachable.
