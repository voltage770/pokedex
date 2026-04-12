import { Link, useLocation } from 'react-router-dom';
import { formatName, formatFormName } from '../utils/formatName';

// single card in the grid — links to detail page
export default function PokemonCard({ pokemon }) {
  const location = useLocation();
  const padId = String(pokemon.id).padStart(3, '0');
  const types = Array.isArray(pokemon.types) ? pokemon.types : [];
  const image = pokemon.artwork_url || pokemon.sprite_url;

  const linkTo = pokemon.form
    ? `/pokemon/${pokemon.id}?form=${pokemon.form}`
    : `/pokemon/${pokemon.id}`;

  return (
    <div className="pokemon-card">
      <Link to={linkTo} state={{ from: location.pathname + location.search }} className="card-link">
        <div className="card-header">
          <span className="pokemon-id">#{padId}</span>
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
