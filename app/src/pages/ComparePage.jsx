import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompare } from '../hooks/usePokemon';
import { getPokemon } from '../utils/api';
import { formatName } from '../utils/formatName';

const STAT_LABELS = {
  hp:               'HP',
  attack:           'Atk',
  defense:          'Def',
  'special-attack': 'SpA',
  'special-defense':'SpD',
  speed:            'Spd',
};

export default function ComparePage() {
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);

  const { pokemon, loading } = useCompare(selectedIds);

  const handleSearch = async (e) => {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) { setResults([]); return; }
    const data = await getPokemon({ search: val, limit: 8 });
    setResults(data);
  };

  const add = (p) => {
    if (selectedIds.includes(p.id) || selectedIds.length >= 3) return;
    setSelectedIds(prev => [...prev, p.id]);
    setQuery('');
    setResults([]);
  };

  const remove = (id) => setSelectedIds(prev => prev.filter(i => i !== id));

  const maxStat = (statName) =>
    Math.max(...pokemon.map(p => (p.stats?.find(s => s.stat_name === statName)?.base_value ?? 0)));

  return (
    <div className="compare-page">
      <div className="compare-page-header">
        <h1>compare</h1>
        <p className="compare-subhead">pick up to 3 pokémon to compare side by side</p>
      </div>

      {selectedIds.length < 3 && (
        <div className="compare-search-wrap">
          <div className="compare-search-inner">
            <input
              className="search-input"
              type="text"
              placeholder="search pokémon to add..."
              value={query}
              onChange={handleSearch}
              onKeyDown={e => { if (e.key === 'Enter' && results.length > 0) add(results[0]); }}
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul className="compare-results">
                {results.map(p => (
                  <li key={p.id}>
                    <button onClick={() => add(p)} disabled={selectedIds.includes(p.id)}>
                      <img src={p.sprite_url} alt={p.name} />
                      <span>{formatName(p.name)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {selectedIds.length === 0 && (
        <p className="empty">search for a pokémon above to get started.</p>
      )}

      {loading && <p className="loading">loading...</p>}

      {!loading && pokemon.length > 0 && (
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                {pokemon.map(p => (
                  <th key={p.id}>
                    <div className="compare-th-inner">
                      <button className="compare-remove-btn" onClick={() => remove(p.id)}>✕</button>
                      <Link to={`/pokemon/${p.id}`}>
                        <img src={p.artwork_url || p.sprite_url} alt={p.name} />
                        <span>{formatName(p.name)}</span>
                      </Link>
                      <div className="compare-types">
                        {(p.types || []).map(t => (
                          <span key={t} className={`type-badge type-${t}`}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(STAT_LABELS).map(([key, label]) => {
                const best = maxStat(key);
                return (
                  <tr key={key}>
                    <td className="compare-stat-label">{label}</td>
                    {pokemon.map(p => {
                      const val = p.stats?.find(s => s.stat_name === key)?.base_value ?? 0;
                      return (
                        <td key={p.id} className={`compare-stat-cell${val === best && pokemon.length > 1 ? ' best' : ''}`}>
                          <div className="compare-bar-wrap">
                            <div className="compare-bar" style={{ width: `${Math.round((val / 255) * 100)}%` }} />
                            <span>{val}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="compare-total-row">
                <td className="compare-stat-label">total</td>
                {pokemon.map(p => {
                  const total = p.stats?.reduce((sum, s) => sum + s.base_value, 0) ?? 0;
                  const bestTotal = Math.max(...pokemon.map(q => q.stats?.reduce((sum, s) => sum + s.base_value, 0) ?? 0));
                  return (
                    <td key={p.id} className={`compare-stat-cell${total === bestTotal && pokemon.length > 1 ? ' best' : ''}`}>
                      <strong>{total}</strong>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
