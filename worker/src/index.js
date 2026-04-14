// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  pokedex-news worker                                                     ║
// ║  --------------------                                                    ║
// ║  a cloudflare worker is a small javascript program that runs on          ║
// ║  cloudflare's edge network — in practice, in hundreds of data centers    ║
// ║  worldwide. when a browser makes a request to your worker's URL, one of  ║
// ║  those data centers boots a lightweight v8 isolate (not a container, not ║
// ║  a node process — just a sandboxed js runtime), runs the `fetch()`       ║
// ║  handler you exported below, and returns whatever Response you build.    ║
// ║                                                                          ║
// ║  the runtime is NOT node. there is no `fs`, no `process`, no `require`.  ║
// ║  instead you get the web-platform APIs (`fetch`, `Request`, `Response`,  ║
// ║  `Headers`, `URL`, `Cache`, etc.) plus a handful of cloudflare-specific  ║
// ║  extensions like `caches.default` and the `cf:` fetch option.            ║
// ║                                                                          ║
// ║  this worker has a single job:                                           ║
// ║                                                                          ║
// ║    GET /news.json                                                        ║
// ║      1. check the edge cache for a pre-built response                    ║
// ║      2. cache HIT  → return it instantly                                 ║
// ║      3. cache MISS → fetch pokebeach + nintendo life in parallel,        ║
// ║                      parse them, build a normalized json payload,       ║
// ║                      write it back to the edge cache for next time,     ║
// ║                      return it to the caller                            ║
// ║                                                                          ║
// ║  the frontend (app/src/pages/news-page.jsx) fetches this url on every     ║
// ║  page load. because the response is cached for 30 minutes, upstream      ║
// ║  sources get hit at most ~twice per cache window per cloudflare region,  ║
// ║  regardless of how many visitors you have.                               ║
// ║                                                                          ║
// ║  most of the parsing logic mirrors scripts/news/fetch-news.js — when     ║
// ║  you change one, change the other. the node script regenerates the      ║
// ║  bundled fallback json; this worker serves live data. both must agree.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ─── knobs you might tweak ────────────────────────────────────────────────────

// how long the cloudflare edge cache holds onto a built response before
// considering it stale. 30 min is a good balance between "fresh news" and
// "don't hammer upstream sources". cloudflare serves cached responses
// literally from memory at the nearest data center, so HITs are ~1ms.
const CACHE_TTL_SECONDS = 30 * 60;

// the most entries ever included in a response. protects against a runaway
// upstream source dumping 500 items into the payload.
const MAX_ENTRIES = 50;

// entry excerpt target length. source descriptions are truncated to this
// many characters on a word boundary before being returned.
const EXCERPT_LEN = 220;

// real browser user-agent. some sources (pokebeach) block the default
// node/worker UA via cloudflare bot rules, so we pretend to be chrome.
// this is also what the local node fetcher uses.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ─── the sources ─────────────────────────────────────────────────────────────
//
// each source entry describes one upstream site. the `kind` field selects
// which parser to use on the response body:
//   - 'rss'            → treats body as RSS 2.0 xml (parseRss below)
//   - 'pokebeach-html' → scrapes pokebeach's homepage html (parsePokebeach)
//
// `pokemonOnly: true` means the source is a general gaming feed and we need
// to filter out non-pokemon items after parsing.

const SOURCES = [
  {
    id:   'pokebeach',
    name: 'pokebeach',
    url:  'https://www.pokebeach.com/',
    kind: 'pokebeach-html',
    // pokebeach's RSS feed endpoints (/feed, /rss, /news/feed, etc.) all
    // return 403 because they sit behind cloudflare bot protection. the
    // homepage html is not blocked, so we scrape the article listing there
    // instead. per-article pages are also blocked, so excerpts stay empty
    // for pokebeach entries — cards still render fine without them.
  },
  {
    id:   'nintendolife',
    name: 'nintendo life',
    url:  'https://www.nintendolife.com/feeds/news',
    kind: 'rss',
    pokemonOnly: true,
    // nintendo life is a general switch-news site. their RSS feed is clean
    // and has full content:encoded + media:content per item, but it's not
    // filtered to pokemon — their `?tag=pokemon` query param is cosmetic.
    // we keyword-filter after parsing.
  },
];

