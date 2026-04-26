const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

// effectiveness[attacker][defender] = multiplier
const E = {};
for (const a of TYPES) {
  E[a] = {};
  for (const d of TYPES) E[a][d] = 1;
}

function se(atk, ...defs)  { for (const d of defs) E[atk][d] = 2;   }
function nve(atk, ...defs) { for (const d of defs) E[atk][d] = 0.5; }
function imm(atk, ...defs) { for (const d of defs) E[atk][d] = 0;   }

se('fire',     'grass', 'ice', 'bug', 'steel');
nve('fire',    'fire', 'water', 'rock', 'dragon');

se('water',    'fire', 'ground', 'rock');
nve('water',   'water', 'grass', 'dragon');

se('electric', 'water', 'flying');
nve('electric','electric', 'grass', 'dragon');
imm('electric','ground');

se('grass',    'water', 'ground', 'rock');
nve('grass',   'fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel');

se('ice',      'grass', 'ground', 'flying', 'dragon');
nve('ice',     'fire', 'water', 'ice', 'steel');

se('fighting', 'normal', 'ice', 'rock', 'dark', 'steel');
nve('fighting','poison', 'flying', 'psychic', 'bug', 'fairy');
imm('fighting','ghost');

se('poison',   'grass', 'fairy');
nve('poison',  'poison', 'ground', 'rock', 'ghost');
imm('poison',  'steel');

se('ground',   'fire', 'electric', 'poison', 'rock', 'steel');
nve('ground',  'grass', 'bug');
imm('ground',  'flying');

se('flying',   'grass', 'fighting', 'bug');
nve('flying',  'electric', 'rock', 'steel');

se('psychic',  'fighting', 'poison');
nve('psychic', 'psychic', 'steel');
imm('psychic', 'dark');

se('bug',      'grass', 'psychic', 'dark');
nve('bug',     'fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy');

se('rock',     'fire', 'ice', 'flying', 'bug');
nve('rock',    'fighting', 'ground', 'steel');

se('ghost',    'psychic', 'ghost');
nve('ghost',   'dark');
imm('ghost',   'normal');

se('dragon',   'dragon');
nve('dragon',  'steel');
imm('dragon',  'fairy');

se('dark',     'psychic', 'ghost');
nve('dark',    'fighting', 'dark', 'fairy');

se('steel',    'ice', 'rock', 'fairy');
nve('steel',   'fire', 'water', 'electric', 'steel');

se('fairy',    'fighting', 'dragon', 'dark');
nve('fairy',   'fire', 'poison', 'steel');

nve('normal',  'rock', 'steel');
imm('normal',  'ghost');

// for a defending pokemon's type list, returns groups of attacking types
// keyed by the resulting damage multiplier. neutral (1×) is omitted —
// only deviations are actionable info on a detail page.
//   { '4': [...], '2': [...], '0.5': [...], '0.25': [...], '0': [...] }
function defensiveMatchups(defenderTypes) {
  const groups = {};
  for (const atk of TYPES) {
    let mult = 1;
    for (const def of defenderTypes) mult *= E[atk][def];
    if (mult === 1) continue;
    const key = String(mult);
    (groups[key] ||= []).push(atk);
  }
  return groups;
}

// rendering order: most damaging first → most defensive last. label is the
// human-readable multiplier glyph; consumer iterates and skips empty buckets.
const MATCHUP_ORDER = [
  { mult: 4,    label: '4×' },
  { mult: 2,    label: '2×' },
  { mult: 0.5,  label: '½'  },
  { mult: 0.25, label: '¼'  },
  { mult: 0,    label: '0'  },
];

export { TYPES, E as effectiveness, defensiveMatchups, MATCHUP_ORDER };
