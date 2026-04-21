import { useState, useEffect, useCallback } from 'react';
import { getPokemon, getPokemonById, comparePokemon, getTypes } from '../utils/api';

export function usePokemonList(filters = {}) {
  const [pokemon, setPokemon]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const fetchPokemon = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPokemon(filters);
      setPokemon(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => { fetchPokemon(); }, [fetchPokemon]);

  return { pokemon, loading, error, refetch: fetchPokemon };
}

export function usePokemonDetail(id) {
  const [pokemon, setPokemon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!id) return;
    // data is local/sync so transitions resolve in a microtask. keep the previous pokemon
    // rendered until the new one arrives so the DOM above the evo chain doesn't collapse
    // into a "loading..." flash, which would break scroll-anchoring on navigation.
    getPokemonById(id)
      .then(p => { setPokemon(p); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  return { pokemon, loading, error };
}

export function useCompare(entries = []) {
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!entries.length) { setPokemon([]); return; }
    setLoading(true);
    comparePokemon(entries)
      .then(setPokemon)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [JSON.stringify(entries)]);

  return { pokemon, loading, error };
}

export function useTypes() {
  const [types, setTypes] = useState([]);
  useEffect(() => { getTypes().then(setTypes).catch(() => {}); }, []);
  return types;
}
