import ALL from '../data/pokemon.json';

// name → id lookup for evo chain sprite resolution
export const NAME_TO_ID = Object.fromEntries(ALL.map(p => [p.name, p.id]));

// slim shape returned by the list — detail/compare get the full object
function slim(p) {
  return {
    id:           p.id,
    name:         p.name,
    generation:   p.generation,
    sprite_url:   p.sprite_url,
    sprite_shiny: p.sprite_shiny,
    artwork_url:  p.artwork_url,
    types:        p.types,
    stats:        p.stats,
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
    case 'regional-alola':   return p.regional_forms?.some(n => n.includes('-alola'));
    case 'regional-galar':   return p.regional_forms?.some(n => n.includes('-galar'));
    case 'regional-hisui':   return p.regional_forms?.some(n => n.includes('-hisui'));
    case 'regional-paldea':  return p.regional_forms?.some(n => n.includes('-paldea'));
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
    results.slice(Number(offset), Number(offset) + Number(limit)).map(slim)
  );
}

// single pokemon by id
export function getPokemonById(id) {
  const pokemon = ALL.find(p => p.id === Number(id));
  return pokemon
    ? Promise.resolve(pokemon)
    : Promise.reject(new Error('not found'));
}

// multiple pokemon by id array for compare
export function comparePokemon(ids = []) {
  return Promise.resolve(ids.map(id => ALL.find(p => p.id === id)).filter(Boolean));
}

// all distinct types sorted
export function getTypes() {
  return Promise.resolve([...new Set(ALL.flatMap(p => p.types))].sort());
}
