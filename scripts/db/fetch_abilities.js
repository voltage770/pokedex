/**
 * fetch_abilities.js
 * reads existing pokemon.json, fetches english short_effect for every
 * unique ability from pokeapi, writes app/src/data/abilities.json
 *
 * run with: node db/fetch_abilities.js
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const POKEAPI      = 'https://pokeapi.co/api/v2';
const DELAY_MS     = 100;
const IN_POKEMON   = path.join(__dirname, '../../app/src/data/pokemon.json');
const OUT_ABILITIES = path.join(__dirname, '../../app/src/data/abilities.json');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const pokemon = JSON.parse(fs.readFileSync(IN_POKEMON, 'utf8'));
  const names   = [...new Set(pokemon.flatMap(p => p.abilities.map(a => a.ability_name)))].sort();

  console.log(`fetching ${names.length} unique abilities...`);

  const map    = {};
  const failed = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    try {
      await sleep(DELAY_MS);
      const { data } = await axios.get(`${POKEAPI}/ability/${name}`);
      const entry = data.effect_entries.find(e => e.language.name === 'en');
      map[name] = entry ? entry.short_effect : null;
      if ((i + 1) % 50 === 0 || i + 1 === names.length) {
        console.log(`  ${i + 1}/${names.length}`);
      }
    } catch (err) {
      console.warn(`  [warn] "${name}" failed: ${err.message}`);
      failed.push(name);
    }
  }

  fs.writeFileSync(OUT_ABILITIES, JSON.stringify(map, null, 2));
  console.log(`\ndone. ${Object.keys(map).length} abilities written to ${OUT_ABILITIES}`);
  if (failed.length) console.warn(`failed: ${failed.join(', ')}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
