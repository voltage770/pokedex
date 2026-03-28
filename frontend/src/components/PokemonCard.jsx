import { Link } from 'react-router-dom';

const TYPE_COLORS = {
  fire: '#F08030',    water: '#6890F0',   grass: '#78C850',
  electric: '#F8D030', psychic: '#F85888', ice: '#98D8D8',
  dragon: '#7038F8',  dark: '#705848',    fairy: '#EE99AC',
  normal: '#A8A878',  fighting: '#C03028', flying: '#A890F0',
  poison: '#A040A0',  ground: '#E0C068',  rock: '#B8A038',
  bug: '#A8B820',     ghost: '#705898',   steel: '#B8B8D0',
};

export default function PokemonCard({ pokemon, onCompareToggle, isCompared }) {
  const padId = String(pokemon.id).padStart(3, '0');
  const types = Array.isArray(pokemon.types) ? pokemon.types : [];

  return (
    <div className="pokemon-card">
      <Link to={`/pokemon/${pokemon.id}`} className="card-link">
        <span className="pokemon-id">#{padId}</span>
        <img
          src={pokemon.sprite_url}
          alt={pokemon.name}
          className="pokemon-sprite"
          loading="lazy"
        />
        <h3 className="pokemon-name">{pokemon.name}</h3>
        <div className="pokemon-types">
          {types.map(t => (
            <span
              key={t}
              className="type-badge"
              style={{ background: TYPE_COLORS[t] || '#aaa' }}
            >
              {t}
            </span>
          ))}
        </div>
      </Link>

      {onCompareToggle && (
        <button
          className={`compare-btn ${isCompared ? 'active' : ''}`}
          onClick={() => onCompareToggle(pokemon)}
        >
          {isCompared ? '✓ Comparing' : '+ Compare'}
        </button>
      )}
    </div>
  );
}
