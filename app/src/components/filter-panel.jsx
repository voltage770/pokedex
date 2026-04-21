import { useTypes } from '../hooks/use-pokemon';

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const CLASSES = [
  { value: 'legendary',        label: 'legendary' },
  { value: 'mythical',         label: 'mythical' },
  { value: 'ultra-beast',      label: 'ultra beast' },
  { value: 'paradox',          label: 'paradox' },
  { value: 'pseudo-legendary', label: 'pseudo-legendary' },
  { value: 'baby',             label: 'baby' },
  { value: 'has-mega',         label: 'mega evolution' },
  { value: 'has-gmax',         label: 'gigantamax' },
  { value: 'has-regional',     label: 'regional variant' },
  { value: 'regional-alola',   label: 'alolan form' },
  { value: 'regional-galar',   label: 'galarian form' },
  { value: 'regional-hisui',   label: 'hisuian form' },
  { value: 'regional-paldea',  label: 'paldean form' },
  { value: 'has-forms',        label: 'has alternate forms' },
];
const SORT_OPTIONS = [
  { value: 'id',               label: 'sort: number' },
  { value: 'name',             label: 'sort: name' },
  { value: 'total',            label: 'sort: total stats' },
  { value: 'hp',               label: 'sort: hp' },
  { value: 'attack',           label: 'sort: attack' },
  { value: 'defense',          label: 'sort: defense' },
  { value: 'special-attack',   label: 'sort: sp. atk' },
  { value: 'special-defense',  label: 'sort: sp. def' },
  { value: 'speed',            label: 'sort: speed' },
];

const OPTIONAL_FILTER_RENDERERS = {
  type: ({ filters, update, types }) => (
    <select key="type" value={filters.type || ''} onChange={e => update('type', e.target.value)}>
      <option value="">all types</option>
      {types.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  ),
  class: ({ filters, update }) => (
    <select key="class" value={filters.cls || ''} onChange={e => update('cls', e.target.value)}>
      <option value="">all categories</option>
      {CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
    </select>
  ),
  minStat: ({ filters, update }) => (
    <div key="minStat" className="filter-panel__min-stat">
      <select value={filters.stat || ''} onChange={e => update('stat', e.target.value)}>
        <option value="">min stat…</option>
        {STATS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {filters.stat && (
        <input
          type="number"
          min={0}
          max={255}
          placeholder="≥"
          value={filters.minStat || ''}
          onChange={e => update('minStat', e.target.value)}
          className="stat-input"
        />
      )}
    </div>
  ),
};

const FILTER_OPTIONS = [
  { key: 'type',    label: 'type' },
  { key: 'class',   label: 'category' },
  { key: 'minStat', label: 'min stat' },
];

export default function FilterPanel({ filters, onChange, enabledFilters = {}, filterOrder = ['type', 'class', 'minStat'], toggleFilter, shiny, onShinyToggle }) {
  const types = useTypes();

  const update = (key, value) => onChange({ ...filters, [key]: value || undefined });
  const sort    = filters.sort    || 'id';
  const sortDir = filters.sortDir || 'asc';
  const ctx     = { filters, update, types };

  return (
    <aside className="filter-panel">
      <select value={filters.generation || ''} onChange={e => update('generation', e.target.value)}>
        <option value="">all generations</option>
        {GENERATIONS.map(g => <option key={g} value={g}>gen {g}</option>)}
      </select>

      {filterOrder.map(key => enabledFilters[key] && OPTIONAL_FILTER_RENDERERS[key]?.(ctx))}

      <select value={sort} onChange={e => onChange({ ...filters, sort: e.target.value })}>
        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <div className="sort-options-strip">
        <button
          className={sortDir === 'asc' ? 'active' : ''}
          onClick={() => onChange({ ...filters, sortDir: 'asc' })}
        >
          ↑
        </button>
        <button
          className={sortDir === 'desc' ? 'active' : ''}
          onClick={() => onChange({ ...filters, sortDir: 'desc' })}
        >
          ↓
        </button>
        <button
          className={shiny ? 'active' : ''}
          onClick={onShinyToggle}
        >
          shiny
        </button>
      </div>

      {toggleFilter && (
        <>
          <hr className="filter-divider" />
          <div className="filter-toggles">
            {FILTER_OPTIONS.map(f => (
              <label key={f.key} className="filter-toggle-row">
                <input
                  type="checkbox"
                  checked={!!enabledFilters[f.key]}
                  onChange={() => {
                    if (enabledFilters[f.key]) {
                      const clear = { ...filters };
                      if (f.key === 'type') delete clear.type;
                      if (f.key === 'class') delete clear.cls;
                      if (f.key === 'minStat') { delete clear.stat; delete clear.minStat; }
                      onChange(clear);
                    }
                    toggleFilter(f.key);
                  }}
                />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <hr className="filter-divider" />
      <button className="reset-btn" onClick={() => {
        onChange({});
        if (toggleFilter) {
          FILTER_OPTIONS.forEach(f => {
            if (enabledFilters[f.key]) toggleFilter(f.key);
          });
        }
        if (shiny) onShinyToggle();
      }}>reset</button>
    </aside>
  );
}
