/**
 * generate.js
 * fetches all pokemon from pokeapi and writes:
 *   - app/src/data/pokemon.json   full pokemon dataset
 *   - app/src/data/abilities.json flat map of ability name → description
 *
 * run once with: node db/generate.js
 *
 * data pulled per pokemon:
 *   - /pokemon/:id          base data, sprites, types, stats, abilities
 *   - /pokemon-species/:id  flavor text, genus, catch rate, gender rate, etc.
 *   - /evolution-chain/:id  full evo chain (cached — many pokemon share chains)
 *
 * additional pass after pokemon:
 *   - /ability/:name        short effect description for every unique ability
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const POKEAPI      = 'https://pokeapi.co/api/v2';
const MAX_ID       = 1025;
const DELAY_MS     = 120;
const OUT_POKEMON  = path.join(__dirname, '../../app/src/data/pokemon.json');
const OUT_ABILITIES = path.join(__dirname, '../../app/src/data/abilities.json');
const FORM_FLAVOR_PATH   = path.join(__dirname, 'form_flavor.json');
const FORM_ARTWORK_PATH  = path.join(__dirname, 'form_artwork.json');
const FORM_ALIASES_PATH  = path.join(__dirname, 'form_flavor_aliases.json');

// persistent form-specific flavor text scraped from bulbapedia — not overwritten by this script
const FORM_FLAVOR = fs.existsSync(FORM_FLAVOR_PATH)
  ? JSON.parse(fs.readFileSync(FORM_FLAVOR_PATH, 'utf-8'))
  : {};

// persistent form-specific artwork / sprite overrides for forms where pokeapi is missing images
// (e.g. megas outside the Gen VI canon set whose artwork pokeapi never ingested). keyed by form
// slug, values hold any of: artwork_url, artwork_shiny, sprite_url, sprite_shiny. each key is
// merged into form_data[slug] after pokeapi fetch, so regenerating never drops them.
const FORM_ARTWORK = fs.existsSync(FORM_ARTWORK_PATH)
  ? JSON.parse(fs.readFileSync(FORM_ARTWORK_PATH, 'utf-8'))
  : {};

// alias map for forms that share flavor text with another form (e.g. toxtricity-low-key-gmax
// and toxtricity-amped-gmax share one dex entry on bulbapedia). keyed as aliasSlug → sourceSlug.
// source can be another form slug (in form_data) or the base species name (matches p.name,
// copies flavorText). applied after the FORM_FLAVOR merge so the alias reflects the latest text.
const FORM_FLAVOR_ALIASES = fs.existsSync(FORM_ALIASES_PATH)
  ? JSON.parse(fs.readFileSync(FORM_ALIASES_PATH, 'utf-8'))
  : {};

const evoCache = new Map();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getGeneration(id) {
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  if (id <= 386) return 3;
  if (id <= 493) return 4;
  if (id <= 649) return 5;
  if (id <= 721) return 6;
  if (id <= 809) return 7;
  if (id <= 905) return 8;
  return 9;
}

// recursively flattens an evolution chain tree into an array of steps
function parseEvoChain(node, steps = []) {
  for (const next of (node.evolves_to || [])) {
    const det = next.evolution_details[0] || {};
    steps.push({
      from:            node.species.name,
      to:              next.species.name,
      trigger:         det.trigger?.name         || null,
      min_level:       det.min_level             || null,
      item:            det.item?.name            || null,
      location:        det.location?.name        || null,
      time_of_day:     det.time_of_day           || null,
      min_happiness:   det.min_happiness         || null,
      known_move:      det.known_move?.name      || null,
      known_move_type: det.known_move_type?.name || null,
      trade_species:   det.trade_species?.name   || null,
      needs_rain:      det.needs_overworld_rain  || null,
      turn_upside_down: det.turn_upside_down     || null,
    });
    parseEvoChain(next, steps);
  }
  return steps;
}

async function getEvoChain(url) {
  if (evoCache.has(url)) return evoCache.get(url);
  await sleep(DELAY_MS);
  const { data } = await axios.get(url);
  const steps = parseEvoChain(data.chain);
  evoCache.set(url, steps);
  return steps;
}

async function fetchOne(id) {
  const [{ data: p }, { data: sp }] = await Promise.all([
    axios.get(`${POKEAPI}/pokemon/${id}`),
    axios.get(`${POKEAPI}/pokemon-species/${id}`),
  ]);

  const flavorEntries = sp.flavor_text_entries.filter(e => e.language.name === 'en');
  const flavorText = flavorEntries.length
    ? flavorEntries[flavorEntries.length - 1].flavor_text.replace(/[\f\n\r]/g, ' ').trim()
    : null;

  const genusEntry = sp.genera.find(g => g.language.name === 'en');
  const evolutions = await getEvoChain(sp.evolution_chain.url);

  const nonDefault = sp.varieties.filter(v => !v.is_default).map(v => v.pokemon.name);
  const megaForms     = nonDefault.filter(n => n.includes('-mega'));
  const gmaxForms     = nonDefault.filter(n => n.includes('-gmax'));
  const regionalForms = nonDefault.filter(n => /-(alola|galar|hisui|paldea)/.test(n));
  const altForms      = nonDefault.filter(n =>
    !n.includes('-mega') && !n.includes('-gmax') && !/-(?:alola|galar|hisui|paldea)/.test(n)
  );

  // alt forms to skip entirely: pikachu costumes/caps, koraidon/miraidon travel modes
  const skipAltFormsFor = new Set(['pikachu', 'koraidon', 'miraidon']);
  const filteredAltForms = skipAltFormsFor.has(p.name)
    ? []
    : altForms.filter(n => !n.endsWith('-totem'));

  // fetch sprites, artwork, types, stats, and abilities for all form variants
  const allFormNames = [...megaForms, ...gmaxForms, ...regionalForms, ...filteredAltForms];
  const form_data = {};
  for (const formName of allFormNames) {
    try {
      await sleep(DELAY_MS);
      const { data: fd } = await axios.get(`${POKEAPI}/pokemon/${formName}`);
      form_data[formName] = {
        sprite_url:    fd.sprites.front_default,
        sprite_shiny:  fd.sprites.front_shiny,
        artwork_url:   fd.sprites.other?.['official-artwork']?.front_default || null,
        artwork_shiny: fd.sprites.other?.['official-artwork']?.front_shiny   || null,
        types:         fd.types.sort((a, b) => a.slot - b.slot).map(t => t.type.name),
        stats:         fd.stats.map(s => ({ stat_name: s.stat.name, base_value: s.base_stat })),
        abilities:     fd.abilities.map(a => ({ ability_name: a.ability.name, is_hidden: a.is_hidden })),
        height:        fd.height,
        weight:        fd.weight,
        ev_yield:      fd.stats.filter(s => s.effort > 0).map(s => ({ stat_name: s.stat.name, effort: s.effort })),
      };
    } catch (e) {
      // form not found or fetch error — skip
    }
  }

  // merge scraped form-specific flavor text from form_flavor.json
  for (const [formSlug, text] of Object.entries(FORM_FLAVOR)) {
    if (form_data[formSlug]) form_data[formSlug].flavor_text = text;
  }

  // merge manual artwork / sprite overrides from form_artwork.json (covers forms pokeapi doesn't
  // have images for — e.g. megas outside the Gen VI canon set). only overwrites the fields
  // explicitly present in the cache.
  for (const [formSlug, overrides] of Object.entries(FORM_ARTWORK)) {
    if (!form_data[formSlug]) continue;
    for (const [key, value] of Object.entries(overrides)) {
      form_data[formSlug][key] = value;
    }
  }

  // apply flavor-text aliases: forms that share a dex entry with another form. runs after the
  // form_flavor merge so the source is always the latest text. source can be another form_data
  // slug or the species base (matched against p.name, sourced from flavorText).
  for (const [aliasSlug, sourceSlug] of Object.entries(FORM_FLAVOR_ALIASES)) {
    if (!form_data[aliasSlug]) continue;
    const sourceText = form_data[sourceSlug]?.flavor_text
      ?? (p.name === sourceSlug ? flavorText : null);
    if (sourceText) form_data[aliasSlug].flavor_text = sourceText;
  }

  return {
    id:              p.id,
    name:            p.name,
    species_id:      sp.id,
    generation:      getGeneration(p.id),
    base_experience: p.base_experience,
    height:          p.height,
    weight:          p.weight,
    sprite_url:      p.sprites.front_default,
    sprite_shiny:    p.sprites.front_shiny,
    artwork_url:     p.sprites.other?.['official-artwork']?.front_default || null,
    artwork_shiny:   p.sprites.other?.['official-artwork']?.front_shiny   || null,
    types:           p.types.sort((a, b) => a.slot - b.slot).map(t => t.type.name),
    stats:           p.stats.map(s => ({ stat_name: s.stat.name, base_value: s.base_stat })),
    abilities:       p.abilities.map(a => ({ ability_name: a.ability.name, is_hidden: a.is_hidden })),
    ev_yield:        p.stats.filter(s => s.effort > 0).map(s => ({ stat_name: s.stat.name, effort: s.effort })),
    flavor_text:     flavorText,
    genus:           genusEntry ? genusEntry.genus : null,
    catch_rate:      sp.capture_rate,
    base_happiness:  sp.base_happiness,
    growth_rate:     sp.growth_rate?.name || null,
    gender_rate:     sp.gender_rate,
    egg_groups:      sp.egg_groups.map(e => e.name),
    habitat:         sp.habitat?.name || null,
    is_legendary:    sp.is_legendary,
    is_mythical:     sp.is_mythical,
    is_baby:         sp.is_baby,
    mega_forms:     megaForms,
    gmax_forms:     gmaxForms,
    regional_forms: regionalForms,
    alt_forms:      altForms,
    form_data,
    evolutions,
  };
}

// fetches the english short_effect for a single ability
async function fetchAbility(name) {
  const { data } = await axios.get(`${POKEAPI}/ability/${name}`);
  const entry = data.effect_entries.find(e => e.language.name === 'en');
  return entry ? entry.short_effect : null;
}

async function generate() {
  const all    = [];
  const failed = [];

  // ── pokemon ──
  console.log(`fetching ${MAX_ID} pokemon...`);
  for (let id = 1; id <= MAX_ID; id++) {
    try {
      await sleep(DELAY_MS);
      all.push(await fetchOne(id));
      if (id % 50 === 0) console.log(`  ${id}/${MAX_ID}`);
    } catch (err) {
      console.warn(`  [warn] id ${id} failed: ${err.message}`);
      failed.push(id);
    }
  }

  fs.mkdirSync(path.dirname(OUT_POKEMON), { recursive: true });
  fs.writeFileSync(OUT_POKEMON, JSON.stringify(all, null, 2));
  console.log(`\npokemon done. ${all.length} written to ${OUT_POKEMON}`);
  if (failed.length) console.warn(`failed ids: ${failed.join(', ')}`);

  // ── abilities ──
  const abilityNames = [...new Set(all.flatMap(p => p.abilities.map(a => a.ability_name)))].sort();
  console.log(`\nfetching ${abilityNames.length} unique abilities...`);

  const abilityMap  = {};
  const failedAbilities = [];

  for (let i = 0; i < abilityNames.length; i++) {
    const name = abilityNames[i];
    try {
      await sleep(DELAY_MS);
      abilityMap[name] = await fetchAbility(name);
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${abilityNames.length}`);
    } catch (err) {
      console.warn(`  [warn] ability "${name}" failed: ${err.message}`);
      failedAbilities.push(name);
    }
  }

  fs.writeFileSync(OUT_ABILITIES, JSON.stringify(abilityMap, null, 2));
  console.log(`\nabilities done. ${Object.keys(abilityMap).length} written to ${OUT_ABILITIES}`);
  if (failedAbilities.length) console.warn(`failed abilities: ${failedAbilities.join(', ')}`);
}

generate().catch(err => {
  console.error(err.message);
  process.exit(1);
});
