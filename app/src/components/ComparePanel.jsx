import { useCompare } from '../hooks/usePokemon';
import { Link } from 'react-router-dom';

const STAT_LABELS = {
  hp:               'HP',
  attack:           'Atk',
  defense:          'Def',
  'special-attack': 'SpA',
  'special-defense':'SpD',
  speed:            'Spd',
};

// side-by-side stat comparison panel, shown when pokemon are selected for compare
export default function ComparePanel({ selectedIds, onRemove }) {
  const { pokemon, loading } = useCompare(selectedIds);

  if (!selectedIds.length) return null;

  return (
    <div className="compare-panel">
      <h2>compare ({selectedIds.length}/3)</h2>
      {loading && <p className="loading">loading...</p>}
      {!loading && (
        <div className="compare-grid">
          {pokemon.map(p => (
            <div key={p.id} className="compare-col">
              <button className="remove-btn" onClick={() => onRemove(p.id)}>✕</button>
              <Link to={`/pokemon/${p.id}`}>
                <img src={p.artwork_url || p.sprite_url} alt={p.name} />
                <strong>{p.name}</strong>
              </Link>
              {(p.stats || []).map(s => (
                <div key={s.stat_name} className="compare-stat">
                  <span>{STAT_LABELS[s.stat_name] || s.stat_name}</span>
                  <div className="stat-bar-wrap">
                    <div
                      className="stat-bar"
                      style={{ width: `${Math.round((s.base_value / 255) * 100)}%` }}
                    />
                    <span>{s.base_value}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
