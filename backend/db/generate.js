/**
 * generate.js
 * fetches all pokemon from pokeapi and writes backend/data/pokemon.json
 * run once with: node db/generate.js
 *
 * data pulled per pokemon:
 *   - /pokemon/:id        base data, sprites, types, stats, abilities
 *   - /pokemon-species/:id  flavor text, genus, catch rate, gender rate, etc.
 *   - /evolution-chain/:id  full evo chain (cached — many pokemon share chains)
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const POKEAPI   = 'https://pokeapi.co/api/v2';
const MAX_ID    = 1025; // standard pokemon, no alternate-form entries
const DELAY_MS  = 120;  // pause between each pokemon to be polite to the api
const OUT       = path.join(__dirname, '../data/pokemon.json');

// evo chain responses are cached since many pokemon share the same chain
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

/**
 * recursively flattens an evolution chain tree into an array of steps.
 * each step describes one evolution: from → to, and the trigger details.
 */
function parseEvoChain(node, steps = []) {
  for (const next of (node.evolves_to || [])) {
    const det = next.evolution_details[0] || {};
    steps.push({
      from:       node.species.name,
      to:         next.species.name,
      min_level:  det.min_level  || null,
      trigger:    det.trigger?.name || null,
      item:       det.item?.name    || null,
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
  // fetch base data and species data in parallel
  const [{ data: p }, { data: sp }] = await Promise.all([
    axios.get(`${POKEAPI}/pokemon/${id}`),
    axios.get(`${POKEAPI}/pokemon-species/${id}`),
  ]);

  // most recent english flavor text, cleaned of special whitespace chars
  const flavorEntries = sp.flavor_text_entries.filter(e => e.language.name === 'en');
  const flavorText = flavorEntries.length
    ? flavorEntries[flavorEntries.length - 1].flavor_text.replace(/[\f\n\r]/g, ' ').trim()
    : null;

  // english genus, e.g. "seed pokemon"
  const genusEntry = sp.genera.find(g => g.language.name === 'en');
  const genus = genusEntry ? genusEntry.genus : null;

  // evolution chain (cached)
  const evolutions = await getEvoChain(sp.evolution_chain.url);

  return {
    // --- core ---
    id:              p.id,
    name:            p.name,
    species_id:      sp.id,
    generation:      getGeneration(p.id),
    base_experience: p.base_experience,
    height:          p.height,   // decimetres
    weight:          p.weight,   // hectograms

    // --- sprites ---
    sprite_url:     p.sprites.front_default,
    sprite_shiny:   p.sprites.front_shiny,
    artwork_url:    p.sprites.other?.['official-artwork']?.front_default || null,
    artwork_shiny:  p.sprites.other?.['official-artwork']?.front_shiny   || null,

    // --- battle data ---
    types:     p.types.sort((a, b) => a.slot - b.slot).map(t => t.type.name),
    stats:     p.stats.map(s => ({ stat_name: s.stat.name, base_value: s.base_stat })),
    abilities: p.abilities.map(a => ({
      ability_name: a.ability.name,
      is_hidden:    a.is_hidden,
    })),

    // --- species data ---
    flavor_text:    flavorText,
    genus,
    catch_rate:     sp.capture_rate,
    base_happiness: sp.base_happiness,
    growth_rate:    sp.growth_rate?.name  || null,
    gender_rate:    sp.gender_rate,        // -1 = genderless; 0–8 = female chance in eighths
    egg_groups:     sp.egg_groups.map(e => e.name),
    habitat:        sp.habitat?.name       || null,
    is_legendary:   sp.is_legendary,
    is_mythical:    sp.is_mythical,

    // --- evolution ---
    evolutions,
  };
}

async function generate() {
  const all    = [];
  const failed = [];

  console.log(`fetching ${MAX_ID} pokemon from pokeapi...`);

  for (let id = 1; id <= MAX_ID; id++) {
    try {
      await sleep(DELAY_MS);
      const pokemon = await fetchOne(id);
      all.push(pokemon);
      if (id % 50 === 0) console.log(`  ${id}/${MAX_ID}`);
    } catch (err) {
      console.warn(`  [warn] id ${id} failed: ${err.message}`);
      failed.push(id);
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));

  console.log(`\ndone. ${all.length} pokemon written to ${OUT}`);
  if (failed.length) {
    console.warn(`failed ids (${failed.length}): ${failed.join(', ')}`);
  }
}

generate().catch(err => {
  console.error(err.message);
  process.exit(1);
});
