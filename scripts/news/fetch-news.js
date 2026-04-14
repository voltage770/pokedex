/**
 * fetch-news.js
 * fetches pokemon news from external RSS sources, normalizes into a common
 * schema, strips HTML, extracts thumbnails, and writes app/src/data/news.json
 * sorted newest-first, capped at MAX_ENTRIES.
 *
 * no external deps — uses node's built-in fetch + a small XML parser tuned
 * to RSS 2.0. if a source's feed changes or goes down, it's skipped with a
 * warning rather than failing the whole run.
 *
 * run with: node news/fetch-news.js
 */

const fs   = require('fs');
const path = require('path');

const OUT_FILE    = path.join(__dirname, '../../app/src/data/news.json');
const MAX_ENTRIES = 50;
const EXCERPT_LEN = 220;
const USER_AGENT  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// sources: each entry has an id, display name, url, and a `kind` that picks
// the parser — 'rss' for RSS 2.0 feeds, 'pokebeach-html' for scraping the
// pokebeach homepage (their feed is Cloudflare-blocked but the homepage is
// not). add more sources later by appending here.
//
// `pokemonOnly: true` filters items whose title+excerpt doesn't mention
// pokemon — useful for general gaming feeds.
const SOURCES = [
  {
    id:   'pokebeach',
    name: 'pokebeach',
    url:  'https://www.pokebeach.com/',
    kind: 'pokebeach-html',
  },
  {
    id:   'nintendolife',
    name: 'nintendo life',
    url:  'https://www.nintendolife.com/feeds/news',
    kind: 'rss',
    pokemonOnly: true,
  },
];

// keywords used when `pokemonOnly` is set. case-insensitive.
const POKEMON_KEYWORDS = ['pokemon', 'pokémon', 'pokeball', 'pokéball', 'pikachu', 'game freak'];

// topic labels — applied in declaration order, first match wins. each patterns
// array is a list of lowercase substrings; if any appear in title+excerpt we
// tag the entry with that label. order matters: more specific topics first so
// "pokemon go" isn't swallowed by the generic "pokemon" fallback.
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

function deriveLabel(title, excerpt, tags = []) {
  const hay = `${title} ${excerpt} ${tags.join(' ')}`.toLowerCase();
  for (const t of TOPIC_LABELS) {
    if (t.patterns.some(p => hay.includes(p))) return t.label;
  }
  return 'pokémon news';
}

// extract a youtube video id from a block of HTML — covers the common embed
// (<iframe src="...youtube.com/embed/ID">) and direct links (youtu.be/ID,
// youtube.com/watch?v=ID). returns null if nothing found.
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

function matchesPokemon(title, excerpt) {
  const hay = `${title} ${excerpt}`.toLowerCase();
  return POKEMON_KEYWORDS.some(k => hay.includes(k));
}

// ─── tiny RSS parser ──────────────────────────────────────────────────────────
// RSS 2.0 is simple enough to handle with a handful of regexes. we care about
// <item> blocks and the fields: title, link, pubDate, description,
// content:encoded, and any <media:content> or <enclosure> for images.

function unwrapCdata(s) {
  if (!s) return '';
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g,    (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g,  '&'); // last so we don't double-decode
}

function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi,  '')
      // insert a space at block-level tag boundaries so adjacent words don't fuse
      .replace(/<\/(p|div|li|br|h[1-6]|tr|td|section|article|header|footer|blockquote)[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  ).replace(/\s+/g, ' ').trim();
}

