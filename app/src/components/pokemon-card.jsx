import { Link, useLocation } from 'react-router-dom';
import { formatName, formatFormName } from '../utils/format-name';

// single card in the grid — links to detail page
const STAT_SORTS = new Set(['total', 'hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']);

function getStatValue(stats, sort) {
  if (!stats || !STAT_SORTS.has(sort)) return null;
  if (sort === 'total') return stats.reduce((sum, s) => sum + s.base_value, 0);
  return stats.find(s => s.stat_name === sort)?.base_value ?? null;
}

export default function PokemonCard({ pokemon, shiny, sort }) {
  const location = useLocation();
  const padId = String(pokemon.id).padStart(3, '0');
  const types = Array.isArray(pokemon.types) ? pokemon.types : [];
  const image = shiny
    ? (pokemon.artwork_shiny || pokemon.sprite_shiny || pokemon.artwork_url || pokemon.sprite_url)
    : (pokemon.artwork_url || pokemon.sprite_url);
  const statValue = getStatValue(pokemon.stats, sort);

  const linkTo = pokemon.form
    ? `/pokemon/${pokemon.id}?form=${pokemon.form}`
    : `/pokemon/${pokemon.id}`;

  return (
    <div className="pokemon-card">
      <Link to={linkTo} state={{ from: location.pathname + location.search }} className="card-link">
        <div className="card-header">
          <span className="pokemon-id">#{padId}</span>
          {statValue !== null && <span className="pokemon-stat-badge">{statValue}</span>}
        </div>
        <img src={image} alt={pokemon.name} className="pokemon-sprite" loading="lazy" />
        <h3 className="pokemon-name">{pokemon.form ? formatFormName(pokemon.form) : formatName(pokemon.name)}</h3>
        <div className="pokemon-types">
          {types.map(t => (
            <span key={t} className={`type-badge type-${t}`}>{t}</span>
          ))}
        </div>
      </Link>
    </div>
  );
}
