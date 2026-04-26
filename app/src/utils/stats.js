// stat label maps used across the detail, compare, and panel views.
// kept separate by format because each surface has different space constraints —
// full labels on the spacious detail page, short labels in the compact compare grid,
// and a mixed set for the inline ev-yield line on detail.

export const STAT_LABELS_FULL = {
  hp:               'HP',
  attack:           'Attack',
  defense:          'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense':'Sp. Def',
  speed:            'Speed',
};

export const STAT_LABELS_SHORT = {
  hp:               'HP',
  attack:           'Atk',
  defense:          'Def',
  'special-attack': 'SpA',
  'special-defense':'SpD',
  speed:            'Spd',
};

export const EV_STAT_LABELS = {
  hp:               'HP',
  attack:           'Atk',
  defense:          'Def',
  'special-attack': 'Sp. Atk',
  'special-defense':'Sp. Def',
  speed:            'Speed',
};
