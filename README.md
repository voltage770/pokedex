# Pokédex App

A full-stack Pokémon browser built with React + Vite (frontend) and Node.js + Express + MySQL (backend).

## Stack

- **Frontend**: React, Vite, React Router
- **Backend**: Node.js, Express
- **Database**: MySQL (seeded from PokéAPI)

## Project Structure

```
pokedex/
├── backend/
│   ├── db/
│   │   ├── connection.js        # MySQL connection pool
│   │   └── seed.js              # Fetches from PokéAPI and seeds MySQL
│   ├── routes/
│   │   └── pokemon.js           # All /api/pokemon routes
│   ├── .env.example             # Environment variable template
│   └── server.js                # Express app entry point
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── PokemonCard.jsx   # Card used in grid view
    │   │   ├── SearchBar.jsx     # Search input component
    │   │   ├── FilterPanel.jsx   # Type / generation / stat filters
    │   │   └── ComparePanel.jsx  # Side-by-side comparison UI
    │   ├── pages/
    │   │   ├── HomePage.jsx      # Browse + search + filter grid
    │   │   └── PokemonPage.jsx   # Individual Pokémon detail page
    │   ├── hooks/
    │   │   └── usePokemon.js     # Shared data-fetching hooks
    │   ├── utils/
    │   │   └── api.js            # Axios wrapper for backend calls
    │   ├── App.jsx
    │   └── main.jsx
    └── index.html
```

## Getting Started

### 1. Set up the database

Create a MySQL database and copy the env file:

```bash
cd backend
cp .env.example .env
# Fill in your MySQL credentials in .env
```

### 2. Seed the database

This fetches the first 151 Pokémon from PokéAPI and inserts them into MySQL.

```bash
cd backend
npm install
node db/seed.js
```

### 3. Start the backend

```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pokemon` | List all Pokémon (supports `?search=`, `?type=`, `?generation=`) |
| GET | `/api/pokemon/:id` | Get a single Pokémon by ID |
| GET | `/api/pokemon/compare?ids=1,4,7` | Get multiple Pokémon for comparison |
| GET | `/api/types` | List all types |

## Database Schema

See `backend/db/seed.js` for full schema. Key tables:

- `pokemon` — id, name, generation, base_experience, sprite_url, height, weight
- `pokemon_types` — pokemon_id, type_name
- `pokemon_stats` — pokemon_id, stat_name, base_value
- `pokemon_abilities` — pokemon_id, ability_name, is_hidden
