const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../app/src/data/pokeballs.json');

const API = 'https://pokeapi.co/api/v2';
const DELAY = 350;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// categories in the pokeballs pocket
const CATEGORY_IDS = [33, 34, 39];

// legends arceus balls clutter the list — skip them
const SKIP = new Set([
  'la-poke-ball', 'la-great-ball', 'la-ultra-ball', 'la-heavy-ball',
  'la-leaden-ball', 'la-gigaton-ball', 'la-feather-ball', 'la-wing-ball',
  'la-jet-ball', 'la-origin-ball', 'la-strange-ball',
  'lastrange-ball', 'lapoke-ball', 'lagreat-ball', 'laultra-ball',
  'laheavy-ball', 'laleaden-ball', 'lagigaton-ball', 'lafeather-ball',
  'lawing-ball', 'lajet-ball', 'laorigin-ball',
  'park-ball', 'cherish-ball',
]);

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function pickJP(names) {
  if (!names) return { name_jp: null, romaji: null };
  const ja = names.find(n => n.language?.name === 'ja')
          || names.find(n => n.language?.name === 'ja-Hrkt');
  const ro = names.find(n => n.language?.name === 'roomaji');
  return { name_jp: ja?.name || null, romaji: ro?.name || null };
}

async function main() {
  // gather all ball item URLs from categories
  const itemUrls = [];
  for (const catId of CATEGORY_IDS) {
    try {
      const cat = await fetchJSON(`${API}/item-category/${catId}/`);
      for (const item of cat.items) {
        const slug = item.name;
        if (!SKIP.has(slug)) itemUrls.push({ slug, url: item.url });
      }
      await sleep(DELAY);
    } catch {
      // category might not exist (e.g. apricorn-balls)
    }
  }

  console.log(`fetching ${itemUrls.length} pokéballs...`);

  const balls = [];
  for (const { slug, url } of itemUrls) {
    const item = await fetchJSON(url);
    const en = item.effect_entries?.find(e => e.language.name === 'en');
    const flavor = item.flavor_text_entries
      ?.filter(f => f.language.name === 'en')
      ?.pop();

    const jp = pickJP(item.names);
    balls.push({
      id: item.id,
      name: item.name,
      name_jp: jp.name_jp,
      romaji:  jp.romaji,
      cost: item.cost,
      sprite: item.sprites?.default || null,
      effect: en?.short_effect || en?.effect || null,
      flavor_text: flavor?.text?.replace(/\n/g, ' ') || null,
      category: item.category?.name || null,
    });

    process.stdout.write('.');
    await sleep(DELAY);
  }

  // sort by id
  balls.sort((a, b) => a.id - b.id);

  fs.writeFileSync(OUT, JSON.stringify(balls, null, 2));
  console.log(`\nwrote ${balls.length} pokéballs to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
