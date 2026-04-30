const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../app/src/data/berries.json');

const API = 'https://pokeapi.co/api/v2';
const DELAY = 350;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function pickJP(names) {
  if (!names) return { name_jp: null, romaji: null };
  // PokeAPI item endpoints only expose `ja-hrkt` (no kanji, no romaji).
  // see fetch-abilities.js for full language code reference.
  const ja = names.find(n => n.language?.name === 'ja')
          || names.find(n => n.language?.name === 'ja-hrkt');
  const ro = names.find(n => n.language?.name === 'ja-roma');
  return { name_jp: ja?.name || null, romaji: ro?.name || null };
}

async function main() {
  // get full berry list
  const list = await fetchJSON(`${API}/berry/?limit=100`);
  console.log(`fetching ${list.results.length} berries...`);

  const berries = [];
  for (const entry of list.results) {
    const berry = await fetchJSON(entry.url);
    process.stdout.write('.');

    // fetch the linked item for sprite + description
    const item = await fetchJSON(berry.item.url);
    await sleep(DELAY);

    const en = item.effect_entries?.find(e => e.language.name === 'en');
    const flavor = item.flavor_text_entries
      ?.filter(f => f.language.name === 'en')
      ?.pop();

    const flavors = {};
    for (const f of berry.flavors) {
      if (f.potency > 0) flavors[f.flavor.name] = f.potency;
    }

    const jp = pickJP(item.names);
    berries.push({
      id: berry.id,
      name: berry.name,
      name_jp: jp.name_jp,
      romaji:  jp.romaji,
      item_name: item.name,
      sprite: item.sprites?.default || null,
      growth_time: berry.growth_time,
      max_harvest: berry.max_harvest,
      size: berry.size,
      smoothness: berry.smoothness,
      soil_dryness: berry.soil_dryness,
      firmness: berry.firmness?.name || null,
      natural_gift_type: berry.natural_gift_type?.name || null,
      natural_gift_power: berry.natural_gift_power,
      flavors,
      effect: en?.short_effect || en?.effect || null,
      flavor_text: flavor?.text?.replace(/\n/g, ' ') || null,
    });
  }

  // sort by id
  berries.sort((a, b) => a.id - b.id);

  fs.writeFileSync(OUT, JSON.stringify(berries, null, 2));
  console.log(`\nwrote ${berries.length} berries to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
