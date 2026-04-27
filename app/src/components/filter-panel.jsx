import { useTypes } from '../hooks/use-pokemon';

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
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

export default function FilterPanel({ filters, onChange, shiny, onShinyToggle, inlineForms = '', onInlineFormsChange }) {
  const types = useTypes();

  const update = (key, value) => onChange({ ...filters, [key]: value || undefined });
  const sort    = filters.sort    || 'id';
  const sortDir = filters.sortDir || 'asc';

  return (
    <aside className="filter-panel">
      <select value={filters.generation || ''} onChange={e => update('generation', e.target.value)}>
        <option value="">all generations</option>
        {GENERATIONS.map(g => <option key={g} value={g}>gen {g}</option>)}
      </select>

      <select value={filters.type || ''} onChange={e => update('type', e.target.value)}>
        <option value="">all types</option>
        {types.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <select value={filters.cls || ''} onChange={e => update('cls', e.target.value)}>
        <option value="">all categories</option>
        {CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>

      <select value={sort} onChange={e => onChange({ ...filters, sort: e.target.value })}>
        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* zero-height row break — only renders on mobile (CSS) where the
          filter-panel is a flex-wrap row. forces sort-strip + reset onto
          their own line so the action buttons always have proper space
          regardless of how the selects above wrapped. */}
      <span className="filter-panel__break" aria-hidden="true" />

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

      <button className="reset-btn" onClick={() => {
        onChange({});
        if (shiny) onShinyToggle();
        if (inlineForms && onInlineFormsChange) onInlineFormsChange('');
      }}>reset</button>

      {onInlineFormsChange && (
        <div className="filter-toggles">
          <label className="filter-toggle-row">
            <input
              type="checkbox"
              checked={inlineForms === 'regional'}
              onChange={e => onInlineFormsChange(e.target.checked ? 'regional' : '')}
            />
            <span>show variants inline</span>
          </label>
          <label className="filter-toggle-row">
            <input
              type="checkbox"
              checked={inlineForms === 'all'}
              onChange={e => onInlineFormsChange(e.target.checked ? 'all' : '')}
            />
            <span>show forms inline</span>
          </label>
        </div>
      )}
    </aside>
  );
}
