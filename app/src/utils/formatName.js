// names that can't be derived by simple slug→title-case conversion
const OVERRIDES = {
  'mr-mime':   'Mr. Mime',
  'mr-rime':   'Mr. Rime',
  'mime-jr':   'Mime Jr.',
  'type-null': 'Type: Null',
  'ho-oh':     'Ho-Oh',
  'porygon-z': 'Porygon-Z',
  'jangmo-o':  'Jangmo-o',
  'hakamo-o':  'Hakamo-o',
  'kommo-o':   'Kommo-o',
  'chi-yu':    'Chi-Yu',
  'chien-pao': 'Chien-Pao',
  'ting-lu':   'Ting-Lu',
  'wo-chien':  'Wo-Chien',
  'nidoran-f': 'Nidoran\u2640',
  'nidoran-m': 'Nidoran\u2642',
};

// single-word base names that appear in the data with a form suffix appended
// e.g. "basculin-red-striped", "aegislash-shield" — the suffix is stripped for display
const FORM_BASE_NAMES = new Set([
  'aegislash', 'basculegion', 'basculin', 'darmanitan', 'deoxys',
  'dudunsparce', 'eiscue', 'enamorus', 'frillish', 'giratina',
  'gourgeist', 'indeedee', 'jellicent', 'keldeo', 'landorus',
  'lycanroc', 'maushold', 'meloetta', 'meowstic', 'mimikyu',
  'minior', 'morpeko', 'oinkologne', 'oricorio', 'palafin',
  'pumpkaboo', 'pyroar', 'squawkabilly', 'tatsugiri', 'thundurus',
  'tornadus', 'toxtricity', 'urshifu', 'wishiwashi', 'wormadam',
  'zygarde',
]);

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
