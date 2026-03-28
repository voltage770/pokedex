import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // GitHub Pages serves from /repo-name/ — change 'pokedex' to match your repo name
  base: '/pokedex/',

  server: {
    // In local dev, proxy /api to your local Express server
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
