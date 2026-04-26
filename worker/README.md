# pokedex-news worker

Cloudflare Worker that fetches pokemon news from PokeBeach (homepage scrape)
and Nintendo Life (RSS), normalizes them, and serves a single JSON endpoint
with CORS enabled. The pokedex frontend calls this on every page load for
live news without needing a site rebuild.

Parsing pipeline lives in `scripts/news/news-core.mjs` — both this worker
and the bundled-fallback generator (`scripts/news/fetch-news.mjs`) import
from it, so they can't drift. This file is purely worker glue: CORS, edge
cache, routing.

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

**Cache behavior / update cadence:** controlled by one constant near the top
of `src/index.js`:

```js
const CACHE_TTL_SECONDS = 30 * 60; // 30 min
```

What this means end-to-end:

1. The frontend's news page hits `/news.json` on every mount — there's no
   browser-side caching of the JSON itself.
2. The worker checks Cloudflare's per-colo edge cache (`caches.default`) for
   a copy of the response. If present and not yet expired → HIT, returned
   in ~60ms, no upstream calls.
3. If absent or expired → MISS. The worker fetches pokebeach and serebii in
   parallel, parses, dedupes, builds the payload, writes it back to the
   cache, and returns it (~1–3 sec depending on upstream latency).
4. Subsequent visitors to that colo within the next 30 minutes get HITs.

So in practice the **first visitor after each 30-minute window expires**
pays the ~2 sec upstream refresh; everyone else in that region for the next
30 minutes sees the cached copy instantly. "That region" matters because
the edge cache is **per Cloudflare data center** — each geographic region
has its own independent cache. Visitors in SJC and FRA each trigger their
own refreshes. For low-traffic sites that's at most a handful of upstream
fetches per hour, very polite to the sources.

**Tuning:** shorter TTL = fresher news + more misses + more upstream hits.
Longer TTL = fewer misses but staler content. 30 min is a good balance for
pokemon news sources that don't publish more than a few times per day.

**Force refresh anytime:** `GET /news.json?refresh=1` bypasses the cache
for that one call, rebuilds the payload from upstream, and writes the fresh
copy back into the cache. Handy when you deploy a parser change and want
the effect visible immediately without waiting out the TTL.

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

## where to make changes

| scenario                                 | update                          |
| ---------------------------------------- | ------------------------------- |
| adding a new source                      | `scripts/news/news-core.mjs`    |
| tweaking label derivation / topic list   | `scripts/news/news-core.mjs`    |
| fixing an upstream parser bug            | `scripts/news/news-core.mjs`    |
| seeding the bundled fallback             | `scripts/news/fetch-news.mjs`   |
| changing cache TTL / CORS / endpoints    | worker only (`src/index.js`)    |

`fetch-news.mjs` is a thin wrapper around the same `buildPayload` the worker
uses — running it (`node news/fetch-news.mjs`) regenerates `app/src/data/news.json`,
which is bundled into the build as the fallback that renders when the worker
is unreachable.
