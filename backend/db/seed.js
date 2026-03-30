/**
 * seed.js
 * Fetches the first 151 Pokémon from PokéAPI and seeds MySQL.
 * Run once: node db/seed.js
 */
require('dotenv').config({ path: __dirname + '/../.env' })
const axios = require('axios');
const mysql = require('mysql2/promise');

/* debug */
console.log('Connecting to:', process.env.DB_HOST, process.env.DB_PORT)

const DB_CONFIG = {
  host:     process.env.DB_HOST || 'localhost',
  port:     process.env.DB_PORT || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

const DB_NAME = process.env.DB_NAME || 'pokedex';
const POKEAPI = 'https://pokeapi.co/api/v2';
const LIMIT = 151; // Change to 1025 for all Pokémon (takes longer)

async function createSchema(conn) {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await conn.query(`USE \`${DB_NAME}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS pokemon (
      id              INT PRIMARY KEY,
      name            VARCHAR(100) NOT NULL,
      generation      INT NOT NULL DEFAULT 1,
      base_experience INT,
      height          INT,
      weight          INT,
      sprite_url      VARCHAR(255),
      sprite_shiny    VARCHAR(255)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS pokemon_types (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      pokemon_id  INT NOT NULL,
      type_name   VARCHAR(50) NOT NULL,
      slot        INT NOT NULL,
      FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS pokemon_stats (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      pokemon_id  INT NOT NULL,
      stat_name   VARCHAR(50) NOT NULL,
      base_value  INT NOT NULL,
      FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS pokemon_abilities (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      pokemon_id   INT NOT NULL,
      ability_name VARCHAR(100) NOT NULL,
      is_hidden    BOOLEAN NOT NULL DEFAULT FALSE,
      FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE
    )
  `);

  console.log('Schema created.');
}

// PokéAPI encodes generation in the species endpoint.
// For simplicity we derive it from ID ranges.
function getGeneration(id) {
  if (id <= 151)  return 1;
  if (id <= 251)  return 2;
  if (id <= 386)  return 3;
  if (id <= 493)  return 4;
  if (id <= 649)  return 5;
  if (id <= 721)  return 6;
  if (id <= 809)  return 7;
  if (id <= 905)  return 8;
  return 9;
}

async function fetchAndInsert(conn, id) {
  const { data } = await axios.get(`${POKEAPI}/pokemon/${id}`);

  // Insert base pokemon row
  await conn.query(
    `INSERT IGNORE INTO pokemon (id, name, generation, base_experience, height, weight, sprite_url, sprite_shiny)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      data.name,
      getGeneration(data.id),
      data.base_experience,
      data.height,
      data.weight,
      data.sprites.front_default,
      data.sprites.front_shiny,
    ]
  );

  // Types
  for (const t of data.types) {
    await conn.query(
      `INSERT INTO pokemon_types (pokemon_id, type_name, slot) VALUES (?, ?, ?)`,
      [data.id, t.type.name, t.slot]
    );
  }

  // Stats
  for (const s of data.stats) {
    await conn.query(
      `INSERT INTO pokemon_stats (pokemon_id, stat_name, base_value) VALUES (?, ?, ?)`,
      [data.id, s.stat.name, s.base_stat]
    );
  }

  // Abilities
  for (const a of data.abilities) {
    await conn.query(
      `INSERT INTO pokemon_abilities (pokemon_id, ability_name, is_hidden) VALUES (?, ?, ?)`,
      [data.id, a.ability.name, a.is_hidden]
    );
  }
}

async function seed() {
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    await createSchema(conn);

    console.log(`Seeding ${LIMIT} Pokémon...`);
    for (let i = 1; i <= LIMIT; i++) {
      await fetchAndInsert(conn, i);
      if (i % 10 === 0) console.log(`  ${i}/${LIMIT} inserted`);
    }

    console.log('Seed complete!');
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await conn.end();
  }
}

seed();
