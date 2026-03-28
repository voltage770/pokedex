import { useCompare } from '../hooks/usePokemon';
import { Link } from 'react-router-dom';

const STAT_LABELS = {
  hp: 'HP', attack: 'Atk', defense: 'Def',
  'special-attack': 'Sp.Atk', 'special-defense': 'Sp.Def', speed: 'Spd',
};

function StatBar({ value }) {
  const pct = Math.round((value / 255) * 100);
  return (
    <div className="stat-bar-wrap">
      <div className="stat-bar" style={{ width: `${pct}%` }} />
      <span>{value}</span>
    </div>
  );
}

export default function ComparePanel({ selectedIds, onRemove }) {
  const { pokemon, loading } = useCompare(selectedIds);

  if (!selectedIds.length) return null;

  return (
    <div className="compare-panel">
      <h2>Compare ({selectedIds.length}/3)</h2>
      {loading && <p>Loading...</p>}
      {!loading && (
        <div className="compare-grid">
          {pokemon.map(p => (
            <div key={p.id} className="compare-col">
              <button className="remove-btn" onClick={() => onRemove(p.id)}>✕</button>
              <Link to={`/pokemon/${p.id}`}>
                <img src={p.sprite_url} alt={p.name} />
                <strong>{p.name}</strong>
              </Link>
              {(p.stats || []).map(s => (
                <div key={s.stat_name} className="compare-stat">
                  <span>{STAT_LABELS[s.stat_name] || s.stat_name}</span>
                  <StatBar value={s.base_value} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
