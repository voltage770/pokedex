import ALL from '../data/pokemon.json';

// name → id lookup for evo chain sprite resolution
// includes species-name aliases for pokemon whose stored name has a form suffix
// (e.g. PokeAPI evo chains reference 'toxtricity' but we store 'toxtricity-amped')
const _nameToId = Object.fromEntries(ALL.map(p => [p.name, p.id]));

// pokemon whose stored name has a form suffix (e.g. 'toxtricity-amped')
// while PokeAPI evo chains reference only the species name (e.g. 'toxtricity')
export const FORM_SUFFIX_SPECIES = [
  'dudunsparce', 'wormadam',  'basculegion', 'darmanitan', 'jellicent',
  'pyroar',      'meowstic',  'aegislash',   'gourgeist',  'lycanroc',
  'toxtricity',  'urshifu',   'oinkologne',  'maushold',   'palafin',
  'shaymin',
];

const _speciesAliases = FORM_SUFFIX_SPECIES.reduce((acc, species) => {
  const match = ALL.find(p => p.name.startsWith(species + '-'));
  if (match) acc[species] = match.id;
  return acc;
}, {});

export const NAME_TO_ID = { ..._nameToId, ..._speciesAliases };

// returns the chip label for the "base" form of a pokemon whose stored name includes a form suffix
// e.g. 'toxtricity-amped' → 'amped', 'meowth' → null (caller should use 'base')
export function getBaseFormLabel(pokemonName) {
  for (const species of FORM_SUFFIX_SPECIES) {
    if (pokemonName.startsWith(species + '-')) {
      return pokemonName.slice(species.length + 1).replace(/-/g, ' ');
    }
  }
  return null;
}

// global form data map — spans all pokemon so evo chains can resolve any form's sprites
export const FORM_DATA = Object.fromEntries(
  ALL.flatMap(p => Object.entries(p.form_data || {}))
);

// form name → base pokemon ID (for forms that aren't top-level pokemon entries)
export const FORM_TO_BASE_ID = Object.fromEntries(
  ALL.flatMap(p => Object.keys(p.form_data || {}).map(form => [form, p.id]))
);

// returns the form name to highlight in list cards for a given class filter
// forms that exist in the data but should never be surfaced in the UI
export const EXCLUDED_FORMS = new Set(['pikachu-alola-cap']);

// returns all forms to expand into cards for a given class filter
// single-form filters return at most one entry; multi-form filters expand all available
function highlightFormsFor(p, cls) {
  const has = f => !!p.form_data?.[f] && !EXCLUDED_FORMS.has(f);
  switch (cls) {
    case 'has-mega':        return (p.mega_forms     || []).filter(has);
    case 'has-gmax':        return (p.gmax_forms     || []).filter(has);
    case 'has-regional':    return (p.regional_forms || []).filter(has);
    case 'has-forms':       return (p.alt_forms      || []).filter(has);
    case 'regional-alola':  { const f = p.regional_forms?.find(n => n.endsWith('-alola'));  return f && has(f) ? [f] : []; }
    case 'regional-galar':  { const f = p.regional_forms?.find(n => n.endsWith('-galar'));  return f && has(f) ? [f] : []; }
    case 'regional-hisui':  { const f = p.regional_forms?.find(n => n.endsWith('-hisui'));  return f && has(f) ? [f] : []; }
    case 'regional-paldea': { const f = p.regional_forms?.find(n => n.endsWith('-paldea')); return f && has(f) ? [f] : []; }
    default: return [];
  }
}

// slim shape returned by the list — detail/compare get the full object
function slim(p, formName) {
  const formData = formName ? p.form_data?.[formName] : null;
  return {
    id:           p.id,
    uid:          formName ? `${p.id}-${formName}` : String(p.id),
    name:         formName || p.name,
    base_name:    p.name,
    generation:   p.generation,
    sprite_url:   p.sprite_url,
    sprite_shiny: p.sprite_shiny,
    artwork_url:  formData?.artwork_url || formData?.sprite_url || p.artwork_url,
    types:        formData?.types || p.types,
    stats:        p.stats,
    form:         formName || null,
  };
}

