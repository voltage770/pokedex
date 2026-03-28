import { useTypes } from '../hooks/usePokemon';

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

export default function FilterPanel({ filters, onChange }) {
  const types = useTypes();

  const update = (key, value) => onChange({ ...filters, [key]: value || undefined });

  return (
    <aside className="filter-panel">
      <h2>Filter</h2>

      <label>Type</label>
      <select value={filters.type || ''} onChange={e => update('type', e.target.value)}>
        <option value="">All types</option>
        {types.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <label>Generation</label>
      <select value={filters.generation || ''} onChange={e => update('generation', e.target.value)}>
        <option value="">All gens</option>
        {GENERATIONS.map(g => <option key={g} value={g}>Gen {g}</option>)}
      </select>

      <label>Min stat</label>
      <select value={filters.stat || ''} onChange={e => update('stat', e.target.value)}>
        <option value="">Pick a stat</option>
        {STATS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {filters.stat && (
        <input
          type="number"
          min={0}
          max={255}
          placeholder="Min value"
          value={filters.minStat || ''}
          onChange={e => update('minStat', e.target.value)}
          className="stat-input"
        />
      )}

      <button className="reset-btn" onClick={() => onChange({})}>Reset</button>
    </aside>
  );
}
