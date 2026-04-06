import { useTypes } from '../hooks/usePokemon';

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const SORT_OPTIONS = [
  { value: 'id',      label: 'number' },
  { value: 'name',    label: 'name' },
  { value: 'total',   label: 'total stats' },
  { value: 'hp',              label: 'hp' },
  { value: 'attack',          label: 'attack' },
  { value: 'defense',         label: 'defense' },
  { value: 'special-attack',  label: 'sp. atk' },
  { value: 'special-defense', label: 'sp. def' },
  { value: 'speed',           label: 'speed' },
];

// sidebar filters and sort controls for the home page grid
export default function FilterPanel({ filters, onChange }) {
  const types = useTypes();

  const update = (key, value) => onChange({ ...filters, [key]: value || undefined });
  const sort    = filters.sort    || 'id';
  const sortDir = filters.sortDir || 'asc';

  return (
    <aside className="filter-panel">
      <h2>filter</h2>

      <div>
        <label>type</label>
        <select value={filters.type || ''} onChange={e => update('type', e.target.value)}>
          <option value="">all types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label>generation</label>
        <select value={filters.generation || ''} onChange={e => update('generation', e.target.value)}>
          <option value="">all gens</option>
          {GENERATIONS.map(g => <option key={g} value={g}>gen {g}</option>)}
        </select>
      </div>

      <div>
        <label>min stat</label>
        <select value={filters.stat || ''} onChange={e => update('stat', e.target.value)}>
          <option value="">pick a stat</option>
          {STATS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {filters.stat && (
          <input
            type="number"
            min={0}
            max={255}
            placeholder="min value"
            value={filters.minStat || ''}
            onChange={e => update('minStat', e.target.value)}
            className="stat-input"
          />
        )}
      </div>

      <hr className="filter-divider" />
      <h2>sort</h2>

      <div>
        <label>sort by</label>
        <select value={sort} onChange={e => onChange({ ...filters, sort: e.target.value })}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <label>direction</label>
        <div className="sort-dir-toggle">
          <button
            className={sortDir === 'asc' ? 'active' : ''}
            onClick={() => onChange({ ...filters, sortDir: 'asc' })}
          >
            asc
          </button>
          <button
            className={sortDir === 'desc' ? 'active' : ''}
            onClick={() => onChange({ ...filters, sortDir: 'desc' })}
          >
            desc
          </button>
        </div>
      </div>

      <button className="reset-btn" onClick={() => onChange({})}>reset</button>
    </aside>
  );
}
