// regenerates the bundled news.json fallback at app/src/data/news.json.
// the live feed comes from the cloudflare worker (worker/src/index.js); this
// script's output is the on-disk safety net that the frontend renders if the
// worker is unreachable / times out / returns garbage.
//
// the parsing pipeline is shared with the worker — both import buildPayload
// from news-core.mjs so they can't drift. only the environment glue differs:
// the worker emits a Response + edge-caches it; this script writes JSON to
// disk.
//
// run with: node news/fetch-news.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import { fileURLToPath }            from 'node:url';
import { buildPayload }             from './news-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE  = join(__dirname, '../../app/src/data/news.json');

console.log('fetching upstream sources...');
const payload = await buildPayload();

if (payload.failed.length) {
  console.warn(`failed sources: ${payload.failed.map(f => `${f.id} (${f.error})`).join(', ')}`);
}
if (payload.collapsed > 0) {
  console.log(`collapsed ${payload.collapsed} cross-source near-duplicate${payload.collapsed === 1 ? '' : 's'}`);
}

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
console.log(`done. ${payload.entries.length} entries written to ${OUT_FILE}`);
