/**
 * patch_stats.js
 * patches pokemon.json with ev_yield for all base pokemon
 * and height/weight/ev_yield for all form_data entries.
 * only fetches from pokeapi — no bulbapedia calls.
 *
 * usage:
 *   node db/patch_stats.js [--only slug1,slug2] [--dry-run]
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const POKEAPI      = 'https://pokeapi.co/api/v2';
const DELAY_MS     = 120;
const POKEMON_PATH = path.join(__dirname, '../../app/src/data/pokemon.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchStats(slug) {
  const { data } = await axios.get(`${POKEAPI}/pokemon/${slug}`);
  return {
    height:   data.height,
    weight:   data.weight,
    ev_yield: data.stats.filter(s => s.effort > 0).map(s => ({ stat_name: s.stat.name, effort: s.effort })),
  };
}

async function main() {
  const args     = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const onlyIdx  = args.indexOf('--only');
  const onlySet  = onlyIdx !== -1 ? new Set(args[onlyIdx + 1].split(',')) : null;

  const pokemon = JSON.parse(fs.readFileSync(POKEMON_PATH, 'utf-8'));

  let basePatched = 0, formPatched = 0, failed = [];

  for (const p of pokemon) {
    if (onlySet && !onlySet.has(p.name)) continue;

    // patch base ev_yield
    if (!p.ev_yield) {
      if (isDryRun) {
        console.log(`[dry] would patch base ev_yield for ${p.name}`);
      } else {
        try {
          await sleep(DELAY_MS);
          const stats = await fetchStats(p.name);
          p.ev_yield = stats.ev_yield;
          basePatched++;
          if (basePatched % 100 === 0) console.log(`  base: ${basePatched} patched...`);
        } catch (e) {
          console.warn(`  [warn] ${p.name} base failed: ${e.message}`);
          failed.push(p.name);
        }
      }
    }

    // patch form_data height/weight/ev_yield
    for (const [slug, fd] of Object.entries(p.form_data || {})) {
      if (fd.height != null && fd.weight != null && fd.ev_yield != null) continue;
      if (isDryRun) {
        console.log(`[dry] would patch form stats for ${slug}`);
        continue;
      }
      try {
        await sleep(DELAY_MS);
        const stats = await fetchStats(slug);
        fd.height   = stats.height;
        fd.weight   = stats.weight;
        fd.ev_yield = stats.ev_yield;
        formPatched++;
      } catch (e) {
        console.warn(`  [warn] ${slug} form failed: ${e.message}`);
        failed.push(slug);
      }
    }
  }

  if (!isDryRun) {
    fs.writeFileSync(POKEMON_PATH, JSON.stringify(pokemon));
    console.log(`\ndone. base: ${basePatched} patched, forms: ${formPatched} patched`);
    if (failed.length) console.warn(`failed: ${failed.join(', ')}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
