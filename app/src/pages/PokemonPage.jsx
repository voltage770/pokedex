import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePokemonDetail } from '../hooks/usePokemon';
import { NAME_TO_ID } from '../utils/api';
import ABILITIES from '../data/abilities.json';

const STAT_LABELS = {
  hp:               'HP',
  attack:           'Attack',
  defense:          'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense':'Sp. Def',
  speed:            'Speed',
};

// returns a tier class for stat bar color
function statTier(val) {
  if (val >= 100) return 'high';
  if (val >= 60)  return 'mid';
  return 'low';
}

// single animated stat row
function StatRow({ stat }) {
  const pct = Math.round((stat.base_value / 255) * 100);
  return (
    <div className="stat-row">
      <span className="stat-label">{STAT_LABELS[stat.stat_name] || stat.stat_name}</span>
      <span className="stat-value">{stat.base_value}</span>
      <div className="stat-track">
        <div className={`stat-fill ${statTier(stat.base_value)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// converts gender_rate (-1 = genderless, 0–8 = female eighths) to readable string
function genderText(rate) {
  if (rate === -1) return 'genderless';
  const femalePct = Math.round((rate / 8) * 100);
  return `${100 - femalePct}% m / ${femalePct}% f`;
}

// renders the evolution chain steps as a horizontal chain
function EvoChain({ evolutions, currentName }) {
  if (!evolutions || evolutions.length === 0) return <p style={{ color: 'var(--text-subtle)', fontSize: '.85rem' }}>none</p>;

  // build ordered list of unique names in chain
  const names = [];
  for (const step of evolutions) {
    if (!names.includes(step.from)) names.push(step.from);
    if (!names.includes(step.to))   names.push(step.to);
  }

  // build a map from name → next step details
  const stepMap = Object.fromEntries(evolutions.map(s => [s.from, s]));

  return (
    <div className="evo-chain">
      {names.map((name, i) => {
        const step = stepMap[name];
        return (
          <div key={name} className="evo-step">
            <Link
              to={`/pokemon/${NAME_TO_ID[name] || name}`}
              className={`evo-pokemon${name === currentName ? ' evo-current' : ''}`}
            >
              <img
                src={NAME_TO_ID[name] ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${NAME_TO_ID[name]}.png` : ''}
                alt={name}
                onError={e => { e.target.style.display = 'none'; }}
              />
              <span>{name}</span>
            </Link>
            {step && (
              <div className="evo-arrow">
                →
                {step.min_level && <span>lv {step.min_level}</span>}
                {step.item      && <span>{step.item}</span>}
                {!step.min_level && !step.item && step.trigger && <span>{step.trigger}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


function AbilityModal({ ability, onClose }) {
  return (
    <div className="ability-modal-overlay" onClick={onClose}>
      <div className="ability-modal" onClick={e => e.stopPropagation()}>
        <div className="ability-modal-header">
          <span className="ability-modal-name">{ability.name}</span>
          {ability.is_hidden && <em className="ability-modal-hidden">hidden</em>}
          <button className="ability-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="ability-modal-desc">
          {ABILITIES[ability.name] || 'no description available.'}
        </p>
      </div>
    </div>
  );
}

export default function PokemonPage() {
  const { id } = useParams();
  const { pokemon, loading, error } = usePokemonDetail(id);
  const [selectedAbility, setSelectedAbility] = useState(null);

  if (loading) return <div className="page-center">loading...</div>;
  if (error)   return <div className="page-center error">error: {error}</div>;
  if (!pokemon) return null;

  const padId      = String(pokemon.id).padStart(3, '0');
  const artwork    = pokemon.artwork_url || pokemon.sprite_url;
  const artworkSh  = pokemon.artwork_shiny || pokemon.sprite_shiny;

  return (
    <div className="detail-page">
      <div className="detail-top-row">
        <Link to="/" className="back-link">← back</Link>
        <div className="detail-nav">
          {pokemon.id > 1 && (
            <Link to={`/pokemon/${pokemon.id - 1}`}>← #{String(pokemon.id - 1).padStart(3, '0')}</Link>
          )}
          <Link to={`/pokemon/${pokemon.id + 1}`}>#{String(pokemon.id + 1).padStart(3, '0')} →</Link>
        </div>
      </div>

      <div className="detail-card">
        {/* left column: artwork + sprites */}
        <div className="detail-left">
          <div className="sprite-row">
            <div>
              <img src={artwork} alt={pokemon.name} className="detail-artwork" />
              <div className="sprite-label">default</div>
            </div>
            {artworkSh && (
              <div>
                <img src={artworkSh} alt={`${pokemon.name} shiny`} className="detail-artwork" />
                <div className="sprite-label">shiny</div>
              </div>
            )}
          </div>
        </div>

        {/* right column: info */}
        <div className="detail-right">
          <div className="detail-name-row">
            <div>
              <h1>{pokemon.name}</h1>
              {pokemon.genus && <p className="detail-genus">{pokemon.genus}</p>}
            </div>
            <div className="detail-id-block">
              <span className="detail-id">#{padId}</span>
              {(pokemon.is_legendary || pokemon.is_mythical) && (
                <span className={`special-badge ${pokemon.is_mythical ? 'mythical' : 'legendary'}`}>
                  {pokemon.is_mythical ? 'mythical' : 'legendary'}
                </span>
              )}
            </div>
          </div>

          <div className="detail-types">
            {(pokemon.types || []).map(t => (
              <span key={t} className={`type-badge type-${t}`}>{t}</span>
            ))}
          </div>

          {pokemon.flavor_text && (
            <p className="detail-flavor">{pokemon.flavor_text}</p>
          )}

          {/* quick stats: height, weight, gen */}
          <div className="detail-meta">
            <div className="meta-chip">
              <span className="meta-label">generation</span>
              <span className="meta-value">{pokemon.generation}</span>
            </div>
            <div className="meta-chip">
              <span className="meta-label">height</span>
              <span className="meta-value">{(pokemon.height / 10).toFixed(1)} m</span>
            </div>
            <div className="meta-chip">
              <span className="meta-label">weight</span>
              <span className="meta-value">{(pokemon.weight / 10).toFixed(1)} kg</span>
            </div>
            <div className="meta-chip">
              <span className="meta-label">base exp</span>
              <span className="meta-value">{pokemon.base_experience ?? '—'}</span>
            </div>
          </div>

          {/* base stats */}
          <div className="detail-stats">
            <h2>base stats</h2>
            {(pokemon.stats || []).map(s => <StatRow key={s.stat_name} stat={s} />)}
          </div>

          {/* abilities */}
          <div>
            <h2 style={{ fontSize: '.7rem', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: '10px' }}>abilities</h2>
            <ul className="abilities-list">
              {(pokemon.abilities || []).map(a => (
                <li key={a.ability_name}>
                  <button
                    className="ability-btn"
                    onClick={() => setSelectedAbility({ name: a.ability_name, is_hidden: a.is_hidden })}
                  >
                    {a.ability_name} {a.is_hidden && <em>hidden</em>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* evolution chain */}
      <div className="detail-evolutions">
        <h2>evolution chain</h2>
        <EvoChain evolutions={pokemon.evolutions} currentName={pokemon.name} />
      </div>

      {/* extra species info */}
      <div className="detail-extra">
        <div className="meta-chip">
          <span className="meta-label">catch rate</span>
          <span className="meta-value">{pokemon.catch_rate ?? '—'}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-label">base happiness</span>
          <span className="meta-value">{pokemon.base_happiness ?? '—'}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-label">growth rate</span>
          <span className="meta-value">{pokemon.growth_rate ?? '—'}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-label">gender</span>
          <span className="meta-value">{pokemon.gender_rate != null ? genderText(pokemon.gender_rate) : '—'}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-label">egg groups</span>
          <span className="meta-value">{(pokemon.egg_groups || []).filter(g => g !== 'no-eggs').join(', ') || 'none'}</span>
        </div>
        {pokemon.habitat && (
          <div className="meta-chip">
            <span className="meta-label">habitat</span>
            <span className="meta-value">{pokemon.habitat}</span>
          </div>
        )}
      </div>

      {selectedAbility && (
        <AbilityModal ability={selectedAbility} onClose={() => setSelectedAbility(null)} />
      )}
    </div>
  );
}
