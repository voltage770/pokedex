// Probes PokeAPI for recent additions and changes.
// Run: node db/probe-api.js [--pokemon] [--abilities] [--forms] [--since <id>]
//
// Examples:
//   node db/probe-api.js --pokemon --since 1010   # new pokemon after id 1010
//   node db/probe-api.js --abilities               # scan for new/changed abilities
//   node db/probe-api.js --forms charizard          # check forms for specific pokemon

const API = 'https://pokeapi.co/api/v2';
const DELAY = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function probePokemon(sinceId) {
  console.log(`\n=== probing pokemon since id ${sinceId} ===\n`);
  let id = sinceId + 1;
  let misses = 0;
  while (misses < 5) {
    const p = await fetchJSON(`${API}/pokemon/${id}/`);
    if (!p) { misses++; id++; await sleep(DELAY); continue; }
    misses = 0;
    const species = await fetchJSON(`${API}/pokemon-species/${p.species?.name || id}/`);
    await sleep(DELAY);
    const gen = species?.generation?.name || '?';
    const abilities = p.abilities?.map(a => `${a.ability.name}${a.is_hidden ? ' (H)' : ''}`).join(', ');
    console.log(`  #${id} ${p.name} [${gen}] — types: ${p.types.map(t => t.type.name).join('/')} — abilities: ${abilities}`);
    id++;
    await sleep(DELAY);
  }
  console.log(`\nscanned up to id ${id - 1}, ${misses} consecutive misses → stopping`);
}

async function probeAbilities() {
  console.log('\n=== probing all abilities ===\n');
  const list = await fetchJSON(`${API}/ability/?limit=9999`);
  console.log(`total abilities in API: ${list.count}`);

  // load our local abilities for comparison
  const fs = require('fs');
  const path = require('path');
  let local = {};
  try {
    local = JSON.parse(fs.readFileSync(path.join(__dirname, '../../app/src/data/abilities.json'), 'utf-8'));
  } catch { console.log('  (no local abilities.json found for comparison)'); }

  const localNames = new Set(Object.keys(local));
  const apiNames = new Set(list.results.map(a => a.name));

  const newAbilities = [...apiNames].filter(n => !localNames.has(n));
  const removedAbilities = [...localNames].filter(n => !apiNames.has(n));

  if (newAbilities.length) {
    console.log(`\n  NEW abilities (${newAbilities.length}):`);
    for (const name of newAbilities) {
      const ab = await fetchJSON(`${API}/ability/${name}/`);
      await sleep(DELAY);
      const en = ab?.effect_entries?.find(e => e.language.name === 'en');
      const gen = ab?.generation?.name || '?';
      console.log(`    ${name} [${gen}]: ${en?.short_effect || '(no description)'}`);
    }
  } else {
    console.log('  no new abilities found');
  }

  if (removedAbilities.length) {
    console.log(`\n  abilities in local but NOT in API (${removedAbilities.length}):`);
    removedAbilities.forEach(n => console.log(`    ${n}`));
  }
}

async function probeForms(pokemonName) {
  console.log(`\n=== probing forms for ${pokemonName} ===\n`);
  const species = await fetchJSON(`${API}/pokemon-species/${pokemonName}/`);
  if (!species) { console.log('  species not found'); return; }

  console.log(`  species: ${species.name} (id: ${species.id}, gen: ${species.generation?.name})`);
  console.log(`  varieties: ${species.varieties?.length || 0}`);

  for (const v of (species.varieties || [])) {
    const p = await fetchJSON(v.pokemon.url);
    await sleep(DELAY);
    if (!p) continue;
    const abilities = p.abilities?.map(a => `${a.ability.name}${a.is_hidden ? ' (H)' : ''}`).join(', ');
    const stats = p.stats?.map(s => `${s.stat.name}: ${s.base_stat}`).join(', ');
    console.log(`\n  ${p.name}${v.is_default ? ' (default)' : ''}`);
    console.log(`    types: ${p.types.map(t => t.type.name).join('/')}`);
    console.log(`    abilities: ${abilities}`);
    console.log(`    stats: ${stats}`);
  }
}

async function probeNewMegas() {
  console.log('\n=== checking mega forms for ability updates ===\n');
  const fs = require('fs');
  const path = require('path');
  let localData;
  try {
    localData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../app/src/data/pokemon.json'), 'utf-8'));
  } catch { console.log('  could not read local pokemon.json'); return; }

  const megaMons = localData.filter(p => p.mega_forms?.length > 0);
  console.log(`  checking ${megaMons.length} pokemon with mega forms...\n`);

  for (const mon of megaMons) {
    for (const formSlug of mon.mega_forms) {
      const localForm = mon.form_data?.[formSlug];
      if (!localForm) continue;

      const p = await fetchJSON(`${API}/pokemon/${formSlug}/`);
      await sleep(DELAY);
      if (!p) continue;

      const apiAbilities = p.abilities?.map(a => ({ name: a.ability.name, hidden: a.is_hidden })) || [];
      const localAbilities = localForm.abilities || [];

      const apiSet = apiAbilities.map(a => a.name).sort().join(',');
      const localSet = localAbilities.map(a => a.ability_name).sort().join(',');

      if (apiSet !== localSet) {
        console.log(`  ${formSlug}: CHANGED`);
        console.log(`    local:  ${localSet || '(none)'}`);
        console.log(`    api:    ${apiSet || '(none)'}`);
        apiAbilities.forEach(a => console.log(`      ${a.name}${a.hidden ? ' (hidden)' : ''}`));
      }
    }
  }
  console.log('\n  done checking megas');
}

// parse args
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')).map(a => a.slice(2)));

(async () => {
  if (flags.has('pokemon')) {
    const sinceIdx = args.indexOf('--since');
    const sinceId = sinceIdx >= 0 ? Number(args[sinceIdx + 1]) : 1025;
    await probePokemon(sinceId);
  }

  if (flags.has('abilities')) {
    await probeAbilities();
  }

  if (flags.has('forms')) {
    const name = args.find(a => !a.startsWith('--') && a !== args[args.indexOf('--since') + 1]);
    if (name) await probeForms(name);
    else console.log('usage: --forms <pokemon-name>');
  }

  if (flags.has('megas')) {
    await probeNewMegas();
  }

  if (!flags.size) {
    console.log('usage: node db/probe-api.js [--pokemon] [--abilities] [--forms <name>] [--megas] [--since <id>]');
    console.log('\n  --pokemon   check for new pokemon after a given id (default 1025)');
    console.log('  --abilities compare local abilities.json against API');
    console.log('  --forms     show all forms/varieties for a specific pokemon');
    console.log('  --megas     check all mega forms for ability changes vs local data');
    console.log('  --since N   starting id for --pokemon scan');
  }
})();