// keywords used by the `pokemonOnly` filter. case-insensitive substring match.
const POKEMON_KEYWORDS = ['pokemon', 'pokémon', 'pokeball', 'pokéball', 'pikachu', 'game freak'];

// ─── topic labels ────────────────────────────────────────────────────────────
//
// each news entry gets a small label/pill shown in the UI ("pokémon tcg",
// "pokémon pokopia", etc.). this array is walked in order, first match wins.
// ORDER MATTERS: specific topics come before generic ones so "pokemon go"
// isn't swallowed by a bare "pokemon" fallback.

const TOPIC_LABELS = [
  { label: 'pokémon go',        patterns: ['pokemon go', 'pokémon go', 'niantic'] },
  { label: 'pokémon home',      patterns: ['pokemon home', 'pokémon home'] },
  { label: 'pokémon tcg',       patterns: ['tcg', 'trading card', 'card game', 'booster pack'] },
  { label: 'pokémon champions', patterns: ['pokemon champions', 'pokémon champions'] },
  { label: 'pokémon pokopia',   patterns: ['pokopia'] },
  { label: 'legends z-a',       patterns: ['legends z-a', 'legends: z-a', 'legends za'] },
  { label: 'legends arceus',    patterns: ['legends arceus', 'legends: arceus'] },
  { label: 'scarlet & violet',  patterns: ['scarlet and violet', 'scarlet & violet', 'scarlet/violet', 'paldea', 'indigo disk', 'teal mask'] },
  { label: 'sword & shield',    patterns: ['sword and shield', 'sword & shield', 'galar'] },
  { label: 'brilliant diamond', patterns: ['brilliant diamond', 'shining pearl', 'bdsp'] },
  { label: 'pokémon unite',     patterns: ['pokemon unite', 'pokémon unite'] },
  { label: 'pokémon sleep',     patterns: ['pokemon sleep', 'pokémon sleep'] },
  { label: 'pokémon masters',   patterns: ['pokemon masters', 'pokémon masters'] },
  { label: 'pokémon cafe',      patterns: ['pokemon cafe', 'pokémon café', 'pokémon cafe'] },
  { label: 'anime',             patterns: ['anime', 'horizons', 'ash ketchum'] },
  { label: 'pokémon presents',  patterns: ['pokemon presents', 'pokémon presents', 'pokemon direct'] },
  { label: 'competitive',       patterns: ['vgc', 'world championships', 'worlds 20'] },
  { label: 'merchandise',       patterns: ['plush', 'amiibo', 'merchandise', 'pokemon center', 'pokémon center'] },
];

// month name → zero-indexed month, used when parsing pokebeach's human dates.
const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may:  4, jun:  5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 1 — html / xml helpers                                          ║
// ║  ------------------------------                                          ║
// ║  the workers runtime has no DOM, no jsdom, no cheerio. we parse rss      ║
// ║  and html with plain string ops and regexes. that's fine here because    ║
// ║  both formats we care about are well-structured by their publishers.    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// RSS publishers often wrap text in <![CDATA[...]]> blocks so html markup
// inside a <title> or <description> doesn't need entity-encoding. this
// strips the CDATA wrapper if present.
function unwrapCdata(s) {
  if (!s) return '';
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

// convert HTML entities back to characters. `&amp;` is intentionally LAST
// so we don't double-decode something like `&amp;lt;` into `<`.
function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g,         (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g,  '&');
}

// strip all html tags from a string. before stripping we insert a space at
// every block-level closing tag (</p>, </div>, </li>, etc.) so adjacent
// words from different paragraphs don't fuse into "wordword" after the
// tags are removed. collapses whitespace runs at the end.
function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi,  '')
      .replace(/<\/(p|div|li|br|h[1-6]|tr|td|section|article|header|footer|blockquote)[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  ).replace(/\s+/g, ' ').trim();
}

