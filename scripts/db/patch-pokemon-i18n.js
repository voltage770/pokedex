/**
 * patch-pokemon-i18n.js
 * adds `name_jp` + `romaji` fields to every entry in pokemon.json by
 * fetching just `/pokemon-species/{id}` for each unique species. cheaper
 * than re-running generate.js since it skips evolution chains, form
 * fetches, and sprite work — only ~1025 single fetches.
 *
 * idempotent: re-running on already-patched data just refreshes the JP
 * fields. preserves all existing fields exactly (deep merge into each
 * record).
 *
 * usage:
 *   node db/patch-pokemon-i18n.js              # all
 *   node db/patch-pokemon-i18n.js --start 100  # resume from id 100
 *   node db/patch-pokemon-i18n.js --dry-run    # don't write
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const POKEAPI = 'https://pokeapi.co/api/v2';
const DELAY   = 100;
const OUT     = path.join(__dirname, '../../app/src/data/pokemon.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pickJP(names) {
  if (!names) return { name_jp: null, romaji: null };
  // PokeAPI codes: `ja` (kanji/katakana), `ja-hrkt` (hiragana fallback),
  // `ja-roma` (romaji — only on pokemon-species endpoints).
  const ja = names.find(n => n.language?.name === 'ja')
          || names.find(n => n.language?.name === 'ja-hrkt');
  const ro = names.find(n => n.language?.name === 'ja-roma');
  return { name_jp: ja?.name || null, romaji: ro?.name || null };
}

function parseArgs() {
  const out = { start: 0, dryRun: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--start')   out.start = parseInt(a[++i], 10) || 0;
    if (a[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  const all = JSON.parse(fs.readFileSync(OUT, 'utf-8'));

  // group by species_id — many entries share a species (forms). only need
  // one fetch per species, then apply to all entries with that species_id.
  const speciesIds = [...new Set(all.map(p => p.species_id))].sort((a, b) => a - b);
  const startIdx = speciesIds.findIndex(id => id >= opts.start);
  const work = startIdx === -1 ? speciesIds : speciesIds.slice(startIdx);
  console.log(`patching ${work.length} unique species (${all.length} pokemon records)...`);

  const jpBySpecies = new Map();
  let i = 0;
  for (const id of work) {
    i++;
    try {
      await sleep(DELAY);
      const { data } = await axios.get(`${POKEAPI}/pokemon-species/${id}`);
      const jp = pickJP(data.names);
      jpBySpecies.set(id, jp);
      if (i % 50 === 0 || i === work.length) console.log(`  ${i}/${work.length} (id ${id})`);
    } catch (e) {
      console.warn(`  [warn] species ${id} failed: ${e.message}`);
      jpBySpecies.set(id, { name_jp: null, romaji: null });
    }
  }

  for (const p of all) {
    const jp = jpBySpecies.get(p.species_id);
    if (jp) {
      p.name_jp = jp.name_jp;
      p.romaji  = jp.romaji;
    }
  }

  if (opts.dryRun) {
    console.log('\n--- DRY RUN: first 3 ---');
    for (const p of all.slice(0, 3)) console.log(p.id, p.name, '|', p.name_jp, p.romaji);
    return;
  }

  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
  const hits = all.filter(p => p.name_jp).length;
  console.log(`\ndone. ${hits}/${all.length} records have name_jp.`);
}

main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
