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
    setLoading(true);
    getPokemonById(id)
      .then(setPokemon)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { pokemon, loading, error };
}

export function useCompare(ids = []) {
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!ids.length) return;
    setLoading(true);
    comparePokemon(ids)
      .then(setPokemon)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [ids.join(',')]);

  return { pokemon, loading, error };
}

export function useTypes() {
  const [types, setTypes] = useState([]);
  useEffect(() => { getTypes().then(setTypes).catch(() => {}); }, []);
  return types;
}
