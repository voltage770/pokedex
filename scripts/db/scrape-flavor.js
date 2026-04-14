/**
 * scrape-flavor.js
 * scrapes bulbapedia pokedex entries for alternate form flavor text.
 * writes results to form-flavor.json and patches pokemon.json.
 *
 * bulk mode (no url) — iterates all pokemon with uncovered forms:
 *   node db/scrape-flavor.js [--only slug1,slug2] [--skip slug1,slug2] [--dry-run] [--no-patch]
 *
 * single mode (provide url + base slug) — one pokemon, supports manual label mapping:
 *   node db/scrape-flavor.js <bulbapedia-url> <base-slug> [--map "Label=slug,..."]
 *
 * examples:
 *   node db/scrape-flavor.js
 *   node db/scrape-flavor.js --only charizard,mewtwo
 *   node db/scrape-flavor.js "https://bulbapedia.bulbagarden.net/wiki/Calyrex_(Pokémon)" calyrex --map "Ice Rider=calyrex-ice,Shadow Rider=calyrex-shadow"
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const API           = 'https://bulbapedia.bulbagarden.net/w/api.php';
const DELAY_MS      = 600;   // between api calls within one pokemon
const BETWEEN_MS    = 1500;  // extra delay between pokemon
const POKEMON_PATH  = path.join(__dirname, '../../app/src/data/pokemon.json');
const FLAVOR_PATH   = path.join(__dirname, 'form-flavor.json');
const ALIASES_PATH  = path.join(__dirname, 'form-flavor-aliases.json');

// alias map — forms that share flavor text with another form. applied as a post-scrape step
// so the aliased value is always derived from the latest source. shared with generate.js.
const FORM_FLAVOR_ALIASES = fs.existsSync(ALIASES_PATH)
  ? JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf-8'))
  : {};

// preference lists are strict — if the game isn't in the list for a given form type, the
// scraper returns null and the existing flavor_text in pokemon.json is left alone. this avoids
// picking a regional-variant or spin-off description for the wrong form.
const PREF_BASE  = ['Scarlet', 'Violet', 'Sword', 'Shield'];                  // base species entries
const PREF_MEGA  = ['Legends: Z-A'];                                           // Mega / Primal forms
const PREF_HISUI = ['Legends: Arceus'];                                        // Hisuian regional forms
const PREF_FORM  = ['Scarlet', 'Violet', 'Sword', 'Shield'];                  // alolan/galarian/paldean/gmax/alt forms
// legacy name kept for any residual code paths expecting the old list
const PREFERRED  = PREF_FORM;

// whitelist of mainline pokémon game versions (as written in bulbapedia's Dex/Entry `v=` param).
// anything not in this set is treated as a spin-off (Pokopia, Pokémon GO, Masters EX, etc.) and
// its entries are excluded — spin-off dex text is often generic or reuses base-form descriptions
// and shouldn't override form-specific flavor text.
const MAINLINE_GAMES = new Set([
  'Red', 'Blue', 'Green', 'Yellow',
  'Gold', 'Silver', 'Crystal',
  'Ruby', 'Sapphire', 'Emerald', 'FireRed', 'LeafGreen',
  'Diamond', 'Pearl', 'Platinum', 'HeartGold', 'SoulSilver',
  'Black', 'White', 'Black 2', 'White 2',
  'X', 'Y', 'Omega Ruby', 'Alpha Sapphire',
  'Sun', 'Moon', 'Ultra Sun', 'Ultra Moon',
  "Let's Go, Pikachu!", "Let's Go, Eevee!",
  'Sword', 'Shield', 'Brilliant Diamond', 'Shining Pearl',
  'Legends: Arceus',
  'Scarlet', 'Violet', 'Legends: Z-A',
]);

const REGION_SUFFIX = {
  'alolan': 'alola', 'galarian': 'galar', 'hisuian': 'hisui', 'paldean': 'paldea',
};

// forms to skip unconditionally — no meaningful separate dex entries
const SKIP_FORM_PATTERNS = [
  /-totem(-|$)/,       // totem forms (plain and totem-regional variants)
  /^pikachu-/,         // pikachu costumes
  /^eevee-starter$/,
  /^greninja-ash$/,
  /^greninja-battle-bond$/,
  /^floette-eternal$/,
  /^rockruff-own-tempo$/,
];

// pokemon names (as stored in pokemon.json) whose alt_forms should be skipped
const SKIP_ALT_FORMS_FOR = new Set(['pikachu', 'koraidon', 'miraidon']);

// title-case exceptions for bulbapedia page names
const WIKI_TITLE_OVERRIDES = {
  'mr-mime':     'Mr. Mime',
  'mime-jr':     'Mime Jr.',
  'mr-rime':     'Mr. Rime',
  'farfetchd':   "Farfetch'd",
  'sirfetchd':   "Sirfetch'd",
  'ho-oh':       'Ho-Oh',
  'type-null':   'Type: Null',
  'flabebe':     'Flabébé',
  'porygon-z':   'Porygon-Z',
  'jangmo-o':    'Jangmo-o',
  'hakamo-o':    'Hakamo-o',
  'kommo-o':     'Kommo-o',
  'nidoran-f':   'Nidoran♀',
  'nidoran-m':   'Nidoran♂',
  'chi-yu':      'Chi-Yu',
  'chien-pao':   'Chien-Pao',
  'ting-lu':     'Ting-Lu',
  'wo-chien':    'Wo-Chien',
  'iron-treads': 'Iron Treads',
  'iron-bundle': 'Iron Bundle',
  'iron-hands':  'Iron Hands',
  'iron-jugulis':'Iron Jugulis',
  'iron-moth':   'Iron Moth',
  'iron-thorns': 'Iron Thorns',
  'iron-valiant':'Iron Valiant',
  'iron-leaves': 'Iron Leaves',
  'iron-boulder':'Iron Boulder',
  'iron-crown':  'Iron Crown',
  'great-tusk':  'Great Tusk',
  'scream-tail': 'Scream Tail',
  'brute-bonnet':'Brute Bonnet',
  'flutter-mane':'Flutter Mane',
  'slither-wing':'Slither Wing',
  'sandy-shocks':'Sandy Shocks',
  'roaring-moon':'Roaring Moon',
  'walking-wake':'Walking Wake',
  'gouging-fire':'Gouging Fire',
  'raging-bolt':         'Raging Bolt',
  'maushold-family-of':  'Maushold',
};

// hardcoded label→slug maps for pokemon where auto-generation can't match bulbapedia's labels.
// keyed by baseName (species slug without form suffix).
const KNOWN_LABEL_MAPS = {
  rotom:      { 'Heat Rotom':'rotom-heat', 'Wash Rotom':'rotom-wash', 'Frost Rotom':'rotom-frost', 'Fan Rotom':'rotom-fan', 'Mow Rotom':'rotom-mow' },
  oricorio:   { 'Pom-Pom Style':'oricorio-pom-pom', "Pa'u Style":'oricorio-pau', 'Sensu Style':'oricorio-sensu' },
  lycanroc:   { 'Midnight Form':'lycanroc-midnight', 'Dusk Form':'lycanroc-dusk' },
  necrozma:   { 'Dusk Mane Necrozma':'necrozma-dusk', 'Dawn Wings Necrozma':'necrozma-dawn', 'Ultra Necrozma':'necrozma-ultra' },
  giratina:   { 'Origin Forme':'giratina-origin' },
  tornadus:   { 'Therian Forme':'tornadus-therian' },
  thundurus:  { 'Therian Forme':'thundurus-therian' },
  landorus:   { 'Therian Forme':'landorus-therian' },
  enamorus:   { 'Therian Forme':'enamorus-therian' },
  deoxys:     { 'Attack Forme':'deoxys-attack', 'Defense Forme':'deoxys-defense', 'Speed Forme':'deoxys-speed' },
  zacian:     { 'Crowned Sword':'zacian-crowned' },
  zamazenta:  { 'Crowned Shield':'zamazenta-crowned' },
  urshifu:    { 'Rapid Strike Style':'urshifu-rapid-strike', 'Gigantamax Single Strike Style':'urshifu-single-strike-gmax', 'Gigantamax Rapid Strike Style':'urshifu-rapid-strike-gmax' },
  calyrex:    { 'Ice Rider Calyrex':'calyrex-ice', 'Shadow Rider Calyrex':'calyrex-shadow' },
  kyurem:     { 'Black Kyurem':'kyurem-black', 'White Kyurem':'kyurem-white' },
  hoopa:      { 'Hoopa Unbound':'hoopa-unbound' },
  keldeo:     { 'Resolute Form':'keldeo-resolute' },
  dialga:     { 'Origin Forme':'dialga-origin' },
  palkia:     { 'Origin Forme':'palkia-origin' },
  shaymin:    { 'Sky Forme':'shaymin-sky' },
  meloetta:   { 'Pirouette Forme':'meloetta-pirouette' },
  darmanitan: { 'Zen Mode':'darmanitan-zen', 'Galarian Darmanitan (Standard Mode)':'darmanitan-galar-standard', 'Galarian Darmanitan (Zen Mode)':'darmanitan-galar-zen' },
  basculin:   { 'Blue-Striped Form':'basculin-blue-striped', 'White-Striped Form':'basculin-white-striped' },
  zygarde:    { '10% Forme':'zygarde-10', 'Complete Forme':'zygarde-complete' },
  tauros:     { 'Paldean Tauros (Combat Breed)':'tauros-paldea-combat-breed', 'Paldean Tauros (Blaze Breed)':'tauros-paldea-blaze-breed', 'Paldean Tauros (Aqua Breed)':'tauros-paldea-aqua-breed' },
  castform:   { 'Sunny Form':'castform-sunny', 'Rainy Form':'castform-rainy', 'Snowy Form':'castform-snowy' },
  mimikyu:    { 'Busted Form':'mimikyu-busted' },
  aegislash:  { 'Blade Forme':'aegislash-blade' },
  wishiwashi: { 'School Form':'wishiwashi-school' },
  morpeko:    { 'Hangry Mode':'morpeko-hangry' },
  eiscue:     { 'Noice Face':'eiscue-noice' },
  cramorant:  { 'Gulping Form':'cramorant-gulping', 'Gorging Form':'cramorant-gorging' },
  toxtricity: { 'Low Key Form':'toxtricity-low-key', 'Gigantamax Toxtricity':'toxtricity-amped-gmax' },
  pumpkaboo:  { 'Small Size':'pumpkaboo-small', 'Large Size':'pumpkaboo-large', 'Super Size':'pumpkaboo-super' },
  gourgeist:  { 'Small Size':'gourgeist-small', 'Large Size':'gourgeist-large', 'Super Size':'gourgeist-super' },
  minior:     { 'Meteor Form':'minior-red-meteor', 'All Cores':'minior-red' },
  eternatus:  { 'Eternamax Eternatus':'eternatus-eternamax' },
  magearna:   {
    'Original Color':                'magearna-original',
    'Mega Magearna (Original Color)':'magearna-original-mega',
  },
  tatsugiri:  {
    'Droopy Form':                   'tatsugiri-droopy',
    'Stretchy Form':                 'tatsugiri-stretchy',
    'Mega Tatsugiri (Curly Form)':   'tatsugiri-curly-mega',
    'Mega Tatsugiri (Droopy Form)':  'tatsugiri-droopy-mega',
    'Mega Tatsugiri (Stretchy Form)':'tatsugiri-stretchy-mega',
  },
  wormadam:   { 'Sandy Cloak':'wormadam-sandy', 'Trash Cloak':'wormadam-trash' },
  'maushold-family-of': { 'Family of Three':'maushold-family-of-three' },
  palafin:    { 'Hero Form':'palafin-hero' },
  maushold:   { 'Family of Three':'maushold-family-of-three' },
  dudunsparce:{ 'Three-Segment Form':'dudunsparce-three-segment' },
  terapagos:  { 'Terastal Form':'terapagos-terastal', 'Stellar Form':'terapagos-stellar' },
  gimmighoul: { 'Roaming Form':'gimmighoul-roaming' },
  raticate:   { 'Alolan Raticate':'raticate-alola' },
  'mr-mime':  { 'Galarian Mr. Mime':'mr-mime-galar' },
};

// builds the bulbapedia page title from a base species slug
function toWikiTitle(slug) {
  if (WIKI_TITLE_OVERRIDES[slug]) return WIKI_TITLE_OVERRIDES[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// derives the species base name (no form suffix) from a pokemon entry
// e.g. deoxys-normal → deoxys, giratina-altered → giratina, charizard → charizard
function getBaseName(p) {
  const forms = [
    ...(p.mega_forms    || []),
    ...(p.gmax_forms    || []),
    ...(p.regional_forms|| []),
    ...(p.alt_forms     || []),
  ];
  if (!forms.length) return p.name;

  // find longest common prefix (at dash boundaries) between p.name and all forms
  let candidate = p.name;
  for (const form of forms) {
    let i = 0;
    while (i < candidate.length && i < form.length && candidate[i] === form[i]) i++;
    const shared = candidate.slice(0, i);
    // if candidate is fully matched (form just extends it with '-...'), keep it as-is
    if (shared.length === candidate.length) continue;
    const lastDash = shared.lastIndexOf('-');
    candidate = lastDash > 0 ? shared.slice(0, lastDash) : shared;
    if (!candidate) { candidate = p.name; break; }
  }
  return candidate || p.name;
}

// derives the expected Bulbapedia Dex/Form label from a form slug, baseName, and wiki display title.
// bulbapedia labels typically include the full pokemon name, e.g. "Mega Charizard X", "Gigantamax Venusaur".
// returns null for forms that are auto-detected (regional) or should be skipped.
function slugToLabel(formSlug, baseName, wikiTitle) {
  // strip base name prefix
  const suffix = formSlug.startsWith(baseName + '-')
    ? formSlug.slice(baseName.length + 1)
    : formSlug;

  // gmax → "Gigantamax {Name}"
  if (suffix === 'gmax') return `Gigantamax ${wikiTitle}`;

  // mega → "Mega {Name}" / "Mega {Name} X" / "Mega {Name} Y"
  if (suffix.startsWith('mega')) {
    const rest = suffix.slice(4); // '' | '-x' | '-y'
    return rest ? `Mega ${wikiTitle} ${rest.slice(1).toUpperCase()}` : `Mega ${wikiTitle}`;
  }

  // primal
  if (suffix === 'primal') return `Primal ${wikiTitle}`;

  // regional suffixes — auto-detected by resolveSlug, no manual map entry needed
  if (['alola', 'galar', 'hisui', 'paldea'].includes(suffix)) return null;

  // title-case the remainder as best-guess label
  return suffix.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function clean(text) {
  return text
    .replace(/\{\{ScPkmn\}\}/gi, 'Pokémon')
    .replace(/\{\{(?:pkmn|p|pk|pkname)\|([^}|]+)[^}]*\}\}/gi, '$1') // {{p|Name}} → Name
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/<sc>([^<]*)<\/sc>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[''"]/g, "'")
    .replace(/[\f\n\r\t]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseParams(inner) {
  const params = {};
  let depth = 0, current = '', key = null;
  for (const ch of inner) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '|' && depth === 0) {
      if (key !== null) params[key] = current.trim();
      else if (current.trim()) params['_name'] = current.trim();
      current = ''; key = null;
      continue;
    } else if (ch === '=' && depth === 0 && key === null) {
      key = current.trim();
      current = '';
      continue;
    }
    current += ch;
  }
  if (key !== null) params[key] = current.trim();
  return params;
}

// bracket-aware extraction of template inner content — handles nested {{ }}
function extractTemplateInner(src, startIdx) {
  let depth = 0, i = startIdx;
  while (i < src.length) {
    if (src[i] === '{' && src[i + 1] === '{') { depth++; i += 2; continue; }
    if (src[i] === '}' && src[i + 1] === '}') {
      depth--;
      if (depth === 0) return src.slice(startIdx + 2, i); // inside the outermost {{ }}
      i += 2; continue;
    }
    i++;
  }
  return null; // unclosed template
}

function extractEntries(block) {
  const entries = [];
  const startRe = /\{\{Dex\/Entry[12]\|/gi;
  let m;
  while ((m = startRe.exec(block)) !== null) {
    const inner = extractTemplateInner(block, m.index);
    if (inner === null) continue;
    const p = parseParams(inner);
    const text = clean(p.entry || '');
    if (!text) continue;
    const games = [p.v, p.v2].filter(Boolean);
    // drop spin-off entries entirely; only keep entries with at least one mainline game tag
    if (!games.some(g => MAINLINE_GAMES.has(g))) continue;
    entries.push({ games, text });
  }
  return entries;
}

function pickBest(entries, preferred) {
  for (const pref of preferred) {
    const match = entries.find(e => e.games.some(g => g === pref));
    if (match) return match.text;
  }
  // fallback: any mainline entry from this form block. extractEntries already dropped spin-offs,
  // and the Dex/Gen termination fix in scrapePokemon guarantees the block only contains entries
  // correctly labeled as this form — so the newest remaining entry is a safe secondary choice.
  return entries.length ? entries[entries.length - 1].text : null;
}

// decide which preference list applies based on a cleaned Dex/Form label
function preferredForLabel(label) {
  if (/^(?:Mega|Primal)\b/i.test(label)) return PREF_MEGA;
  if (/^Hisuian\b/i.test(label))         return PREF_HISUI;
  return PREF_FORM;
}

// collects Dex/Entry templates that sit in a Dex/Gen block but BEFORE any Dex/Form label
// within that block. these describe the base form of the species. spin-off Dex/Gen blocks
// (Pokopia etc.) are included but their entries are filtered out downstream by MAINLINE_GAMES.
function extractBaseEntries(wikitext) {
  const entries = [];
  const genStart = /\{\{Dex\/Gen\/\d+\|/gi;
  const positions = [];
  let m;
  while ((m = genStart.exec(wikitext)) !== null) positions.push(m.index);
  if (!positions.length) return entries;
  positions.push(wikitext.length);
  for (let i = 0; i < positions.length - 1; i++) {
    const block   = wikitext.slice(positions[i], positions[i + 1]);
    const formIdx = block.search(/\{\{Dex\/Form\|/);
    const baseBlock = formIdx === -1 ? block : block.slice(0, formIdx);
    entries.push(...extractEntries(baseBlock));
  }
  return entries;
}

// strip wiki markup from a form label for matching purposes
function cleanLabel(label) {
  return label
    .replace(/\{\{rf\|([^}]+)\}\}/gi, '$1')       // {{rf|Alolan}} → Alolan
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')  // [[Target|Text]] → Text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')            // [[Text]] → Text
    .replace(/\{\{[^}]+\}\}/g, '')                 // other {{templates}} → ''
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// resolveSlug: maps a bulbapedia form label to a pokemon slug
// first checks manualMap, then regional auto-detect
function resolveSlug(label, baseName, manualMap) {
  const cleaned = cleanLabel(label);
  if (manualMap[cleaned]) return manualMap[cleaned];
  if (manualMap[label])   return manualMap[label];
  const lower = cleaned.toLowerCase();
  const words = lower.split(/\s+/);
  const regionSuffix = REGION_SUFFIX[words[0]];
  if (regionSuffix) return `${baseName}-${regionSuffix}`;
  return null; // unresolvable without map
}

async function findDexSection(pageName) {
  await sleep(DELAY_MS);
  const { data } = await axios.get(API, {
    params: { action: 'parse', page: pageName, prop: 'sections', format: 'json' }
  });
  const sections = data.parse?.sections;
  if (!sections) return null;
  const candidate = sections.find(s => s.line === 'Pokédex entries' && s.toclevel === 2);
  return candidate?.index ?? sections.find(s => s.line === 'Pokédex entries')?.index ?? null;
}

// scrape one pokemon page and return { forms: {slug: text}, base: text|null } — base is the
// species base-form flavor text picked from entries outside any Dex/Form label; forms holds
// entries for each labeled Dex/Form block on the page.
async function scrapePokemon(baseName, wikiTitle, manualMap) {
  const pageName = `${wikiTitle}_(Pokémon)`;

  let sectionIndex;
  try {
    sectionIndex = await findDexSection(pageName);
  } catch (e) {
    console.warn(`  [warn] failed to load sections for ${pageName}: ${e.message}`);
    return { forms: {}, base: null };
  }
  if (!sectionIndex) {
    console.warn(`  [warn] no pokédex entries section found for ${pageName}`);
    return { forms: {}, base: null };
  }

  await sleep(DELAY_MS);
  let wikitext;
  try {
    const { data } = await axios.get(API, {
      params: { action: 'parse', page: pageName, prop: 'wikitext', format: 'json', section: sectionIndex }
    });
    wikitext = data.parse?.wikitext?.['*'];
  } catch (e) {
    console.warn(`  [warn] failed to fetch wikitext for ${pageName}: ${e.message}`);
    return { forms: {}, base: null };
  }
  if (!wikitext) return { forms: {}, base: null };

  // extract base (pre-Dex/Form) entries and pick the best one under PREF_BASE
  const baseEntries = extractBaseEntries(wikitext);
  const baseText    = pickBest(baseEntries, PREF_BASE);
  if (baseText) console.log(`  [base] "${baseText.slice(0, 72)}${baseText.length > 72 ? '...' : ''}"`);

  // bracket-aware split by {{Dex/Form|...}} — handles nested {{ }} in labels (e.g. {{rf|Alolan}}).
  // a form block's content runs until the NEXT {{Dex/Form| OR the next {{Dex/Gen/N| template,
  // whichever comes first. terminating at Dex/Gen matters: bulbapedia pages like goodra place a
  // single {{Dex/Form|Hisuian Goodra}} in the middle of the Gen VIII block followed by an LA
  // entry, then start a fresh Gen IX block (no form divider — back to base). without the Dex/Gen
  // boundary, the scraper was treating all subsequent base entries as hisuian form flavor text.
  const formBlocks = []; // [{label, content}, ...]
  const formStart  = /\{\{Dex\/Form\|/gi;
  const formOrGen  = /\{\{Dex\/(?:Form\||Gen\/\d+\|)/gi;
  {
    formStart.lastIndex = 0;
    let m;
    while ((m = formStart.exec(wikitext)) !== null) {
      // scan from after '{{Dex/Form|' to the matching '}}', tracking nesting
      const labelStart = m.index + m[0].length;
      let depth = 1, i = labelStart;
      while (i < wikitext.length && depth > 0) {
        if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i += 2; continue; }
        if (wikitext[i] === '}' && wikitext[i + 1] === '}') { depth--; if (depth === 0) break; i += 2; continue; }
        i++;
      }
      const label = wikitext.slice(labelStart, i).trim();
      const templateEnd = i + 2; // skip closing }}
      formOrGen.lastIndex = templateEnd;
      const nextBoundary = formOrGen.exec(wikitext);
      const contentEnd = nextBoundary ? nextBoundary.index : wikitext.length;
      formStart.lastIndex = templateEnd;
      formBlocks.push({ label, content: wikitext.slice(templateEnd, contentEnd) });
    }
  }

  // accumulate entries per slug across multiple Dex/Form sections, tracking the slug's preferred
  // list (derived from the form label — mega/hisui/other).
  const entriesBySlug = {};
  const prefBySlug    = {};
  const warnedUnresolved = new Set();

  for (const { label, content } of formBlocks) {
    const slug = resolveSlug(label, baseName, manualMap);
    if (!slug) {
      if (!warnedUnresolved.has(label)) {
        console.warn(`  [unresolved] label "${label}" — add manually if needed`);
        warnedUnresolved.add(label);
      }
      continue;
    }
    const entries = extractEntries(content);
    if (!entriesBySlug[slug]) entriesBySlug[slug] = [];
    entriesBySlug[slug].push(...entries);
    prefBySlug[slug] = preferredForLabel(cleanLabel(label));
  }

  const found = {};
  for (const [slug, entries] of Object.entries(entriesBySlug)) {
    const text = pickBest(entries, prefBySlug[slug] || PREF_FORM);
    if (!text) {
      console.warn(`  [empty] no preferred-game entries for ${slug}`);
      continue;
    }
    found[slug] = text;
    console.log(`  ${slug}: "${text.slice(0, 72)}${text.length > 72 ? '...' : ''}"`);
  }
  return { forms: found, base: baseText };
}

async function runSingle(args) {
  const url      = args[0];
  const baseName = args[1];
  const noPatch  = args.includes('--no-patch');

  const pageMatch = url.match(/\/wiki\/([^#?]+)/);
  if (!pageMatch) { console.error('invalid bulbapedia url'); process.exit(1); }
  const pageName  = decodeURIComponent(pageMatch[1]);
  const wikiTitle = pageName.replace(/_?\(.*\)$/, '').replace(/_/g, ' ').trim();

  // build manual map from --map arg
  const manualMap = {};
  const mi = args.indexOf('--map');
  if (mi !== -1 && args[mi + 1]) {
    for (const pair of args[mi + 1].split(',')) {
      const eq = pair.indexOf('=');
      if (eq !== -1) manualMap[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }

  console.log(`single mode: ${wikiTitle} (base slug: ${baseName})`);
  const { forms, base } = await scrapePokemon(baseName, wikiTitle, manualMap);
  const foundForms = forms;
  if (!Object.keys(foundForms).length && !base) {
    console.log('no entries found');
    return;
  }

  const flavorStore = fs.existsSync(FLAVOR_PATH)
    ? JSON.parse(fs.readFileSync(FLAVOR_PATH, 'utf-8'))
    : {};
  Object.assign(flavorStore, foundForms);
  // base flavor is cached under the base species slug so subsequent runs skip re-fetching
  if (base) flavorStore[baseName] = base;
  fs.writeFileSync(FLAVOR_PATH, JSON.stringify(flavorStore, null, 2));
  console.log(`wrote ${Object.keys(foundForms).length} form entr${Object.keys(foundForms).length === 1 ? 'y' : 'ies'}${base ? ' + 1 base' : ''} to form-flavor.json`);

  if (!noPatch) {
    const pokemon = JSON.parse(fs.readFileSync(POKEMON_PATH, 'utf-8'));
    let patched = 0;
    for (const p of pokemon) {
      for (const [slug, text] of Object.entries(foundForms)) {
        if (p.form_data?.[slug]) { p.form_data[slug].flavor_text = text; patched++; }
      }
      // patch the base species flavor_text: find the pokemon entry whose name starts with
      // baseName (handles species stored with form suffix like basculin-red-striped)
      if (base && (p.name === baseName || p.name.startsWith(baseName + '-'))) {
        if (p.flavor_text !== base) { p.flavor_text = base; patched++; }
      }
    }
    fs.writeFileSync(POKEMON_PATH, JSON.stringify(pokemon, null, 2));
    console.log(`patched ${patched} entr${patched === 1 ? 'y' : 'ies'} in pokemon.json`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // single mode: first arg looks like a URL
  if (args[0] && args[0].startsWith('http')) {
    if (!args[1]) {
      console.error('usage: node db/scrape-flavor.js <bulbapedia-url> <base-slug> [--map "Label=slug,..."]');
      process.exit(1);
    }
    return runSingle(args);
  }

  const isDryRun  = args.includes('--dry-run');
  const noPatch   = args.includes('--no-patch');

  const onlyIdx = args.indexOf('--only');
  const onlySet = onlyIdx !== -1 ? new Set(args[onlyIdx + 1].split(',')) : null;

  const skipIdx = args.indexOf('--skip');
  const skipSet = skipIdx !== -1 ? new Set(args[skipIdx + 1].split(',')) : new Set();

  // --force re-scrapes forms that already have flavor text (useful after fixing a parser bug)
  const force = args.includes('--force');

  const pokemon = JSON.parse(fs.readFileSync(POKEMON_PATH, 'utf-8'));
  const flavorStore = fs.existsSync(FLAVOR_PATH)
    ? JSON.parse(fs.readFileSync(FLAVOR_PATH, 'utf-8'))
    : {};

  // collect candidates: pokemon with any forms that don't all already have flavor text
  const candidates = [];
  for (const p of pokemon) {
    const megaForms     = p.mega_forms     || [];
    const gmaxForms     = p.gmax_forms     || [];
    const regionalForms = p.regional_forms || [];
    const altForms      = SKIP_ALT_FORMS_FOR.has(p.name)
      ? []
      : (p.alt_forms || []).filter(s => !SKIP_FORM_PATTERNS.some(rx => rx.test(s)));

    const allForms = [...megaForms, ...gmaxForms, ...regionalForms, ...altForms];
    if (!allForms.length) continue;

    const baseName  = getBaseName(p);
    const wikiTitle = toWikiTitle(baseName);
    if (onlySet && !onlySet.has(baseName) && !onlySet.has(p.name) &&
        ![...onlySet].some(s => p.name.startsWith(s + '-') || baseName.startsWith(s + '-'))) continue;
    if (skipSet.has(baseName) || skipSet.has(p.name)) continue;

    // filter to forms without flavor text yet, unless --force is set (re-scrapes everything)
    const missing = allForms.filter(slug => {
      if (SKIP_FORM_PATTERNS.some(rx => rx.test(slug))) return false;
      if (force) return true;
      return !flavorStore[slug] && !p.form_data?.[slug]?.flavor_text;
    });
    if (!missing.length) continue;

    // build manualMap: start with known hardcoded maps, then fill in auto-generated labels
    const manualMap = { ...(KNOWN_LABEL_MAPS[baseName] || {}) };
    for (const slug of missing) {
      const label = slugToLabel(slug, baseName, wikiTitle);
      if (label && !manualMap[label]) manualMap[label] = slug;
    }

    candidates.push({ p, baseName, wikiTitle, missing, manualMap });
  }

  console.log(`\n${candidates.length} pokemon to process (${candidates.reduce((n, c) => n + c.missing.length, 0)} forms missing flavor text)\n`);

  if (isDryRun) {
    for (const { p, baseName, wikiTitle, missing, manualMap } of candidates) {
      console.log(`${p.name} (base: ${baseName} → ${wikiTitle}_(Pokémon))`);
      console.log(`  missing: ${missing.join(', ')}`);
      console.log(`  map: ${JSON.stringify(manualMap)}`);
    }
    return;
  }

  let totalFound = 0;
  let totalBase  = 0;
  const allUnresolved = [];
  // cache base entries keyed by baseName → text so the final patch step can apply them
  const baseByName = {};

  for (const { p, baseName, wikiTitle, missing, manualMap } of candidates) {
    console.log(`\n[${p.name}] → ${wikiTitle}_(Pokémon)`);
    console.log(`  missing: ${missing.join(', ')}`);

    const { forms: rawFound, base: baseText } = await scrapePokemon(baseName, wikiTitle, manualMap);
    // only keep entries for slugs that actually have form_data (filters out spurious PokeAPI forms)
    const found = Object.fromEntries(
      Object.entries(rawFound).filter(([slug]) => p.form_data?.[slug])
    );
    const foundKeys = Object.keys(found);
    const unresolved = missing.filter(s => !Object.keys(rawFound).includes(s));

    if (unresolved.length) {
      allUnresolved.push({ base: p.name, forms: unresolved });
    }

    if (foundKeys.length) {
      Object.assign(flavorStore, found);
      totalFound += foundKeys.length;
    }
    if (baseText) {
      flavorStore[baseName] = baseText;
      baseByName[baseName]  = baseText;
      totalBase++;
    }
    if (foundKeys.length || baseText) {
      fs.writeFileSync(FLAVOR_PATH, JSON.stringify(flavorStore, null, 2));
    }

    await sleep(BETWEEN_MS);
  }

  console.log(`\n✓ scraped ${totalFound} form entries + ${totalBase} base entries`);
  console.log(`  form-flavor.json updated`);

  if (allUnresolved.length) {
    console.log(`\nunresolved forms (need manual scraping or --map):`);
    for (const { base, forms } of allUnresolved) {
      console.log(`  ${base}: ${forms.join(', ')}`);
    }
  }

  // patch pokemon.json — forms via form_data, base via p.flavor_text. base keys live alongside
  // form slugs in the flavorStore (baseName → text); a base key is recognised by being a baseName
  // we scraped this run.
  if (!noPatch) {
    const updatedPokemon = JSON.parse(fs.readFileSync(POKEMON_PATH, 'utf-8'));
    let patched = 0;
    for (const p of updatedPokemon) {
      // forms
      for (const [slug, text] of Object.entries(flavorStore)) {
        if (!p.form_data?.[slug]) continue;
        if (!force && p.form_data[slug].flavor_text) continue;
        if (p.form_data[slug].flavor_text !== text) {
          p.form_data[slug].flavor_text = text;
          patched++;
        }
      }
      // base — match species whose stored name equals the baseName or has baseName as its prefix
      for (const [baseName, text] of Object.entries(baseByName)) {
        if (p.name === baseName || p.name.startsWith(baseName + '-')) {
          if (p.flavor_text !== text) {
            p.flavor_text = text;
            patched++;
          }
        }
      }
      // apply aliases: forms that share flavor text with another form. source can be another
      // form_data slug on the same species or the species base (matched against p.name).
      for (const [aliasSlug, sourceSlug] of Object.entries(FORM_FLAVOR_ALIASES)) {
        if (!p.form_data?.[aliasSlug]) continue;
        const sourceText = p.form_data[sourceSlug]?.flavor_text
          ?? (p.name === sourceSlug ? p.flavor_text : null);
        if (sourceText && p.form_data[aliasSlug].flavor_text !== sourceText) {
          p.form_data[aliasSlug].flavor_text = sourceText;
          patched++;
        }
      }
    }
    fs.writeFileSync(POKEMON_PATH, JSON.stringify(updatedPokemon, null, 2));
    console.log(`  patched ${patched} entr${patched === 1 ? 'y' : 'ies'} in pokemon.json`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
