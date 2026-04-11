import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePokemonList } from '../hooks/usePokemon';
import PokemonCard from '../components/PokemonCard';
import SearchBar from '../components/SearchBar';
import FilterPanel from '../components/FilterPanel';

const PAGE_SIZE = 60;
const FILTER_KEYS = ['search', 'type', 'generation', 'cls', 'stat', 'minStat', 'sort', 'sortDir'];

export default function HomePage({ enabledFilters = {}, filterOrder = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [visible, setVisible]           = useState(PAGE_SIZE);
  const navigate                        = useNavigate();

  // derive filters object from URL params
  const filters = Object.fromEntries(
    FILTER_KEYS.map(k => [k, searchParams.get(k) || undefined]).filter(([, v]) => v)
  );

  const setFilters = useCallback((newFilters) => {
    const params = {};
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params[k] = v;
    });
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const { pokemon, loading, error } = usePokemonList({ ...filters, limit: 9999 });

  // reset visible count whenever filters change
  useEffect(() => { setVisible(PAGE_SIZE); }, [searchParams.toString()]);

  const CONTENT_KEYS  = ['search', 'type', 'generation', 'cls', 'stat', 'minStat'];
  const hasFilters    = CONTENT_KEYS.some(k => filters[k]);
  const displayed     = hasFilters ? pokemon : pokemon.slice(0, visible);
  const hasMore       = !hasFilters && visible < pokemon.length;

  const handleSearch = useCallback((search) => {
    setFilters({ ...filters, search: search || undefined });
  }, [filters, setFilters]);

  return (
    <div className="home-layout">
      <FilterPanel filters={filters} onChange={setFilters} enabledFilters={enabledFilters} filterOrder={filterOrder} />

      <main className="home-main">
        <SearchBar
          value={filters.search || ''}
          onSearch={handleSearch}
          onEnter={() => { if (displayed.length > 0) navigate(`/pokemon/${displayed[0].id}`); }}
        />

        {error   && <p className="error">error: {error}</p>}
        {loading && <p className="loading">loading pokémon...</p>}

        <div className="pokemon-grid">
          {displayed.map(p => (
            <PokemonCard key={p.uid || p.id} pokemon={p} />
          ))}
        </div>

        {!loading && pokemon.length === 0 && (
          <p className="empty">no pokémon found. try adjusting your filters.</p>
        )}

        {!loading && hasMore && (
          <button className="load-more-btn" onClick={() => setVisible(v => v + PAGE_SIZE)}>
            show more
          </button>
        )}

        <footer className="home-footer">
          <p>
            pokémon data provided by <a href="https://pokeapi.co" target="_blank" rel="noreferrer">PokéAPI</a>.
            sprites and artwork © Nintendo / Game Freak / The Pokémon Company.
          </p>
          <p>
            this is a fan-made project for personal use. no ownership of any pokémon intellectual property is claimed.
            all trademarks belong to their respective owners.
          </p>
        </footer>
      </main>
    </div>
  );
}
