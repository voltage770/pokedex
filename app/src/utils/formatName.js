// names that can't be derived by simple slug→title-case conversion
const OVERRIDES = {
  'mr-mime':    'Mr. Mime',
  'mr-rime':    'Mr. Rime',
  'mime-jr':    'Mime Jr.',
  'type-null':  'Type: Null',
  'ho-oh':      'Ho-Oh',
  'porygon-z':  'Porygon-Z',
  'jangmo-o':   'Jangmo-o',
  'hakamo-o':   'Hakamo-o',
  'kommo-o':    'Kommo-o',
  'chi-yu':     'Chi-Yu',
  'chien-pao':  'Chien-Pao',
  'ting-lu':    'Ting-Lu',
  'wo-chien':   'Wo-Chien',
  'nidoran-f':  'Nidoran\u2640',
  'nidoran-m':  'Nidoran\u2642',
  'farfetchd':          "Farfetch'd",
  'sirfetchd':          "Sirfetch'd",
  'darmanitan-zen':     'Darmanitan Zen Mode',
  'darmanitan-galar-zen': 'Galarian Darmanitan Zen Mode',
};

// single-word base names that appear in the data with a form suffix appended
// e.g. "basculin-red-striped", "aegislash-shield" — the suffix is stripped for display
const FORM_BASE_NAMES = new Set([
  'aegislash', 'basculegion', 'basculin', 'castform', 'cherrim',
  'darmanitan', 'deoxys', 'dudunsparce', 'eiscue', 'enamorus',
  'frillish', 'giratina', 'gourgeist', 'indeedee', 'jellicent',
  'keldeo', 'landorus', 'lycanroc', 'maushold', 'meloetta',
  'meowstic', 'mimikyu', 'minior', 'morpeko', 'oinkologne',
  'oricorio', 'palafin', 'pumpkaboo', 'pyroar', 'rotom',
  'shaymin', 'squawkabilly', 'tatsugiri', 'thundurus', 'tornadus',
  'toxtricity', 'urshifu', 'wishiwashi', 'wormadam', 'zygarde',
]);

const REGION_ADJECTIVE = { alola: 'Alolan', galar: 'Galarian', hisui: 'Hisuian', paldea: 'Paldean' };

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// species name only — strips form suffix (e.g. "basculin-red-striped" → "Basculin")
export function formatName(slug) {
  if (!slug) return '';
  const lower = slug.toLowerCase();
  if (OVERRIDES[lower]) return OVERRIDES[lower];
  const [base, ...rest] = lower.split('-');
  if (rest.length && FORM_BASE_NAMES.has(base)) return titleCase(base);
  return lower.split('-').map(titleCase).join(' ');
}

// full name including form — use this when displaying form details
export function formatNameFull(slug) {
  if (!slug) return '';
  const lower = slug.toLowerCase();
  if (OVERRIDES[lower]) return OVERRIDES[lower];
  return lower.split('-').map(titleCase).join(' ');
}

// resolves the display name for a named form:
//   mega:              "charizard-mega-x"        → "Mega Charizard X"
//   gmax:              "pikachu-gmax"             → "GMAX Pikachu"
//                      "toxtricity-amped-gmax"    → "GMAX Amped Toxtricity"
//   regional:          "meowth-alola"             → "Alolan Meowth"
//   regional + variant:"darmanitan-galar-zen"     → "Galarian Darmanitan Zen"
//   alt:               "rotom-heat"               → "Rotom Heat"
//                      "darmanitan-zen"           → "Darmanitan Zen"
export function formatFormName(slug) {
  if (!slug) return '';
  const lower = slug.toLowerCase();
  if (OVERRIDES[lower]) return OVERRIDES[lower];
  const parts = lower.split('-');

  // mega: any segment equals 'mega'
  const megaIdx = parts.indexOf('mega');
  if (megaIdx !== -1) {
    const baseSlug = parts.slice(0, megaIdx).join('-');
    const baseName = OVERRIDES[baseSlug] || parts.slice(0, megaIdx).map(titleCase).join(' ');
    const variant  = parts.slice(megaIdx + 1).map(p => p.toUpperCase()).join(' ');
    return ['Mega', baseName, variant].filter(Boolean).join(' ');
  }

  // gmax: last segment is 'gmax' → "GMAX {variant} {base}"
  if (parts[parts.length - 1] === 'gmax') {
    const body = parts.slice(0, -1);
    let splitAt = body.length;
    for (let i = 1; i < body.length; i++) {
      if (FORM_BASE_NAMES.has(body.slice(0, i).join('-'))) { splitAt = i; break; }
    }
    const baseSlug = body.slice(0, splitAt).join('-');
    const baseName = OVERRIDES[baseSlug] || body.slice(0, splitAt).map(titleCase).join(' ');
    const variant  = body.slice(splitAt).map(titleCase).join(' ');
    return ['GMAX', variant, baseName].filter(Boolean).join(' ');
  }

  // regional: find a region word anywhere in the parts (handles both
  // "meowth-alola" and "darmanitan-galar-zen")
  for (let ri = 1; ri < parts.length; ri++) {
    if (REGION_ADJECTIVE[parts[ri]]) {
      const baseSlug = parts.slice(0, ri).join('-');
      const baseName = OVERRIDES[baseSlug] || parts.slice(0, ri).map(titleCase).join(' ');
      // strip 'standard' — it's just a placeholder for the default regional form
      const variantParts = parts.slice(ri + 1).filter(p => p !== 'standard');
      const variant = variantParts.map(titleCase).join(' ');
      return [REGION_ADJECTIVE[parts[ri]], baseName, variant].filter(Boolean).join(' ');
    }
  }

  // alt form: "{base} {variant}" — base first, variant after
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(0, i).join('-');
    if (FORM_BASE_NAMES.has(candidate) || OVERRIDES[candidate]) {
      const baseName = OVERRIDES[candidate] || parts.slice(0, i).map(titleCase).join(' ');
      const variant  = parts.slice(i).map(titleCase).join(' ');
      return [baseName, variant].filter(Boolean).join(' ');
    }
  }

  return formatName(slug);
}
