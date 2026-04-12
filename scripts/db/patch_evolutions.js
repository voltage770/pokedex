#!/usr/bin/env node
// Manually corrects evolution entries that PokeAPI returns with null trigger/conditions.
// Run after generate.js or patch_stats.js whenever the JSON is regenerated.
//
// Usage:
//   node db/patch_evolutions.js [--dry-run]

const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../../app/src/data/pokemon.json');
const DRY_RUN   = process.argv.includes('--dry-run');

// Keyed by "from|to". Use _remove: true to delete the step entirely.
const OVERRIDES = {
  // Trade evolutions requiring a held item — PokeAPI returns item: null for all of these
  'slowpoke|slowking':    { trigger: 'trade', item: 'kings-rock' },
  'poliwhirl|politoed':   { trigger: 'trade', item: 'kings-rock' },
  'onix|steelix':         { trigger: 'trade', item: 'metal-coat' },
  'scyther|scizor':       { trigger: 'trade', item: 'metal-coat' },
  'seadra|kingdra':       { trigger: 'trade', item: 'dragon-scale' },
  'porygon|porygon2':     { trigger: 'trade', item: 'up-grade' },
  'porygon2|porygon-z':   { trigger: 'trade', item: 'dubious-disc' },
  'rhydon|rhyperior':     { trigger: 'trade', item: 'protector' },
  'electabuzz|electivire':{ trigger: 'trade', item: 'electirizer' },
  'magmar|magmortar':     { trigger: 'trade', item: 'magmarizer' },
  'dusclops|dusknoir':    { trigger: 'trade', item: 'reaper-cloth' },
  'clamperl|huntail':     { trigger: 'trade', item: 'deep-sea-tooth' },
  'clamperl|gorebyss':    { trigger: 'trade', item: 'deep-sea-scale' },
  'spritzee|aromatisse':  { trigger: 'trade', item: 'sachet' },
  'swirlix|slurpuff':     { trigger: 'trade', item: 'whipped-dream' },

  // Gen 9 items/moves not yet in PokeAPI
  'applin|dipplin':         { trigger: 'use-item', item: 'syrupy-apple' },
  'dipplin|hydrapple':      { trigger: 'level-up', known_move: 'dragon-cheer' },
  'duraludon|archaludon':   { trigger: 'use-item', item: 'metal-alloy' },
  'poltchageist|sinistcha': { trigger: 'use-item', item: 'unremarkable-teacup' },

  // PokeAPI bug — Phione does not actually evolve into Manaphy
  'phione|manaphy': { _remove: true },
};

const pokemon = JSON.parse(readFileSync(DATA_PATH, 'utf8'));

let patched = 0;
let removed = 0;

for (const p of pokemon) {
  if (!Array.isArray(p.evolutions)) continue;

  const next = [];
  for (const evo of p.evolutions) {
    const key      = `${evo.from}|${evo.to}`;
    const override = OVERRIDES[key];
    if (!override) { next.push(evo); continue; }

    if (override._remove) {
      console.log(`  remove  ${key}`);
      removed++;
    } else {
      console.log(`  patch   ${key}  →  ${JSON.stringify(override)}`);
      next.push({ ...evo, ...override });
      patched++;
    }
  }
  p.evolutions = next;
}

console.log(`\n${patched} steps patched, ${removed} steps removed`);

if (DRY_RUN) {
  console.log('dry run — no file written');
} else {
  writeFileSync(DATA_PATH, JSON.stringify(pokemon, null, 2));
  console.log(`wrote ${DATA_PATH}`);
}
