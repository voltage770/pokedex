const express = require('express');
const path    = require('path');
const router  = express.Router();

// load the full dataset once at startup
const ALL = require(path.join(__dirname, '../data/pokemon.json'));

// lightweight shape returned by the list endpoint — detail page gets the full object
function slim(p) {
  return {
    id:          p.id,
    name:        p.name,
    generation:  p.generation,
    sprite_url:  p.sprite_url,
    sprite_shiny: p.sprite_shiny,
    artwork_url: p.artwork_url,
    types:       p.types,
    stats:       p.stats,
  };
}

/**
 * GET /api/pokemon
 * query params: search, type, generation, stat, minStat, limit (default 20), offset (default 0)
 */
router.get('/pokemon', (req, res) => {
  const { search, type, generation, stat, minStat, limit = 20, offset = 0 } = req.query;

  let results = ALL;

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(p => p.name.includes(q));
  }
  if (type) {
    results = results.filter(p => p.types.includes(type));
  }
  if (generation) {
    results = results.filter(p => p.generation === Number(generation));
  }
  if (stat && minStat) {
    const min = Number(minStat);
    results = results.filter(p => {
      const s = p.stats.find(s => s.stat_name === stat);
      return s && s.base_value >= min;
    });
  }

  const page = results
    .slice(Number(offset), Number(offset) + Number(limit))
    .map(slim);

  res.json(page);
});

/**
 * GET /api/pokemon/compare?ids=1,4,7
 * returns up to 3 pokemon with full data for side-by-side comparison
 */
router.get('/pokemon/compare', (req, res) => {
  const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'provide ?ids=1,4,7' });

  const result = ids.map(id => ALL.find(p => p.id === id)).filter(Boolean);
  res.json(result);
});

/**
 * GET /api/pokemon/:id
 * full detail for one pokemon
 */
router.get('/pokemon/:id', (req, res) => {
  const id = Number(req.params.id);
  const pokemon = ALL.find(p => p.id === id);
  if (!pokemon) return res.status(404).json({ error: 'not found' });
  res.json(pokemon);
});

/**
 * GET /api/types
 * sorted list of all distinct types in the dataset
 */
router.get('/types', (req, res) => {
  const types = [...new Set(ALL.flatMap(p => p.types))].sort();
  res.json(types);
});

module.exports = router;