// truncate a string to `max` chars, breaking on the last space if it's
// reasonably close to the end (otherwise hard-cut). appends an ellipsis.
function truncate(s, max) {
  if (!s || s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// pull the first <img src="..."> out of a blob of html.
function firstImage(html) {
  if (!html) return null;
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return img ? img[1] : null;
}

// grab the text contents of a single tag, like `<title>foo</title>` → "foo".
// handles tags with attributes (`<title type="html">foo</title>`) and
// unwraps cdata automatically.
function getTag(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? unwrapCdata(m[1]).trim() : '';
}

// grab the value of a single attribute on a single tag. e.g. for
// `<media:content url="..." />` you'd call getAttr(block, 'media:content', 'url').
function getAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

// turn a title or arbitrary string into a url-safe slug, used when minting
// stable entry ids.
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 2 — rss 2.0 parser                                              ║
// ║  --------------------                                                    ║
// ║  RSS 2.0 feeds are xml that looks like:                                  ║
// ║                                                                          ║
// ║    <rss>                                                                 ║
// ║      <channel>                                                           ║
// ║        <title>site name</title>                                          ║
// ║        <item>                                                            ║
// ║          <title>article 1</title>                                        ║
// ║          <link>https://...</link>                                        ║
// ║          <pubDate>...</pubDate>                                          ║
// ║          <description>summary</description>                              ║
// ║          <content:encoded>full html</content:encoded>                    ║
// ║          <media:content url="..."/>                                      ║
// ║        </item>                                                           ║
// ║        <item>... another article ...</item>                              ║
// ║      </channel>                                                          ║
// ║    </rss>                                                                ║
// ║                                                                          ║
// ║  we just pull out every <item>...</item> block and extract the few      ║
// ║  fields we care about. no dtd validation, no namespace resolution —     ║
// ║  regex string matching is fine for the well-formed feeds we target.     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function parseRss(xml) {
  const items = [];
  // find every <item>...</item> block regardless of attributes.
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const blocks = xml.match(itemRe) || [];

  for (const block of blocks) {
    const title       = stripHtml(getTag(block, 'title'));
    const link        = getTag(block, 'link');
    const pubDate     = getTag(block, 'pubDate');
    const description = getTag(block, 'description');
    const content     = getTag(block, 'content:encoded');
    // try a few different image conventions: media:content, media:thumbnail,
    // enclosure. publishers vary. first match wins.
    const mediaUrl    = getAttr(block, 'media:content',   'url')
                     || getAttr(block, 'media:thumbnail', 'url')
                     || getAttr(block, 'enclosure',       'url');
    // some feeds tag entries with category labels (useful for topic filtering)
    const categories = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map(m => stripHtml(unwrapCdata(m[1])))
      .filter(Boolean);

    items.push({ title, link, pubDate, description, content, mediaUrl, categories });
  }
  return items;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 3 — pokebeach homepage scraper                                  ║
// ║  -------------------------------------                                  ║
// ║  pokebeach's rss feed is blocked at the cloudflare layer, but their     ║
// ║  homepage html is not. each recent article lives inside a top-level     ║
// ║  <article id="post-NNNN" class="... category-{slug}"> ... </article>    ║
// ║  on the homepage. from that block we can pull:                          ║
// ║                                                                          ║
// ║    - title + canonical article url (from <h2 class="entry-title">)      ║
// ║    - featured image (from .xpress_articleImage--full > img)             ║
// ║    - publication date (from the entry-meta "Posted on" label)           ║
// ║    - category slug (from the article's `category-*` class)              ║
// ║                                                                          ║
// ║  what we can NOT get from the homepage is article body text, so the     ║
// ║  `description` and `content` fields stay empty for pokebeach entries.   ║
// ║  the ui renders fine without them (label + title + image + date).      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// pokebeach prints dates like "Apr 12, 2026 at 10:54 PM". their servers run
// on eastern time; we don't know whether that's EST or EDT on any given day,
// so we approximate by treating the date as UTC-4 (EDT) which is correct
// for most of the year. precision isn't critical for "how long ago was this
// posted" display purposes.
function parsePokebeachDate(text) {
  if (!text) return null;
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i);
  if (!m) return null;

  const mon = MONTH_MAP[m[1].slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  const day  = Number(m[2]);
  const year = Number(m[3]);
  let hour = m[4] ? Number(m[4]) : 12;
  const min  = m[5] ? Number(m[5]) : 0;
  const mer  = m[6] ? m[6].toUpperCase() : null;

  // 12-hour → 24-hour conversion. 12 AM is midnight (00), 12 PM is noon (12).
  if (mer === 'PM' && hour < 12) hour += 12;
  if (mer === 'AM' && hour === 12) hour = 0;

  // shift eastern time → UTC by adding 4 hours before building the Date.
  const d = new Date(Date.UTC(year, mon, day, hour + 4, min, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

// walk the pokebeach homepage html and return an array of raw item objects
// shaped the same way parseRss returns them. that way the rest of the
// pipeline doesn't need to care which parser produced the items.
function parsePokebeach(html) {
  const items = [];
  const articleRe = /<article\s+id="post-(\d+)"\s+class="([^"]*)">([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articleRe.exec(html)) !== null) {
    const postId    = match[1];
    const classAttr = match[2];
    const body      = match[3];

    // the category slug comes from a `category-{slug}` token in the class
    // attribute. we turn hyphens into spaces so downstream label derivation
    // ("tcg", "video games", etc.) can keyword-match on it.
    const catMatch = classAttr.match(/category-([a-z0-9-]+)/i);
    const category = catMatch ? catMatch[1] : null;

    // title + canonical article url from the first <h2 class="entry-title">
    // block. if there's no title we skip the article entirely.
    const titleMatch = body.match(/<h2[^>]*class="entry-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!titleMatch) continue;
    const url   = decodeEntities(titleMatch[1]);
    const title = stripHtml(titleMatch[2]);

    // featured image lives in <div class="xpress_articleImage--full">.
    // if we can't find the full-size image, fall back to the first <img>
    // in the block (covers edge cases where the listing lacks a featured
    // image wrapper).
    let image = null;
    const imgBlock = body.match(/class="xpress_articleImage--full"[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (imgBlock) image = decodeEntities(imgBlock[1]);
    if (!image) image = firstImage(body);

    // date comes from a screen-reader-visible "Posted on" label.
    let dateText = null;
    const dateBlock = body.match(/<span class="screen-reader-text">Posted on<\/span>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (dateBlock) dateText = stripHtml(dateBlock[1]);
    const parsed = parsePokebeachDate(dateText);

    items.push({
      title,
      link:        url,
      // build a real UTC date string so downstream `new Date(pubDate)`
      // produces a correct ISO timestamp.
      pubDate:     parsed ? parsed.toUTCString() : null,
      description: '',
      content:     '',
      mediaUrl:    image,
      categories:  category ? [category.replace(/-/g, ' ')] : [],
      _postId:     postId,
    });
  }
  return items;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 4 — normalize                                                   ║
// ║  ---------------------                                                   ║
// ║  both parsers above return objects with the same shape (title, link,    ║
// ║  pubDate, description, content, mediaUrl, categories). `normalize`      ║
// ║  turns one of those into the final shape the frontend wants:            ║
// ║                                                                          ║
// ║  { id, source, source_name, label, title, url, published, excerpt,      ║
// ║    image, youtube_id, tags }                                             ║
// ║                                                                          ║
// ║  it also picks a topic label, extracts a youtube embed id if the body   ║
// ║  contains one, and mints a stable id for deduping.                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// decide what pill label this entry should get. concatenates title + excerpt
// + tags into a haystack and walks TOPIC_LABELS in declaration order,
// returning the first pattern that matches. falls through to a generic
// "pokémon news" label if nothing matches.
function deriveLabel(title, excerpt, tags = []) {
  const hay = `${title} ${excerpt} ${tags.join(' ')}`.toLowerCase();
  for (const t of TOPIC_LABELS) {
    if (t.patterns.some(p => hay.includes(p))) return t.label;
  }
  return 'pokémon news';
}

// if the article body contains a youtube video (iframe embed or a direct
// link), pull out the 11-char video id so the frontend can render an
// in-place iframe viewport instead of just an image thumbnail.
function firstYoutubeId(html) {
  if (!html) return null;
  const patterns = [
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

// used by the `pokemonOnly` filter on general gaming feeds: does this item
// mention pokemon in any useful way?
function matchesPokemon(title, excerpt) {
  const hay = `${title} ${excerpt}`.toLowerCase();
  return POKEMON_KEYWORDS.some(k => hay.includes(k));
}

function normalize(source, raw) {
  // pubDate → iso timestamp (or null if the date is missing/invalid).
  const published = raw.pubDate ? new Date(raw.pubDate) : null;
  const iso = published && !Number.isNaN(published.getTime()) ? published.toISOString() : null;

  // pick the richest body field available and derive excerpt + first image
  // + youtube id from it in one pass.
  const body = raw.content || raw.description || '';
  const excerpt = truncate(stripHtml(body), EXCERPT_LEN);
  const image = raw.mediaUrl || firstImage(body) || null;
  const youtubeId = firstYoutubeId(body);

  const label = deriveLabel(raw.title || '', excerpt || '', raw.categories || []);

  // stable id = source + date (for daily uniqueness) + slugified title.
  // two runs of the fetcher will produce the same id for the same article,
  // which lets us dedupe across sources and across cache refreshes.
  const dateKey = iso ? iso.slice(0, 10) : 'undated';
  const id = `${source.id}-${dateKey}-${slugify(raw.title) || 'untitled'}`;

  return {
    id,
    source:      source.id,
    source_name: source.name,
    label,
    title:       raw.title || '(untitled)',
    url:         raw.link  || null,
    published:   iso,
    excerpt,
    image,
    youtube_id:  youtubeId,
    tags:        (raw.categories || []).slice(0, 5),
  };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 5 — source fetching + payload assembly                          ║
// ║  ----------------------------------------------                          ║
// ║  `fetchSource` hits one upstream site, picks the right parser based on  ║
// ║  source.kind, and returns a list of normalized entries.                 ║
// ║                                                                          ║
// ║  `buildPayload` runs all sources in parallel via Promise.allSettled so  ║
// ║  one failing source doesn't take the whole response down. sources that  ║
// ║  throw land in `failed[]` and the ones that worked still return data.   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

async function fetchSource(source) {
  // match the Accept header to the format we expect — helps a few servers
  // pick the right representation when they support content negotiation.
  const accept = source.kind === 'pokebeach-html'
    ? 'text/html,application/xhtml+xml'
    : 'application/rss+xml, application/xml, text/xml, */*';

  // the `cf:` field is a cloudflare-specific extension to the fetch options.
  // when your worker calls fetch(), cloudflare has its own transparent
  // cache in front of the upstream server. `cacheTtl: 0` + `cacheEverything:
  // false` tells cloudflare NOT to cache the upstream response on its own
  // — we want to control caching ourselves in Section 6 below. without
  // this you could end up with two layers of cache fighting each other
  // and stale data sticking around longer than our CACHE_TTL_SECONDS.
  const res = await fetch(source.url, {
    headers: {
      'user-agent':      USER_AGENT,
      accept,
      'accept-language': 'en-US,en;q=0.9',
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  if (!res.ok) throw new Error(`${source.id}: ${res.status} ${res.statusText}`);
  const body = await res.text();

  // dispatch to the right parser based on source.kind.
  const raws = source.kind === 'pokebeach-html' ? parsePokebeach(body) : parseRss(body);

  // normalize each raw item into the final shape.
  let items = raws.map(r => normalize(source, r));

  // optional pokemon-keyword filter for general feeds (nintendo life).
  if (source.pokemonOnly) {
    items = items.filter(i => matchesPokemon(i.title, i.excerpt));
  }

  return items;
}

async function buildPayload() {
  // kick off all source fetches in parallel. Promise.allSettled never
  // rejects — it waits for every promise and reports each as either
  // 'fulfilled' or 'rejected', so one bad source won't poison the batch.
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));

  const all    = [];
  const failed = [];

  settled.forEach((s, i) => {
    const source = SOURCES[i];
    if (s.status === 'fulfilled') {
      all.push(...s.value);
    } else {
      // record the failure so the response body tells the frontend which
      // source broke. easier to debug than silent "why are there fewer
      // entries than usual".
      failed.push({ id: source.id, error: String(s.reason && s.reason.message || s.reason) });
    }
  });

  // dedupe entries by stable id. across two sources you can occasionally
  // get the same article (e.g. if you ever add a mirror).
  const seen = new Set();
  const deduped = all.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // sort newest-first by published iso string. string-compare works here
  // because iso timestamps sort correctly lexicographically. items with
  // no published date sink to the bottom so they don't claim the top spot.
  deduped.sort((a, b) => {
    if (!a.published && !b.published) return 0;
    if (!a.published) return  1;
    if (!b.published) return -1;
    return b.published.localeCompare(a.published);
  });

  return {
    updated: new Date().toISOString(),
    count:   Math.min(deduped.length, MAX_ENTRIES),
    sources: SOURCES.map(s => ({ id: s.id, name: s.name, url: s.url })),
    failed,
    entries: deduped.slice(0, MAX_ENTRIES),
  };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SECTION 6 — the worker entry point                                      ║
// ║  ----------------------------------                                      ║
// ║  everything above is the "business logic". this section is the actual   ║
// ║  worker interface: what happens when a browser hits the worker url.     ║
// ║                                                                          ║
// ║  the shape is:                                                           ║
// ║                                                                          ║
// ║    export default {                                                      ║
// ║      async fetch(request, env, ctx) { ...return a Response... }          ║
// ║    }                                                                     ║
// ║                                                                          ║
// ║  `request`  is a standard web-platform Request object                    ║
// ║  `env`      is where bindings live (kv, r2, secrets) — we don't use it  ║
// ║  `ctx`      is the execution context, main use is ctx.waitUntil()       ║
// ║                                                                          ║
// ║  you MUST return a Response (sync or async). whatever you return is     ║
// ║  what the browser sees.                                                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// CORS headers attached to every response. because the frontend lives at
// voltage770.github.io and the worker lives at *.workers.dev, these are
// cross-origin requests and the browser blocks the response unless we
// explicitly allow the origin. '*' allows any origin, which is fine here
// because the worker serves public data and has no credentials.
const CORS_HEADERS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-max-age':       '86400',
};

// small helper: build a JSON response with the right content-type, cache
// headers, and CORS headers baked in. extraHeaders lets callers override
// individual headers (e.g. stamping x-cache: HIT|MISS).
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

// the default export is what cloudflare looks for. the `fetch` method on
// it runs for every incoming http request.
export default {
  async fetch(request, env, ctx) {
    // ── CORS preflight ────────────────────────────────────────────────────
    //
    // browsers send an OPTIONS "preflight" request before any cross-origin
    // request that isn't a plain GET/HEAD with simple headers. they look
    // at the response headers to decide whether to actually send the real
    // request. we respond 204 No Content with the CORS headers set.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // only GET/HEAD are meaningful for this worker. anything else gets
    // a 405 (method not allowed).
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── routing ───────────────────────────────────────────────────────────
    //
    // three paths:
    //   /            → health check json
    //   /health      → health check json
    //   /news.json   → the actual feed (this is what the frontend hits)
    //   everything else → 404

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

    // ── edge cache check ──────────────────────────────────────────────────
    //
    // `caches.default` is cloudflare's per-data-center cache. you use it
    // like a key/value store of Request → Response. we build a clean
    // cacheKey (just the url, no cookies or auth headers) so every visitor
    // in a given region shares the same cached response.
    //
    // the `?refresh=1` query param is an escape hatch: bypass the cache
    // and force a fresh upstream fetch. useful when you're debugging a
    // parser change and want to see its effect immediately.
    const cache    = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const bypass   = url.searchParams.get('refresh') === '1';

    if (!bypass) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        // stamp x-cache: HIT on the way out so you can tell cache hits
        // from misses in curl / devtools. we have to clone the headers
        // because Response headers are immutable on the originals.
        const h = new Headers(cached.headers);
        h.set('x-cache', 'HIT');
        return new Response(cached.body, { status: cached.status, headers: h });
      }
    }

    // ── cache miss: build a fresh payload ─────────────────────────────────
    let payload;
    try {
      payload = await buildPayload();
    } catch (err) {
      // if every source threw, buildPayload still returns an object with
      // `failed[]` populated — so the only way we get here is an actual
      // unexpected bug. return a non-cacheable error response.
      return jsonResponse(
        { error: 'fetch failed', detail: String(err && err.message || err) },
        { 'cache-control': 'no-store', 'x-cache': 'ERROR' },
      );
    }

    const response = jsonResponse(payload, { 'x-cache': 'MISS' });

    // ── write back to the edge cache ──────────────────────────────────────
    //
    // ctx.waitUntil lets us run work AFTER we've returned the response.
    // the worker stays alive long enough to finish the cache write, but
    // the user gets their response immediately — no added latency.
    //
    // we have to clone() the response because you can only read a Response
    // body once, and the browser already consumed the original.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};
