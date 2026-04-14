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
    id:   'serebii',
    name: 'serebii',
    url:  'https://www.serebii.net/',
    kind: 'serebii-html',
    // serebii's homepage posts one big daily news roundup per day, but each
    // roundup is structured internally as a series of `.pics` + `.subcat`
    // blocks — one sub-entry per topic (pokémon go, champions, masters,
    // sleep, tcg pocket, etc.). parseSerebii walks those sub-entries and
    // returns each as its own news item with its own image and body. the
    // page is ISO-8859-1 encoded, so fetchSource decodes the raw bytes
    // via TextDecoder instead of calling .text() which assumes utf-8.
  },
];

// keywords used when `pokemonOnly` is set. case-insensitive.
const POKEMON_KEYWORDS = ['pokemon', 'pokémon', 'pokeball', 'pokéball', 'pikachu', 'game freak'];

// topic labels — applied in declaration order, first match wins. each patterns
// array is a list of lowercase substrings; if any appear in title+excerpt we
// tag the entry with that label. order matters: more specific topics first so
// "pokemon go" isn't swallowed by the generic "pokemon" fallback.
// ORDERING MATTERS — first pattern match wins. more specific topics must sit
// before their generic parents so "tcg pocket" isn't swallowed by bare "tcg",
// "pokemon go fest" isn't swallowed by bare "pokemon go", etc.
const TOPIC_LABELS = [
  // tcg variants come before the generic `pokémon tcg` below — "pocket" and
  // "live" are distinct games with separate communities and should be tagged
  // individually so readers can tell them apart from the physical card game.
  { label: 'pokémon tcg pocket', patterns: ['tcg pocket', 'tcg-pocket', 'pokemon pocket', 'pokémon pocket', 'tcgp'] },
  { label: 'pokémon tcg live',   patterns: ['tcg live', 'tcg-live', 'tcgl'] },

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

// ─── serebii homepage scraper ─────────────────────────────────────────────────
// serebii's homepage lists ~7 days of news, each day as one <h2> header
// followed by a series of sub-entries until the next <!-- end_news --> marker.
// each sub-entry is structured as:
//
//   <div class="pics"><a href="..."><img src="..." alt="..."/></a></div>
//   <div class="subcat">
//     <h3>In The Games Department</h3>
//     <p class="title">Pokémon GO</p>
//     <p>body paragraph here...</p>
//   </div>
//
// we walk each day block, pair up pics+subcat, and emit one news item per
// sub-entry. each gets: topic title, the body paragraph as excerpt, the pic
// url as the image, the day's shared date, and a link back to either the pic
// anchor href (topic section) or the parent day's archive page.

// serebii pic urls are site-relative — resolve against the site root.
const SEREBII_BASE = 'https://www.serebii.net';
function resolveSerebiiUrl(u) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return SEREBII_BASE + u;
  return SEREBII_BASE + '/' + u;
}