function truncate(s, max) {
  if (!s || s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

function firstImage(html) {
  if (!html) return null;
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return img ? img[1] : null;
}

function getTag(block, tag) {
  // handles <tag>...</tag> and <tag attr="...">...</tag>
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? unwrapCdata(m[1]).trim() : '';
}

function getAttr(block, tag, attr) {
  // handles self-closing and open tags: <media:content url="..." />
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const blocks = xml.match(itemRe) || [];
  for (const block of blocks) {
    const title       = stripHtml(getTag(block, 'title'));
    const link        = getTag(block, 'link');
    const pubDate     = getTag(block, 'pubDate');
    const description = getTag(block, 'description');
    const content     = getTag(block, 'content:encoded');
    const mediaUrl    = getAttr(block, 'media:content', 'url')
                     || getAttr(block, 'media:thumbnail', 'url')
                     || getAttr(block, 'enclosure', 'url');
    const categories  = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map(m => stripHtml(unwrapCdata(m[1])))
      .filter(Boolean);

    items.push({ title, link, pubDate, description, content, mediaUrl, categories });
  }
  return items;
}

// ─── pokebeach homepage scraper ───────────────────────────────────────────────
// pokebeach's RSS feed is Cloudflare-blocked but the homepage HTML is not.
// each article on the homepage lives inside <article id="post-NNNN" class="...
// category-{slug}"> ... </article>, and exposes: a title + canonical link in
// <h2 class="entry-title"><a href="...">...</a></h2>, a featured image inside
// <div class="xpress_articleImage--full"><img src="..."/>, and a human-readable
// date inside the entry-meta list. no excerpts are available from the listing
// and the per-article pages are also blocked, so we derive the card "excerpt"
// from the category slug on the article element.

const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4,  jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parsePokebeachDate(text) {
  // e.g. "Apr 12, 2026 at 10:54 PM"
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
  if (mer === 'PM' && hour < 12) hour += 12;
  if (mer === 'AM' && hour === 12) hour = 0;
  // pokebeach runs on eastern time — approximate as UTC-4 (EDT). close enough
  // for sorting and card display; precise tz doesn't matter for a news list.
  const d = new Date(Date.UTC(year, mon, day, hour + 4, min, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parsePokebeach(html) {
  const items = [];
  const articleRe = /<article\s+id="post-(\d+)"\s+class="([^"]*)">([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = articleRe.exec(html)) !== null) {
    const postId    = match[1];
    const classAttr = match[2];
    const body      = match[3];

    // category from the `category-{slug}` class token
    const catMatch = classAttr.match(/category-([a-z0-9-]+)/i);
    const category = catMatch ? catMatch[1] : null;

    // title + canonical link from <h2 class="entry-title"><a href="...">TITLE</a></h2>
    const titleMatch = body.match(/<h2[^>]*class="entry-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!titleMatch) continue;
    const url   = decodeEntities(titleMatch[1]);
    const title = stripHtml(titleMatch[2]);

    // featured image from <div class="xpress_articleImage--full">...<img src="...">
    let image = null;
    const imgBlock = body.match(/class="xpress_articleImage--full"[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (imgBlock) image = decodeEntities(imgBlock[1]);
    if (!image) image = firstImage(body);

    // date text inside entry-meta — the second <li> usually contains it
    let dateText = null;
    const dateBlock = body.match(/<span class="screen-reader-text">Posted on<\/span>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (dateBlock) dateText = stripHtml(dateBlock[1]);
    const parsed = parsePokebeachDate(dateText);
    const iso = parsed ? parsed.toISOString() : null;

    items.push({
      title,
      link: url,
      pubDate: parsed ? parsed.toUTCString() : null,
      description: '',
      content: '',
      mediaUrl: image,
      categories: category ? [category.replace(/-/g, ' ')] : [],
      _postId: postId,
      _iso: iso,
    });
  }
  return items;
}

// ─── normalize ────────────────────────────────────────────────────────────────

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function normalize(source, raw) {
  const published = raw.pubDate ? new Date(raw.pubDate) : null;
  const iso = published && !Number.isNaN(published.getTime()) ? published.toISOString() : null;
  const body = raw.content || raw.description || '';
  const excerpt = truncate(stripHtml(body), EXCERPT_LEN);
  const image = raw.mediaUrl || firstImage(body) || null;
  const youtubeId = firstYoutubeId(body);
  const label = deriveLabel(raw.title || '', excerpt || '', raw.categories || []);
  const dateKey = iso ? iso.slice(0, 10) : 'undated';
  const id = `${source.id}-${dateKey}-${slugify(raw.title) || 'untitled'}`;

  return {
    id,
    source: source.id,
    source_name: source.name,
    label,
    title: raw.title || '(untitled)',
    url: raw.link || null,
    published: iso,
    excerpt,
    image,
    youtube_id: youtubeId,
    tags: raw.categories.slice(0, 5),
  };
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchSource(source) {
  console.log(`  fetching ${source.name} (${source.url})`);
  const accept = source.kind === 'pokebeach-html'
    ? 'text/html,application/xhtml+xml'
    : 'application/rss+xml, application/xml, text/xml, */*';
  const res = await fetch(source.url, {
    headers: {
      'user-agent':      USER_AGENT,
      accept,
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const body = await res.text();

  const raws = source.kind === 'pokebeach-html' ? parsePokebeach(body) : parseRss(body);
  let items = raws.map(r => normalize(source, r));
  if (source.pokemonOnly) {
    const before = items.length;
    items = items.filter(i => matchesPokemon(i.title, i.excerpt));
    console.log(`    filtered ${before} → ${items.length} pokemon entries`);
  }
  return items;
}

async function main() {
  const all = [];
  const failed = [];

  for (const source of SOURCES) {
    try {
      const items = await fetchSource(source);
      console.log(`    ${items.length} items`);
      all.push(...items);
    } catch (err) {
      console.warn(`  [warn] ${source.name} failed: ${err.message}`);
      failed.push(source.id);
    }
  }

  // dedupe by id (same title+date+source)
  const seen = new Set();
  const deduped = all.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // sort newest-first; undated entries sink to the bottom
  deduped.sort((a, b) => {
    if (!a.published && !b.published) return 0;
    if (!a.published) return 1;
    if (!b.published) return -1;
    return b.published.localeCompare(a.published);
  });

  const capped = deduped.slice(0, MAX_ENTRIES);

  const payload = {
    updated: new Date().toISOString(),
    count:   capped.length,
    sources: SOURCES.map(s => ({ id: s.id, name: s.name, url: s.url })),
    entries: capped,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`\ndone. ${capped.length} entries written to ${OUT_FILE}`);
  if (failed.length) console.warn(`failed sources: ${failed.join(', ')}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
