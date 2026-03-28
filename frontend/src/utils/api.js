import axios from 'axios';

// In production (GitHub Pages), VITE_API_URL = your Railway backend URL
// In local dev, Vite's proxy handles /api → localhost:3001
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
});

export const getPokemon = (params = {}) =>
  api.get('/pokemon', { params }).then(r => r.data);

export const getPokemonById = (id) =>
  api.get(`/pokemon/${id}`).then(r => r.data);

export const comparePokemon = (ids = []) =>
  api.get('/pokemon/compare', { params: { ids: ids.join(',') } }).then(r => r.data);

export const getTypes = () =>
  api.get('/types').then(r => r.data);
