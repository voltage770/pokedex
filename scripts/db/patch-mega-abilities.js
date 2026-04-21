const fs = require('fs');
const path = require('path');

const POKEMON_PATH = path.join(__dirname, '../../app/src/data/pokemon.json');
const ABILITIES_PATH = path.join(__dirname, '../../app/src/data/abilities.json');

const API = 'https://pokeapi.co/api/v2';
const DELAY = 350;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const pokemon = JSON.parse(fs.readFileSync(POKEMON_PATH, 'utf-8'));
  const abilities = JSON.parse(fs.readFileSync(ABILITIES_PATH, 'utf-8'));

  const megaMons = pokemon.filter(p => p.mega_forms?.length > 0);
  let patchedForms = 0;
  let newAbilities = 0;

  console.log(`scanning ${megaMons.length} pokemon with mega forms...\n`);

  for (const mon of megaMons) {
    for (const formSlug of mon.mega_forms) {
      const localForm = mon.form_data?.[formSlug];
      if (!localForm) continue;

      const p = await fetchJSON(`${API}/pokemon/${formSlug}/`);
      await sleep(DELAY);
      if (!p) continue;

      const apiAbilities = p.abilities?.map(a => ({
        ability_name: a.ability.name,
        is_hidden: a.is_hidden,
      })) || [];

      const localSet = (localForm.abilities || []).map(a => a.ability_name).sort().join(',');
      const apiSet = apiAbilities.map(a => a.ability_name).sort().join(',');

      if (apiSet && apiSet !== localSet) {
        localForm.abilities = apiAbilities;
        patchedForms++;
        console.log(`  patched ${formSlug}: ${apiAbilities.map(a => a.ability_name).join(', ')}`);

        // also fetch descriptions for any new abilities
        for (const a of apiAbilities) {
          if (!abilities[a.ability_name]) {
            const ab = await fetchJSON(`${API}/ability/${a.ability_name}/`);
            await sleep(DELAY);
            if (ab) {
              const en = ab.effect_entries?.find(e => e.language.name === 'en');
              const desc = en?.short_effect || en?.effect || null;
              if (desc) {
                abilities[a.ability_name] = desc;
                newAbilities++;
                console.log(`    + ability: ${a.ability_name}`);
              }
            }
          }
        }
      }
    }
  }

  // also backfill any real gen 6-9 abilities we're missing
  console.log('\nchecking for other missing abilities...');
  const list = await fetchJSON(`${API}/ability/?limit=9999`);
  const SKIP_GENS = new Set(['generation-i', 'generation-ii', 'generation-iii', 'generation-iv', 'generation-v']);

  for (const entry of list.results) {
    if (abilities[entry.name]) continue;

    const ab = await fetchJSON(entry.url);
    await sleep(DELAY);
    if (!ab) continue;

    // skip gen-v conquest abilities (no descriptions)
    if (SKIP_GENS.has(ab.generation?.name)) continue;

    const en = ab.effect_entries?.find(e => e.language.name === 'en');
    const desc = en?.short_effect || en?.effect || null;
    if (desc) {
      abilities[entry.name] = desc;
      newAbilities++;
      console.log(`  + ${entry.name} [${ab.generation?.name}]`);
    }
  }

  fs.writeFileSync(POKEMON_PATH, JSON.stringify(pokemon, null, 2));
  fs.writeFileSync(ABILITIES_PATH, JSON.stringify(abilities, null, 2));

  console.log(`\ndone: patched ${patchedForms} mega forms, added ${newAbilities} ability descriptions`);
}

main().catch(err => { console.error(err); process.exit(1); });