// "13-04-2026 05:42 BST / 00:42 EDT" → Date. serebii's primary date is BST
// (british summer time, UTC+1) or GMT (UTC+0) depending on the time of year.
// we approximate as UTC+1 since most posts happen during BST months. precise
// tz doesn't matter for a "posted X hours ago" display.
function parseSerebiiDate(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const day   = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year  = Number(m[3]);
  const hour  = Number(m[4]);
  const min   = Number(m[5]);
  // BST = UTC+1, so subtract 1 hour to get UTC.
  const d = new Date(Date.UTC(year, month, day, hour - 1, min, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

// heuristic title rewrite: serebii tags every sub-entry with a section name
// ("Pokémon GO", "Pokémon TCG Pocket", "Pokémon Champions") rather than a real
// headline, so the card title tells readers *what section* but not *what news*.
// this derives a better title by pulling the first sentence of the body and
// stripping common boilerplate. when the first sentence is a content-free
// shell ("X has announced the next event"), falls through to two sentences.
//
// NOTE: this logic is duplicated in worker/src/index.js — keep both in sync.
const SEREBII_BOILERPLATE_PREFIXES = [
  /^the pok[eé]mon company(?: international)? has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^niantic has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^nintendo has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^game freak has (?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^it has (?:just )?been (?:officially )?(?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^it's been (?:officially )?(?:announced|revealed|confirmed)(?: that)?\s+/i,
  /^following(?: on from)? (?:the )?(?:previous|recent|yesterday's).*?,\s+/i,
  /^as (?:was )?(?:announced|revealed|teased|confirmed)(?: previously| earlier| yesterday)?,\s+/i,
];
const SEREBII_GENERIC_OPENERS = [
  /has (?:announced|begun|started|revealed) (?:the )?(?:next|latest) (?:event|delivery focus|update|patch|run)$/i,
  /has (?:been )?(?:announced|revealed)$/i,
  /has received (?:a|an|its) (?:latest )?(?:bug[- ]fix )?(?:update|patch)$/i,
  /^(?:the )?(?:next|latest) .+ (?:event|update) has (?:been announced|begun|started)$/i,
  /has announced some(?: big)? changes/i,
  /has announced the next delivery focus$/i,
];

// find end-index of first sentence. lookahead requires terminator → whitespace
// + uppercase (or end of string) so abbreviations like "No. 12" or "etc." don't
// count as sentence boundaries.
function serebiiFirstSentenceEnd(text) {
  const m = text.match(/[.!?](?=\s+[A-Z]|\s*$)/);
  return m ? m.index + 1 : -1;
}

function inferSerebiiTitle(topicTitle, bodyText) {
  if (!bodyText) return topicTitle;
  const stripTerminal = (s) => s.replace(/[.!?]+$/, '').trim();

  const end1 = serebiiFirstSentenceEnd(bodyText);
  let sentence = end1 >= 0 ? bodyText.slice(0, end1) : bodyText;
  let candidate = stripTerminal(sentence);

  // if sentence 1 is a content-free shell, include sentence 2 as well
  if (SEREBII_GENERIC_OPENERS.some(re => re.test(candidate)) && end1 >= 0) {
    const rest = bodyText.slice(end1).replace(/^\s+/, '');
    const end2 = serebiiFirstSentenceEnd(rest);
    const tail = end2 >= 0 ? rest.slice(0, end2) : rest;
    candidate = stripTerminal(bodyText.slice(0, end1) + ' ' + tail);
  }

  // strip boilerplate opening clauses
  let stripped = false;
  for (const re of SEREBII_BOILERPLATE_PREFIXES) {
    const next = candidate.replace(re, '');
    if (next !== candidate) { candidate = next; stripped = true; }
  }
  if (stripped && candidate.length > 0) {
    candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }

  // truncate at a word boundary
  const MAX = 110;
  if (candidate.length > MAX) {
    const cut = candidate.slice(0, MAX);
    const lastSpace = cut.lastIndexOf(' ');
    candidate = (lastSpace > MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
  }

  if (candidate.length < 18) return topicTitle;
  if (candidate.toLowerCase() === topicTitle.toLowerCase()) return topicTitle;
  return candidate;
}

function parseSerebii(html) {
  const items = [];

  // split the homepage into one chunk per day. each day starts with
  // <h2><a href="/news/YYYY/DD-Month-YYYY.shtml" id="DD-Month-YYYY">Title</a></h2>
  // and ends at the next <!-- end_news --> marker.
  const dayRe = /<h2><a\s+href="(\/news\/\d{4}\/[^"]+\.shtml)"[^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<!-- end_news -->/gi;

  let match;
  while ((match = dayRe.exec(html)) !== null) {
    const dayUrl      = resolveSerebiiUrl(match[1]);
    const dayTitle    = stripHtml(match[2]);
    const dayBody     = match[3];

    // date lives in a <span class="date">…</span> immediately after the h2
    const dateMatch = dayBody.match(/<span class="date">([^<]+)<\/span>/i);
    const parsedDate = dateMatch ? parseSerebiiDate(dateMatch[1]) : null;
    const dayIso = parsedDate ? parsedDate.toISOString() : null;

    // find every sub-entry: a <div class="pics">…</div> followed eventually
    // by a <div class="subcat">…</div>. the subcat ends at its closing tag.
    // we match them as pairs in document order.
    const picsRe = /<div class="pics">([\s\S]*?)<\/div>\s*<div class="subcat"[^>]*>([\s\S]*?)<\/div>/gi;
    let picMatch;
    let subIndex = 0;
    while ((picMatch = picsRe.exec(dayBody)) !== null) {
      const picsBlock   = picMatch[1];
      const subcatBlock = picMatch[2];

      // pic URL + linked href (used as the article url)
      const hrefMatch = picsBlock.match(/<a[^>]+href="([^"]+)"/i);
      const imgMatch  = picsBlock.match(/<img[^>]+src="([^"]+)"/i);
      const picHref   = hrefMatch ? resolveSerebiiUrl(decodeEntities(hrefMatch[1])) : dayUrl;
      const image     = imgMatch  ? resolveSerebiiUrl(decodeEntities(imgMatch[1]))  : null;

      // topic title from <p class="title">
      const titleMatch = subcatBlock.match(/<p class="title">([\s\S]*?)<\/p>/i);
      if (!titleMatch) { subIndex++; continue; }
      const topicTitle = stripHtml(titleMatch[1]);

      // department label from <h3> (e.g. "In The Games Department")
      const deptMatch = subcatBlock.match(/<h3>([\s\S]*?)<\/h3>/i);
      const dept = deptMatch ? stripHtml(deptMatch[1]) : '';

      // body = everything inside subcat except the <h3> and <p class="title">
      // lines. simplest: strip those two tags from the block before stripHtml.
      let bodyHtml = subcatBlock
        .replace(/<h3>[\s\S]*?<\/h3>/i, '')
        .replace(/<p class="title">[\s\S]*?<\/p>/i, '');
      const excerpt = stripHtml(bodyHtml);

      // derive a real headline from the body first sentence — see
      // inferSerebiiTitle above. falls back to the topic label if the body
      // is empty or the extracted sentence is too short / identical.
      const derivedTitle = inferSerebiiTitle(topicTitle, excerpt);

      items.push({
        title:       derivedTitle,
        link:        picHref,
        pubDate:     parsedDate ? parsedDate.toUTCString() : null,
        description: excerpt,
        content:     bodyHtml, // keep raw html so youtube-id extraction works
        mediaUrl:    image,
        categories:  [dept, topicTitle].filter(Boolean),
        _iso:        dayIso,
        _subIndex:   subIndex++,
      });
    }
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
  const isHtml = source.kind === 'pokebeach-html' || source.kind === 'serebii-html';
  const accept = isHtml
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

  // serebii's homepage is ISO-8859-1 encoded. if we call res.text() directly
  // its assumed utf-8 decoding mangles every non-ascii char (é → �). read
  // the raw bytes and decode with the correct charset from the content-type
  // header (falling back to utf-8 for everything else).
  let body;
  if (isHtml) {
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || '';
    const m = ct.match(/charset=([\w-]+)/i);
    const charset = (m ? m[1] : 'utf-8').toLowerCase();
    body = new TextDecoder(charset).decode(buf);
  } else {
    body = await res.text();
  }

  // dispatch to the right parser.
  let raws;
  if      (source.kind === 'pokebeach-html') raws = parsePokebeach(body);
  else if (source.kind === 'serebii-html')   raws = parseSerebii(body);
  else                                       raws = parseRss(body);

  let items = raws.map(r => normalize(source, r));
  if (source.pokemonOnly) {
    const before = items.length;
    items = items.filter(i => matchesPokemon(i.title, i.excerpt));
    console.log(`    filtered ${before} → ${items.length} pokemon entries`);
  }
  return items;
}

// ─── cross-source dedup ───────────────────────────────────────────────────────
//
// different sources often surface the same article — e.g. pokebeach reports a
// tcg release and google news also indexes it from pokemon.com, leading to two
// near-identical entries. we dedupe by comparing title word sets with jaccard
// similarity, keeping whichever copy has the richer metadata (image + excerpt).

// common english stop words we don't want influencing title similarity scores.
const STOP_WORDS = new Set([
  'the','a','an','and','or','is','are','was','were','be','been','being','to',
  'for','of','in','on','at','by','with','from','as','that','this','these',
  'those','it','its','but','not','if','then','so','has','have','had','will',
  'would','can','could','should','may','might','just','new','now','up','out',
]);

// tokenize a title into a set of significant lowercase words (length ≥ 3,
// not in STOP_WORDS). punctuation and numbers-only tokens are dropped.
function titleWords(s) {
  const out = new Set();
  if (!s) return out;
  const cleaned = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  for (const w of cleaned.split(/\s+/)) {
    if (w.length < 3) continue;
    if (STOP_WORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

// jaccard similarity = |A ∩ B| / |A ∪ B|. 1.0 is identical, 0.0 is disjoint.
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

// higher score = better candidate to keep when two entries are duplicates.
// image is weighted heaviest because the UI viewport is dead space without it.
function qualityScore(e) {
  let s = 0;
  if (e.image)     s += 3;
  if (e.excerpt)   s += 2;
  if (e.published) s += 1;
  return s;
}

// walk the entries list and collapse near-duplicates. two entries are
// considered duplicates when:
//   - jaccard similarity of their title word sets is ≥ SIMILARITY_THRESHOLD, AND
//   - they were published within SIMILARITY_WINDOW_MS of each other (or one
//     or both are undated)
//
// the date window prevents false positives from sources that reuse topic
// names as titles — e.g. serebii tags every pokémon go entry with the title
// "pokémon go", so without a date constraint the dedup would collapse an
// entire week of unrelated go news into one card. O(n²) in kept entries.
const SIMILARITY_THRESHOLD  = 0.7;
const SIMILARITY_WINDOW_MS  = 48 * 60 * 60 * 1000; // 48h

function withinWindow(isoA, isoB) {
  if (!isoA || !isoB) return true; // can't disprove — allow jaccard to decide
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(a - b) <= SIMILARITY_WINDOW_MS;
}

function dedupeEntries(entries) {
  const kept = [];
  const keptWords = [];
  let collapsed = 0;
  for (const entry of entries) {
    const words = titleWords(entry.title);
    let dupIndex = -1;
    for (let i = 0; i < kept.length; i++) {
      // only compare entries from DIFFERENT sources. within one source the
      // id-based dedup is authoritative — a source like serebii can have
      // legitimate same-day sub-entries that share topic names ("pokémon
      // go" covering two separate events in one day) and we don't want to
      // collapse those.
      if (entry.source === kept[i].source) continue;
      if (!withinWindow(entry.published, kept[i].published)) continue;
      if (jaccard(words, keptWords[i]) >= SIMILARITY_THRESHOLD) {
        dupIndex = i;
        break;
      }
    }
    if (dupIndex === -1) {
      kept.push(entry);
      keptWords.push(words);
    } else {
      collapsed++;
      // replace stored entry only if the new one scores strictly higher
      if (qualityScore(entry) > qualityScore(kept[dupIndex])) {
        kept[dupIndex] = entry;
        keptWords[dupIndex] = words;
      }
    }
  }
  return { kept, collapsed };
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

  // first-pass: dedupe by stable id (same article from the same source twice).
  const seenIds = new Set();
  const byId = all.filter(e => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });

  // second-pass: dedupe across sources by title similarity. see dedupeEntries
  // and SIMILARITY_THRESHOLD above. runs before sorting because the "kept"
  // winner is chosen by quality score, not publish date.
  const { kept: deduped, collapsed } = dedupeEntries(byId);
  if (collapsed > 0) {
    console.log(`collapsed ${collapsed} cross-source near-duplicate${collapsed === 1 ? '' : 's'}`);
  }

  // sort newest-first; undated entries sink to the bottom
  deduped.sort((a, b) => {
    if (!a.published && !b.published) return 0;
    if (!a.published) return 1;
    if (!b.published) return -1;
    return b.published.localeCompare(a.published);
  });

  const capped = deduped.slice(0, MAX_ENTRIES);

  const payload = {
    updated:   new Date().toISOString(),
    count:     capped.length,
    collapsed,
    sources:   SOURCES.map(s => ({ id: s.id, name: s.name, url: s.url })),
    entries:   capped,
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