// returns total base stat value for a pokemon
function totalStats(p) {
  return p.stats.reduce((sum, s) => sum + s.base_value, 0);
}

// returns base value for a specific stat name
function getStat(p, name) {
  return (p.stats.find(s => s.stat_name === name) || { base_value: 0 }).base_value;
}

// ultra beast pokedex IDs (no dedicated field in data)
const ULTRA_BEAST_IDS = new Set([793,794,795,796,797,798,799,803,804,805,806]);

function matchesClass(p, cls) {
  switch (cls) {
    case 'legendary':        return p.is_legendary && !p.is_mythical;
    case 'mythical':         return p.is_mythical;
    case 'paradox':          return p.genus === 'Paradox Pokémon';
    case 'ultra-beast':      return ULTRA_BEAST_IDS.has(p.id);
    case 'pseudo-legendary': return !p.is_legendary && !p.is_mythical && totalStats(p) === 600;
    case 'baby':             return !!p.is_baby;
    case 'has-mega':         return p.mega_forms?.length > 0;
    case 'has-gmax':         return p.gmax_forms?.length > 0;
    case 'has-regional':     return p.regional_forms?.length > 0;
    case 'regional-alola':   return p.regional_forms?.some(n => n.endsWith('-alola'));
    case 'regional-galar':   return p.regional_forms?.some(n => n.endsWith('-galar'));
    case 'regional-hisui':   return p.regional_forms?.some(n => n.endsWith('-hisui'));
    case 'regional-paldea':  return p.regional_forms?.some(n => n.endsWith('-paldea'));
    case 'has-forms':        return p.alt_forms?.length > 0;
    default: return true;
  }
}

