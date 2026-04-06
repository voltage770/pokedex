import { useState, useCallback } from 'react';
import { usePokemonList } from '../hooks/usePokemon';
import PokemonCard from '../components/PokemonCard';
import SearchBar from '../components/SearchBar';
import FilterPanel from '../components/FilterPanel';
import ComparePanel from '../components/ComparePanel';

export default function HomePage() {
  const [filters, setFilters]       = useState({});
  const [compareIds, setCompareIds] = useState([]);

  const { pokemon, loading, error } = usePokemonList({ ...filters, limit: 60 });

  const handleSearch = useCallback((search) => {
    setFilters(f => ({ ...f, search: search || undefined }));
  }, []);

  const toggleCompare = (poke) => {
    setCompareIds(prev => {
      if (prev.includes(poke.id)) return prev.filter(id => id !== poke.id);
      if (prev.length >= 3) return prev;
      return [...prev, poke.id];
    });
  };

  return (
    <div className="home-layout">
      <FilterPanel filters={filters} onChange={setFilters} />

      <main className="home-main">
        <SearchBar onSearch={handleSearch} />

        {error   && <p className="error">error: {error}</p>}
        {loading && <p className="loading">loading pokémon...</p>}

        <div className="pokemon-grid">
          {pokemon.map(p => (
            <PokemonCard
              key={p.id}
              pokemon={p}
              onCompareToggle={toggleCompare}
              isCompared={compareIds.includes(p.id)}
            />
          ))}
        </div>

        {!loading && pokemon.length === 0 && (
          <p className="empty">no pokémon found. try adjusting your filters.</p>
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

      <ComparePanel
        selectedIds={compareIds}
        onRemove={id => setCompareIds(prev => prev.filter(i => i !== id))}
      />
    </div>
  );
}
