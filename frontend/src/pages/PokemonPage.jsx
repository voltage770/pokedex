import { useParams, Link } from 'react-router-dom';
import { usePokemonDetail } from '../hooks/usePokemon';

const STAT_LABELS = {
  hp: 'HP', attack: 'Attack', defense: 'Defense',
  'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', speed: 'Speed',
};

function StatRow({ stat }) {
  const pct = Math.round((stat.base_value / 255) * 100);
  return (
    <div className="stat-row">
      <span className="stat-label">{STAT_LABELS[stat.stat_name] || stat.stat_name}</span>
      <span className="stat-value">{stat.base_value}</span>
      <div className="stat-track">
        <div className="stat-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PokemonPage() {
  const { id } = useParams();
  const { pokemon, loading, error } = usePokemonDetail(id);

  if (loading) return <div className="page-center">Loading...</div>;
  if (error)   return <div className="page-center error">Error: {error}</div>;
  if (!pokemon) return null;

  const padId = String(pokemon.id).padStart(3, '0');

  return (
    <div className="detail-page">
      <Link to="/" className="back-link">← Back</Link>

      <div className="detail-card">
        <div className="detail-left">
          <span className="detail-id">#{padId}</span>
          <img src={pokemon.sprite_url} alt={pokemon.name} className="detail-sprite" />
          {pokemon.sprite_shiny && (
            <img src={pokemon.sprite_shiny} alt={`${pokemon.name} shiny`} className="detail-sprite shiny" />
          )}
        </div>

        <div className="detail-right">
          <h1>{pokemon.name}</h1>
          <p className="detail-meta">Gen {pokemon.generation} · {pokemon.height / 10}m · {pokemon.weight / 10}kg</p>

          <div className="detail-types">
            {(pokemon.types || []).map(t => (
              <span key={t.type_name || t} className="type-badge">{t.type_name || t}</span>
            ))}
          </div>

          <section>
            <h2>Base Stats</h2>
            {(pokemon.stats || []).map(s => <StatRow key={s.stat_name} stat={s} />)}
          </section>

          <section>
            <h2>Abilities</h2>
            <ul className="abilities-list">
              {(pokemon.abilities || []).map(a => (
                <li key={a.ability_name}>
                  {a.ability_name} {a.is_hidden ? <em>(hidden)</em> : ''}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="detail-nav">
        {pokemon.id > 1 && (
          <Link to={`/pokemon/${pokemon.id - 1}`}>← #{String(pokemon.id - 1).padStart(3, '0')}</Link>
        )}
        <Link to={`/pokemon/${pokemon.id + 1}`}>#{String(pokemon.id + 1).padStart(3, '0')} →</Link>
      </div>
    </div>
  );
}