// filtered, sorted, paginated list
export function getPokemon(filters = {}) {
  const { search, type, generation, cls, stat, minStat, sort = 'id', sortDir = 'asc', limit = 20, offset = 0 } = filters;

  let results = ALL;

  if (search)     results = results.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (type)       results = results.filter(p => p.types.includes(type));
  if (generation) results = results.filter(p => p.generation === Number(generation));
  if (cls)        results = results.filter(p => matchesClass(p, cls));
  if (stat && minStat) {
    const min = Number(minStat);
    results = results.filter(p => getStat(p, stat) >= min);
  }

  // sort
  results = [...results].sort((a, b) => {
    let aVal, bVal;
    if (sort === 'name') {
      return sortDir === 'desc'
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name);
    }
    if (sort === 'total') {
      aVal = totalStats(a); bVal = totalStats(b);
    } else if (sort === 'id') {
      aVal = a.id; bVal = b.id;
    } else {
      aVal = getStat(a, sort); bVal = getStat(b, sort);
    }
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  return Promise.resolve(
    results
      .flatMap(p => {
        const forms = highlightFormsFor(p, cls);
        return forms.length ? forms.map(f => slim(p, f)) : [slim(p, null)];
      })
      .slice(Number(offset), Number(offset) + Number(limit))
  );
}

// returns the clean region suffix if the form name is exactly '{base}-{region}', else null
// e.g. 'vulpix-alola' → 'alola', 'raticate-totem-alola' → null
function cleanRegion(formName, baseName) {
  const suffix = formName.slice(baseName.length + 1);
  return ['alola', 'galar', 'hisui', 'paldea'].includes(suffix) ? suffix : null;
}

// known cases where a regional form's evolution trigger differs from the base form's
// keyed as '{from}->{to}'. fields here override what's inherited from the base evolution.
// location/time_of_day are added for alola-exclusive form conditions not captured by pokeapi.
const REGIONAL_EVO_OVERRIDES = {
  // item differs
  'vulpix-alola->ninetales-alola':    { trigger: 'use-item', item: 'ice-stone',       min_level: null },
  'sandshrew-alola->sandslash-alola': { trigger: 'use-item', item: 'ice-stone',       min_level: null },
  'slowpoke-galar->slowbro-galar':    { trigger: 'use-item', item: 'galarica-cuff',   min_level: null },
  'slowpoke-galar->slowking-galar':   { trigger: 'use-item', item: 'galarica-wreath', min_level: null },
  // same item/level as base, but location-gated — pokeapi doesn't track this for form conditions
  'pikachu->raichu-alola':           { trigger: 'use-item', item: 'thunder-stone', min_level: null, location: 'alola' },
  'exeggcute->exeggutor-alola':      { trigger: 'use-item', item: 'leaf-stone',    min_level: null, location: 'alola' },
  'cubone->marowak-alola':           { trigger: 'level-up', item: null,            min_level: 28,   location: 'alola', time_of_day: 'night' },
};

// cases where a regional form evolves into a completely new species (not a regional form of
// an existing species), so the chain can't be inferred from regional_forms alone.
// keyed by base species name. steps here are merged into the inferred chains, with dedup.
const REGIONAL_NEW_SPECIES = {
  // galarian meowth line
  meowth:      { galar:  [{ from: 'meowth-galar',    to: 'perrserker', trigger: 'level-up', min_level: 28 }] },
  perrserker:  { galar:  [{ from: 'meowth-galar',    to: 'perrserker', trigger: 'level-up', min_level: 28 }] },
  // galarian zigzagoon line
  zigzagoon:   { galar:  [{ from: 'linoone-galar',   to: 'obstagoon',  trigger: 'level-up', min_level: 35, time_of_day: 'night' }] },
  linoone:     { galar:  [{ from: 'linoone-galar',   to: 'obstagoon',  trigger: 'level-up', min_level: 35, time_of_day: 'night' }] },
  obstagoon:   { galar:  [{ from: 'linoone-galar',   to: 'obstagoon',  trigger: 'level-up', min_level: 35, time_of_day: 'night' }] },
  // galarian yamask line
  yamask:      { galar:  [{ from: 'yamask-galar',    to: 'runerigus',  trigger: 'level-up', location: 'dusty-bowl' }] },
  runerigus:   { galar:  [{ from: 'yamask-galar',    to: 'runerigus',  trigger: 'level-up', location: 'dusty-bowl' }] },
  cofagrigus:  { galar:  [{ from: 'yamask-galar',    to: 'runerigus',  trigger: 'level-up', location: 'dusty-bowl' }] },
  // galarian corsola line
  corsola:     { galar:  [{ from: 'corsola-galar',   to: 'cursola',    trigger: 'level-up', min_level: 38 }] },
  cursola:     { galar:  [{ from: 'corsola-galar',   to: 'cursola',    trigger: 'level-up', min_level: 38 }] },
  // galarian farfetch'd line
  farfetchd:   { galar:  [{ from: 'farfetchd-galar', to: 'sirfetchd',  trigger: 'level-up' }] },
  sirfetchd:   { galar:  [{ from: 'farfetchd-galar', to: 'sirfetchd',  trigger: 'level-up' }] },
  // galarian mr. mime line
  'mime-jr':   { galar:  [{ from: 'mr-mime-galar',   to: 'mr-rime',    trigger: 'level-up', min_level: 42 }] },
  'mr-mime':   { galar:  [{ from: 'mr-mime-galar',   to: 'mr-rime',    trigger: 'level-up', min_level: 42 }] },
  'mr-rime':   { galar:  [{ from: 'mr-mime-galar',   to: 'mr-rime',    trigger: 'level-up', min_level: 42 }] },
  // hisuian sneasel line
  sneasel:     { hisui:  [{ from: 'sneasel-hisui',   to: 'sneasler',   trigger: 'use-item', item: 'razor-claw', time_of_day: 'day' }] },
  sneasler:    { hisui:  [{ from: 'sneasel-hisui',   to: 'sneasler',   trigger: 'use-item', item: 'razor-claw', time_of_day: 'day' }] },
  // hisuian qwilfish line
  qwilfish:    { hisui:  [{ from: 'qwilfish-hisui',  to: 'overqwil',   trigger: 'level-up' }] },
  overqwil:    { hisui:  [{ from: 'qwilfish-hisui',  to: 'overqwil',   trigger: 'level-up' }] },
  // paldean wooper line
  wooper:      { paldea: [{ from: 'wooper-paldea',   to: 'clodsire',   trigger: 'level-up', min_level: 20 }] },
  quagsire:    { paldea: [{ from: 'wooper-paldea',   to: 'clodsire',   trigger: 'level-up', min_level: 20 }] },
  clodsire:    { paldea: [{ from: 'wooper-paldea',   to: 'clodsire',   trigger: 'level-up', min_level: 20 }] },
};

// builds { region: [{from, to, ...conditions}] } for regional form evolution chains.
// infers chains from the base evolutions array by checking if both pre-evo and evo species
// have matching regional forms. if only the evo has a regional form (e.g. cubone → marowak-alola),
// uses the base pre-evo as the from. merges in REGIONAL_NEW_SPECIES for cases that can't be inferred.
function buildRegionalEvolutions(pokemon) {
  if (!pokemon.evolutions?.length) return {};
  const byName = Object.fromEntries(ALL.map(p => [p.name, p]));
  const chains = {};

  for (const step of pokemon.evolutions) {
    const fromP = byName[step.from];
    const toP   = byName[step.to];
    if (!fromP || !toP) continue;

    const fromRegions = Object.fromEntries(
      (fromP.regional_forms || []).map(f => [cleanRegion(f, step.from), f]).filter(([r]) => r)
    );
    const toRegions = Object.fromEntries(
      (toP.regional_forms || []).map(f => [cleanRegion(f, step.to), f]).filter(([r]) => r)
    );

    for (const region of new Set([...Object.keys(fromRegions), ...Object.keys(toRegions)])) {
      const toForm = toRegions[region];
      if (!toForm) continue;
      const fromForm = fromRegions[region] || step.from;
      const overrideKey = `${fromForm}->${toForm}`;
      const ov = REGIONAL_EVO_OVERRIDES[overrideKey];
      if (!chains[region]) chains[region] = [];
      chains[region].push({
        from:            fromForm,
        to:              toForm,
        trigger:         ov?.trigger         ?? step.trigger,
        min_level:       ov?.min_level       ?? step.min_level,
        item:            ov?.item            ?? step.item,
        location:        ov?.location        ?? step.location        ?? null,
        time_of_day:     ov?.time_of_day     ?? step.time_of_day     ?? null,
        min_happiness:   ov?.min_happiness   ?? step.min_happiness   ?? null,
        known_move:      ov?.known_move      ?? step.known_move      ?? null,
        known_move_type: ov?.known_move_type ?? step.known_move_type ?? null,
        trade_species:   ov?.trade_species   ?? step.trade_species   ?? null,
        needs_rain:      ov?.needs_rain      ?? step.needs_rain      ?? null,
        turn_upside_down: ov?.turn_upside_down ?? step.turn_upside_down ?? null,
      });
    }
  }

  // merge in hardcoded steps for regional forms that evolve into new species
  const supplement = REGIONAL_NEW_SPECIES[pokemon.name] || {};
  for (const [region, steps] of Object.entries(supplement)) {
    if (!chains[region]) chains[region] = [];
    for (const step of steps) {
      const isDupe = chains[region].some(s => s.from === step.from && s.to === step.to);
      if (!isDupe) chains[region].push(step);
    }
  }

  return chains;
}

// evo steps where a single species-level entry should branch into per-form steps
// keyed as 'from->to'. PokeAPI doesn't capture nature-based or other form-splitting conditions.
const BRANCHING_EVO_OVERRIDES = {
  'toxel->toxtricity': [
    { from: 'toxel', to: 'toxtricity-amped',  trigger: 'level-up', min_level: 30, nature: 'amped natures'    },
    { from: 'toxel', to: 'toxtricity-low-key', trigger: 'level-up', min_level: 30, nature: 'low-key natures' },
  ],
  'tyrogue->hitmonlee':  [{ from: 'tyrogue', to: 'hitmonlee',  trigger: 'level-up', min_level: 20, nature: 'ATK > DEF' }],
  'tyrogue->hitmonchan': [{ from: 'tyrogue', to: 'hitmonchan', trigger: 'level-up', min_level: 20, nature: 'DEF > ATK' }],
  'tyrogue->hitmontop':  [{ from: 'tyrogue', to: 'hitmontop',  trigger: 'level-up', min_level: 20, nature: 'ATK = DEF' }],
};

// mega stone (or equivalent condition) for each mega form name
// rayquaza uses a move instead of a stone; diancie/latias/latios stones are held items from in-game events
const MEGA_STONE = {
  'venusaur-mega':      'venusaurite',
  'charizard-mega-x':   'charizardite-x',
  'charizard-mega-y':   'charizardite-y',
  'blastoise-mega':     'blastoisinite',
  'beedrill-mega':      'beedrillite',
  'pidgeot-mega':       'pidgeotite',
  'alakazam-mega':      'alakazite',
  'slowbro-mega':       'slowbronite',
  'gengar-mega':        'gengarite',
  'kangaskhan-mega':    'kangaskhanite',
  'pinsir-mega':        'pinsirite',
  'gyarados-mega':      'gyaradosite',
  'aerodactyl-mega':    'aerodactylite',
  'mewtwo-mega-x':      'mewtwonite-x',
  'mewtwo-mega-y':      'mewtwonite-y',
  'ampharos-mega':      'ampharosite',
  'steelix-mega':       'steelixite',
  'scizor-mega':        'scizorite',
  'heracross-mega':     'heracronite',
  'houndoom-mega':      'houndoominite',
  'tyranitar-mega':     'tyranitarite',
  'blaziken-mega':      'blazikenite',
  'gardevoir-mega':     'gardevoirite',
  'mawile-mega':        'mawilite',
  'aggron-mega':        'aggronite',
  'medicham-mega':      'medichamite',
  'manectric-mega':     'manectite',
  'sableye-mega':       'sablenite',
  'sharpedo-mega':      'sharpedonite',
  'camerupt-mega':      'cameruptite',
  'altaria-mega':       'altarianite',
  'banette-mega':       'banettite',
  'absol-mega':         'absolite',
  'glalie-mega':        'glalitite',
  'salamence-mega':     'salamencite',
  'metagross-mega':     'metagrossite',
  'latias-mega':        'latiasite',
  'latios-mega':        'latiosite',
  'rayquaza-mega':      'dragon-ascent',  // move, not a stone
  'lopunny-mega':       'lopunnite',
  'garchomp-mega':      'garchompite',
  'lucario-mega':       'lucarionite',
  'abomasnow-mega':     'abomasite',
  'gallade-mega':       'galladite',
  'audino-mega':        'audinite',
  'diancie-mega':       'diancite',
  'sceptile-mega':      'sceptilite',
  'swampert-mega':      'swampertite',
};

// pokemon that can only be reached by evolving a regional form — exclude from the base evo chain
const REGIONAL_ONLY_EVO_TARGETS = new Set([
  'obstagoon', 'perrserker', 'runerigus', 'cursola', 'sirfetchd',
  'mr-rime', 'sneasler', 'overqwil', 'clodsire',
]);

// single pokemon by id
export function getPokemonById(id) {
  const pokemon = ALL.find(p => p.id === Number(id));
  if (!pokemon) return Promise.reject(new Error('not found'));
  const evolutions = (pokemon.evolutions || [])
    .filter(s => !REGIONAL_ONLY_EVO_TARGETS.has(s.to))
    .flatMap(s => BRANCHING_EVO_OVERRIDES[`${s.from}->${s.to}`] || [s]);

  // synthesize mega steps for every pokemon in the chain (including the current one)
  const byName = Object.fromEntries(ALL.map(p => [p.name, p]));
  const inChain = new Set([pokemon.name, ...evolutions.map(s => s.from), ...evolutions.map(s => s.to)]);
  const megaSteps = [];
  for (const name of inChain) {
    const p = byName[name];
    if (!p?.mega_forms?.length) continue;
    for (const megaForm of p.mega_forms) {
      megaSteps.push({
        from: name,
        to: megaForm,
        trigger: 'mega-evolution',
        item: MEGA_STONE[megaForm] || null,
        isMega: true,
      });
    }
  }

  return Promise.resolve({ ...pokemon, evolutions: [...evolutions, ...megaSteps], regionalEvolutions: buildRegionalEvolutions(pokemon) });
}

// multiple pokemon by id array for compare
export function comparePokemon(ids = []) {
  return Promise.resolve(ids.map(id => ALL.find(p => p.id === id)).filter(Boolean));
}

// all distinct types sorted
export function getTypes() {
  return Promise.resolve([...new Set(ALL.flatMap(p => p.types))].sort());
}
