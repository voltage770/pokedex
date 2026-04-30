/**
 * patch-leader-flavor.js
 * re-fetches the flavor_text field for every gym leader using the
 * latest extractFlavorText logic from scrape-gym-leaders.js. preserves
 * every other field (portrait_url, thumb_url, sprite, etc.) so existing
 * scrape work isn't lost — only flavor_text is overwritten.
 *
 * useful when extractFlavorText changes (e.g. switching from a single-
 * paragraph extract to a multi-paragraph one) and we want updated
 * flavor without re-running the full scrape pipeline.
 *
 * usage:
 *   node db/patch-leader-flavor.js                       # all unique leaders
 *   node db/patch-leader-flavor.js --target=Brock        # one leader
 *   node db/patch-leader-flavor.js --dry-run             # print, don't write
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

// inlined copies of cleanWikitext + extractFlavorText from scrape-gym-leaders.js.
// keeping them in sync requires manual effort if extraction logic evolves —
// alternative would be refactoring scrape-gym-leaders to export, but that
// would change a scraper that's already battle-tested.
function cleanWikitext(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{!\}\}.*$/, '')
    .replace(/\{\{sup\/[^}]+\}\}/g, '')
    .replace(/\{\{tt\|[^}]+\}\}/g, '')
    .replace(/\{\{wp\|[^|}]+\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{wp\|([^|}]+)\}\}/g, '$1')
    .replace(/\{\{m\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{t\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{p\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{p2\|([^|}]+)\|([^}]+)\}\}/g, '$2')
    .replace(/\{\{p2\|([^|}]+)\}\}/g, '$1')
    .replace(/\{\{type\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{pkmn\|([^|}]+)\|([^}]+)\}\}/g, '$2')
    .replace(/\{\{pkmn\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{OBP\|([^|}]+)\|[^}]+\}\}/g, '$1')
    .replace(/\{\{DL\|[^|}]+\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{badge\|[^|}]+\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{badge\|([^}]+)\}\}/gi, '$1 Badge')
    .replace(/\{\{player\}\}/gi, 'player')
    .replace(/\{\{Gen\|([^}]+)\}\}/g, 'Gen $1')
    .replace(/\{\{gen\|([^}]+)\}\}/g, 'Gen $1')
    .replace(/\{\{game[^|}]*\|([^|}]+)\|[^}]+\}\}/g, '$1')
    .replace(/\{\{v2\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{LGPE\}\}/g, "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!")
    .replace(/\{\{Tera\}\}/g, 'Tera')
    .replace(/\{\{color2?\|[^|}]+\|([^}]+)\}\}/g, '$1')
    .replace(/\{\{color\|[^|}]+\|([^}]+)\}\}/g, '$1')
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/\{\{[^|}]*\|[^|}]+\|([^|}]+)\}\}/g, '$1')
    .replace(/\{\{[^|}]*\|([^|}]+)\}\}/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFlavorText(wikitext, maxParagraphs = 3, maxChars = 1100) {
  // anchor on the JP parenthetical — handles infobox-followed-immediately-
  // by-prose pages (Grusha) where there's no blank line between `|}` and
  // the lead.
  const m = wikitext.match(/\n'''[^']+'''\s*\(Japanese:[^)]+\)[^\n]*/);
  if (!m) return null;
  const start = m.index + 1;

  const stopRe = /\n==\s*(?:In the (?:anime|manga|TCG|movies|games \(spin-off\))|Trivia|Memorable|Quotes|Names in other languages|See also|References|Gallery|Sprites|Voice actors)/i;
  const stopMatch = wikitext.slice(start).search(stopRe);
  const intro = stopMatch === -1 ? wikitext.slice(start) : wikitext.slice(start, start + stopMatch);

  // pre-normalize headings to blank-line-bounded so they don't lump with
  // the first paragraph after them when we blank-line-split below.
  const normalized = intro.replace(/\n(==[^\n]+==)/g, '\n\n$1\n');
  const blocks = normalized.split(/\n\s*\n/);
  const paragraphs = [];
  let totalChars = 0;
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^==/.test(trimmed))            continue;
    if (/^\{\{[\s\S]*\}\}$/.test(trimmed)) continue;
    if (/^\{\|/.test(trimmed))          continue;
    if (/^[*:#]/.test(trimmed))         continue;
    const cleaned = cleanWikitext(trimmed);
    if (!cleaned || cleaned.length < 40) continue;
    paragraphs.push(cleaned);
    totalChars += cleaned.length;
    if (paragraphs.length >= maxParagraphs) break;
    if (totalChars >= maxChars) break;
  }

  if (!paragraphs.length) return null;
  return paragraphs.join('\n\n');
}

const API   = 'https://bulbapedia.bulbagarden.net/w/api.php';
const UA    = 'pokedex-data-scraper/1.0';
const OUT   = path.join(__dirname, '../../app/src/data/gym-leaders.json');
const DELAY = 350;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs() {
  const out = { target: null, dryRun: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--target=')) out.target = a[i].slice('--target='.length);
    else if (a[i] === '--dry-run')    out.dryRun = true;
  }
  return out;
}

async function fetchWikitext(page) {
  await sleep(DELAY);
  const { data } = await axios.get(API, {
    params: { action: 'parse', page, prop: 'wikitext', format: 'json', redirects: 1 },
    headers: { 'user-agent': UA },
  });
  if (data.error) throw new Error(`${page}: ${data.error.info}`);
  return data.parse.wikitext['*'];
}

async function main() {
  const opts = parseArgs();
  const leaders = JSON.parse(fs.readFileSync(OUT, 'utf-8'));

  let titles = [...new Set(leaders.map(l => l.page_title))];
  if (opts.target) titles = titles.filter(t => t === opts.target);

  if (!titles.length) {
    console.error(`no titles to process${opts.target ? ` (target=${opts.target})` : ''}`);
    process.exit(1);
  }

  console.log(`re-fetching flavor for ${titles.length} unique leader${titles.length === 1 ? '' : 's'}...`);

  const flavorByTitle = new Map();
  let i = 0;
  for (const title of titles) {
    i++;
    try {
      const wt = await fetchWikitext(title);
      const flavor = extractFlavorText(wt);
      flavorByTitle.set(title, flavor);
      const paraCount = (flavor || '').split('\n\n').filter(Boolean).length;
      const charCount = (flavor || '').length;
      console.log(`  [${i}/${titles.length}] ${title.padEnd(28)} ${paraCount}p / ${charCount}c`);
    } catch (e) {
      console.warn(`  [${i}/${titles.length}] ${title} — failed: ${e.message}`);
      flavorByTitle.set(title, null);
    }
  }

  for (const l of leaders) {
    if (flavorByTitle.has(l.page_title)) {
      l.flavor_text = flavorByTitle.get(l.page_title);
    }
  }

  if (opts.dryRun) {
    console.log('\n--- DRY RUN: first 3 records' + (opts.target ? ` (target=${opts.target})` : '') + ' ---');
    const sample = opts.target ? leaders.filter(l => l.page_title === opts.target) : leaders.slice(0, 3);
    for (const l of sample) {
      console.log(`\n${l.name}:`);
      console.log(l.flavor_text);
    }
    return;
  }

  fs.writeFileSync(OUT, JSON.stringify(leaders, null, 2));
  console.log(`\ndone. ${leaders.length} records written to ${OUT}`);
}

main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
