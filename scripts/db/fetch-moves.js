const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../app/src/data/moves.json');

const API = 'https://pokeapi.co/api/v2';
const DELAY = 200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const list = await fetchJSON(`${API}/move/?limit=2000`);
  const total = list.results.length;
  console.log(`fetching ${total} moves...`);

  const moves = [];
  let done = 0;

  for (const entry of list.results) {
    const m = await fetchJSON(entry.url);
    if (!m) { done++; continue; }

    const en = m.effect_entries?.find(e => e.language.name === 'en');
    const flavor = m.flavor_text_entries
      ?.filter(f => f.language.name === 'en')
      ?.pop();

    moves.push({
      id: m.id,
      name: m.name,
      type: m.type?.name || null,
      power: m.power,
      pp: m.pp,
      accuracy: m.accuracy,
      damage_class: m.damage_class?.name || null,
      priority: m.priority,
      effect: en?.short_effect || null,
      flavor_text: flavor?.flavor_text?.replace(/\n/g, ' ') || null,
      generation: m.generation?.name?.replace('generation-', '') || null,
    });

    done++;
    if (done % 50 === 0) process.stdout.write(`  ${done}/${total}\n`);
    await sleep(DELAY);
  }

  moves.sort((a, b) => a.id - b.id);

  fs.writeFileSync(OUT, JSON.stringify(moves, null, 2));
  console.log(`\nwrote ${moves.length} moves to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
