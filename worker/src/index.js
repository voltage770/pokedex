// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  pokedex-news worker                                                     ║
// ║  --------------------                                                    ║
// ║  cloudflare worker serving the live news feed at /news.json.             ║
// ║                                                                          ║
// ║    GET /news.json                                                        ║
// ║      1. check the per-region edge cache for a pre-built response         ║
// ║      2. cache HIT  → return it instantly (~60ms)                         ║
// ║      3. cache MISS → buildPayload() (parallel upstream fetches),         ║
// ║                      write back to the edge cache, return                ║
// ║                                                                          ║
// ║  the parsing/dedup/normalization pipeline lives in                       ║
// ║  scripts/news/news-core.mjs — shared with the bundled-fallback           ║
// ║  generator at scripts/news/fetch-news.mjs so they can never drift.       ║
// ║  what's in this file is purely worker glue: CORS, edge cache, routing.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { buildPayload } from '../../scripts/news/news-core.mjs';

// edge cache TTL. tuning balance: ~30 min keeps news fresh while keeping
// upstream fetches at most ~twice per cache window per cloudflare region.
// override per-request with ?refresh=1 to bypass and force a fresh build.
const CACHE_TTL_SECONDS = 30 * 60;

// the frontend lives at voltage770.github.io and the worker lives at
// *.workers.dev — cross-origin, so the browser blocks responses without
// these headers. '*' is fine because we serve public data with no credentials.
const CORS_HEADERS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-max-age':       '86400',
};

function jsonResponse(obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      'content-type':  'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight — browsers send OPTIONS before cross-origin requests
    // that aren't simple GET/HEAD. respond 204 with the CORS headers.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'pokedex-news',
        endpoint: '/news.json',
        cache_ttl_seconds: CACHE_TTL_SECONDS,
      });
    }

    if (url.pathname !== '/news.json') {
      return new Response('not found', { status: 404, headers: CORS_HEADERS });
    }

    // edge cache: caches.default is cloudflare's per-data-center cache, used
    // like a key/value store of Request → Response. clean cacheKey (just url)
    // so every visitor in a region shares one cached response. ?refresh=1
    // bypasses for parser-debugging on a known-good upstream snapshot.
    const cache    = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const bypass   = url.searchParams.get('refresh') === '1';

    if (!bypass) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const h = new Headers(cached.headers);
        h.set('x-cache', 'HIT');
        return new Response(cached.body, { status: cached.status, headers: h });
      }
    }

    // cache miss: build a fresh payload from the shared core.
    let payload;
    try {
      payload = await buildPayload();
    } catch (err) {
      // buildPayload only throws on truly unexpected bugs — failed sources
      // land in the returned `failed[]`, not in a thrown error. return a
      // non-cacheable error response so the next request retries clean.
      return jsonResponse(
        { error: 'fetch failed', detail: String(err && err.message || err) },
        { 'cache-control': 'no-store', 'x-cache': 'ERROR' },
      );
    }

    const response = jsonResponse(payload, { 'x-cache': 'MISS' });

    // ctx.waitUntil keeps the worker alive long enough to finish the cache
    // write AFTER we return — user gets the response immediately, no extra
    // latency. clone() because Response bodies can only be read once.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};
