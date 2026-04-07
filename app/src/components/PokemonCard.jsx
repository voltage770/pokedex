import { Link } from 'react-router-dom';
import { formatName } from '../utils/formatName';

// single card in the grid — links to detail page
export default function PokemonCard({ pokemon }) {
  const padId = String(pokemon.id).padStart(3, '0');
  const types = Array.isArray(pokemon.types) ? pokemon.types : [];
  const image = pokemon.artwork_url || pokemon.sprite_url;

  return (
    <div className="pokemon-card">
      <Link to={`/pokemon/${pokemon.id}`} className="card-link">
        <div className="card-header">
          <span className="pokemon-id">#{padId}</span>
          <span className="gen-badge">gen {pokemon.generation}</span>
        </div>
        <img src={image} alt={pokemon.name} className="pokemon-sprite" loading="lazy" />
        <h3 className="pokemon-name">{formatName(pokemon.name)}</h3>
        <div className="pokemon-types">
          {types.map(t => (
            <span key={t} className={`type-badge type-${t}`}>{t}</span>
          ))}
        </div>
      </Link>
    </div>
  );
}
