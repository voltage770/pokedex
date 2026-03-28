const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

/**
 * GET /api/pokemon
 * Query params:
 *   search     - name substring
 *   type       - e.g. "fire"
 *   generation - e.g. "1"
 *   stat       - e.g. "attack"
 *   minStat    - min base value for that stat
 *   limit      - default 20
 *   offset     - default 0
 */
router.get('/pokemon', async (req, res) => {
  try {
    const { search, type, generation, stat, minStat, limit = 20, offset = 0 } = req.query;

    let query = `
      SELECT DISTINCT p.*,
        GROUP_CONCAT(DISTINCT pt.type_name ORDER BY pt.slot SEPARATOR ',') AS types
      FROM pokemon p
      LEFT JOIN pokemon_types pt ON p.id = pt.pokemon_id
      LEFT JOIN pokemon_stats  ps ON p.id = ps.pokemon_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND p.name LIKE ?`;
      params.push(`%${search}%`);
    }
    if (type) {
      query += ` AND p.id IN (SELECT pokemon_id FROM pokemon_types WHERE type_name = ?)`;
      params.push(type);
    }
    if (generation) {
      query += ` AND p.generation = ?`;
      params.push(Number(generation));
    }
    if (stat && minStat) {
      query += ` AND p.id IN (
        SELECT pokemon_id FROM pokemon_stats
        WHERE stat_name = ? AND base_value >= ?
      )`;
      params.push(stat, Number(minStat));
    }

    query += ` GROUP BY p.id ORDER BY p.id LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(query, params);

    // Parse comma-separated types back into arrays
    const pokemon = rows.map(p => ({
      ...p,
      types: p.types ? p.types.split(',') : [],
    }));

    res.json(pokemon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/pokemon/compare?ids=1,4,7
 * Returns multiple Pokémon with full stats for comparison
 */
router.get('/pokemon/compare', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'Provide ?ids=1,4,7' });

    const placeholders = ids.map(() => '?').join(',');

    const [pokemon] = await pool.query(
      `SELECT * FROM pokemon WHERE id IN (${placeholders}) ORDER BY id`,
      ids
    );
    const [types] = await pool.query(
      `SELECT * FROM pokemon_types WHERE pokemon_id IN (${placeholders}) ORDER BY slot`,
      ids
    );
    const [stats] = await pool.query(
      `SELECT * FROM pokemon_stats WHERE pokemon_id IN (${placeholders})`,
      ids
    );

    const result = pokemon.map(p => ({
      ...p,
      types: types.filter(t => t.pokemon_id === p.id).map(t => t.type_name),
      stats: stats.filter(s => s.pokemon_id === p.id),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/pokemon/:id
 * Full detail for one Pokémon
 */
router.get('/pokemon/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[pokemon]] = await pool.query(`SELECT * FROM pokemon WHERE id = ?`, [id]);
    if (!pokemon) return res.status(404).json({ error: 'Not found' });

    const [types]     = await pool.query(`SELECT type_name, slot FROM pokemon_types WHERE pokemon_id = ? ORDER BY slot`, [id]);
    const [stats]     = await pool.query(`SELECT stat_name, base_value FROM pokemon_stats WHERE pokemon_id = ?`, [id]);
    const [abilities] = await pool.query(`SELECT ability_name, is_hidden FROM pokemon_abilities WHERE pokemon_id = ?`, [id]);

    res.json({ ...pokemon, types, stats, abilities });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/types
 * All distinct types in the DB
 */
router.get('/types', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT DISTINCT type_name FROM pokemon_types ORDER BY type_name`);
    res.json(rows.map(r => r.type_name));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
