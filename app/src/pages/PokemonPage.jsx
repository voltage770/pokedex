import React, { useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatName, formatFormName } from '../utils/formatName';
import { usePokemonDetail } from '../hooks/usePokemon';
import { NAME_TO_ID, FORM_DATA, FORM_TO_BASE_ID, EXCLUDED_FORMS, getBaseFormLabel, FORM_SUFFIX_SPECIES } from '../utils/api';
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

function buildAdj(steps) {
  const adj = {};
  for (const s of steps) {
    if (!adj[s.from]) adj[s.from] = [];
    adj[s.from].push(s);
  }
  return adj;
}

function findRoots(steps) {
  const toSet = new Set(steps.map(s => s.to));
  return [...new Set(steps.map(s => s.from))].filter(n => !toSet.has(n));
}

function formatItem(item) {
  if (!item) return '';
  // evolution stones are single compound words (thunderstone, firestone, etc.)
  if (item.endsWith('-stone')) return item.replace(/-/g, '');
  return item.replace(/-/g, ' ');
}

function EvoArrow({ step }) {
  if (step.isMega) {
    const stone = step.item ? formatItem(step.item) : null;
    const isMove = step.item === 'dragon-ascent';
    return (
      <div className="evo-arrow evo-arrow--mega">
        ↔
        {stone && <span>{isMove ? `move: ${stone}` : stone}</span>}
      </div>
    );
  }

  const conditions = [];
  if (step.min_level)       conditions.push(`lv ${step.min_level}`);
  if (step.item)            conditions.push(formatItem(step.item));
  if (step.trade_species)   conditions.push(`for ${step.trade_species}`);
  if (step.min_happiness)   conditions.push('happiness');
  if (step.known_move_type) conditions.push(`${step.known_move_type} move`);
  if (step.known_move)      conditions.push(step.known_move);
  if (step.time_of_day)     conditions.push(step.time_of_day);
  if (step.needs_rain)      conditions.push('rain');
  if (step.turn_upside_down) conditions.push('upside down');
  if (step.location)        conditions.push(`in ${step.location}`);
  if (step.nature)          conditions.push(step.nature);
  // fall back to trigger name only if nothing else was captured
  if (!conditions.length && step.trigger && step.trigger !== 'level-up' && step.trigger !== 'use-item') {
    conditions.push(step.trigger);
  }
  return (
    <div className="evo-arrow">
      →
      {conditions.map(c => <span key={c}>{c}</span>)}
    </div>
  );
}

const REGION_SUFFIX     = /-(alola|galar|hisui|paldea)$/;
const REGION_ADJECTIVE  = { alola: 'alolan', galar: 'galarian', hisui: 'hisuian', paldea: 'paldean' };

// returns the species name for a pokemon (strips form suffix for pokemon like toxtricity-amped)
function getSpeciesName(pokemonName) {
  for (const s of FORM_SUFFIX_SPECIES) {
    if (pokemonName === s || pokemonName.startsWith(s + '-')) return s;
  }
  return pokemonName;
}

// derives a short display label for a form chip by stripping the shared prefix with the base name
// e.g. getFormChipLabel('charizard-mega-x', 'charizard')       → 'mega x'
//      getFormChipLabel('vulpix-alola', 'vulpix')              → 'alolan'
//      getFormChipLabel('toxtricity-amped-gmax', 'toxtricity-amped') → 'amped gmax'
//      getFormChipLabel('toxtricity-low-key-gmax', 'toxtricity-amped') → 'low key gmax'
//      getFormChipLabel('charizard-gmax', 'charizard')         → 'gigantamax'
function getFormChipLabel(formName, pokemonName) {
  // gmax: show "{variant} gmax" or "gigantamax" if no variant
  if (formName.endsWith('-gmax')) {
    const speciesName  = getSpeciesName(pokemonName);
    const withoutGmax  = formName.slice(0, -5); // strip '-gmax'
    const variant = withoutGmax.startsWith(speciesName + '-')
      ? withoutGmax.slice(speciesName.length + 1).replace(/-/g, ' ')
      : '';
    return variant ? `${variant} gmax` : 'gigantamax';
  }

  const pokeWords = pokemonName.split('-');
  const formWords = formName.split('-');
  let i = 0;
  while (i < pokeWords.length && i < formWords.length && pokeWords[i] === formWords[i]) i++;
  const suffix = formWords.slice(i).join('-');
  if (!suffix)                  return 'base';
  if (REGION_ADJECTIVE[suffix]) return REGION_ADJECTIVE[suffix];
  return suffix.split('-').join(' ');
}

function EvoNode({ name, currentName, adj }) {
  const id = NAME_TO_ID[name];
  const baseSlug = name.replace(REGION_SUFFIX, ''); // for sprite fallback lookup only
  const baseId   = id || NAME_TO_ID[baseSlug] || FORM_TO_BASE_ID[name];
  const artworkUrl = FORM_DATA[name]?.artwork_url
    || (baseId ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${baseId}.png` : '');
  const label = formatFormName(name);
  const steps = adj[name] || [];

  const nodeContent = (
    <>
      <img src={artworkUrl} alt={label} onError={e => { e.target.style.display = 'none'; }} />
      <span>{label}</span>
    </>
  );

  // form nodes link to the base pokemon page with ?form= to trigger the form view
  const linkTo = id
    ? `/pokemon/${id}`
    : NAME_TO_ID[baseSlug]   ? `/pokemon/${NAME_TO_ID[baseSlug]}?form=${name}`
    : FORM_TO_BASE_ID[name]  ? `/pokemon/${FORM_TO_BASE_ID[name]}?form=${name}`
    : null;

  return (
    <div className="evo-node">
      {linkTo ? (
        <Link to={linkTo} className={`evo-pokemon${name === currentName ? ' evo-current' : ''}`}>
          {nodeContent}
        </Link>
      ) : (
        <div className={`evo-pokemon evo-pokemon--form${name === currentName ? ' evo-current' : ''}`}>
          {nodeContent}
        </div>
      )}
      {steps.length > 0 && (
        <div className={`evo-children${steps.length > 1 ? ' evo-children--branch' : ''}`}>
          {steps.map(step => (
            <div key={step.to} className="evo-branch-row">
              <EvoArrow step={step} />
              <EvoNode name={step.to} currentName={currentName} adj={adj} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvoChain({ evolutions, currentName }) {
  if (!evolutions?.length) return <p style={{ color: 'var(--text-subtle)', fontSize: '.85rem' }}>none</p>;
  const adj = buildAdj(evolutions);
  const roots = findRoots(evolutions);
  return (
    <div className="evo-chain">
      {roots.map(root => (
        <EvoNode key={root} name={root} currentName={currentName} adj={adj} />
      ))}
    </div>
  );
}

function RegionalEvoChains({ regionalEvolutions, currentName }) {
  const regions = Object.keys(regionalEvolutions || {});
  if (!regions.length) return null;
  return (
    <>
      {regions.map(region => {
        const steps = regionalEvolutions[region];
        if (!steps?.length) return null;
        return (
          <div key={region} className="evo-regional">
            <EvoChain evolutions={steps} currentName={currentName} />
          </div>
        );
      })}
    </>
  );
}


// order: alt (unique forms) → regional → mega → gmax
// primal/origin/special forms fall into alt_forms from the generator
const FORM_GROUP_ORDER = ['alt_forms', 'regional_forms', 'mega_forms', 'gmax_forms'];

function FormChips({ pokemon, activeForm, onSelect }) {
  const available = new Set(Object.keys(pokemon.form_data || {}));

  const allForms = FORM_GROUP_ORDER.flatMap(field =>
    (pokemon[field] || []).filter(f => available.has(f) && !EXCLUDED_FORMS.has(f))
  );

  if (!allForms.length) return null;

  const chips = [
    { form: null,  label: getBaseFormLabel(pokemon.name) || 'base' },
    ...allForms.map(f => ({ form: f, label: getFormChipLabel(f, pokemon.name) })),
  ];

  return (
    <div className="form-chips">
      {chips.map(({ form, label }, idx) => (
        <React.Fragment key={form ?? '__base__'}>
          {idx > 0 && <span className="form-chip-divider" />}
          <button
            className={`form-chip${activeForm === form ? ' active' : ''}`}
            onClick={() => onSelect(form)}
          >
            {label}
          </button>
        </React.Fragment>
      ))}
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pokemon, loading, error } = usePokemonDetail(id);
  const [selectedAbility, setSelectedAbility] = useState(null);

  if (loading) return <div className="page-center">loading...</div>;
  if (error)   return <div className="page-center error">error: {error}</div>;
  if (!pokemon) return null;

  const selectedForm   = searchParams.get('form');
  const activeFormData = selectedForm && pokemon.form_data?.[selectedForm] ? pokemon.form_data[selectedForm] : null;
  const selectForm     = f => f ? setSearchParams({ form: f }, { replace: true }) : setSearchParams({}, { replace: true });

  const padId     = String(pokemon.id).padStart(3, '0');
  const artwork   = activeFormData
    ? (activeFormData.artwork_url   || activeFormData.sprite_url   || pokemon.artwork_url)
    : (pokemon.artwork_url   || pokemon.sprite_url);
  const artworkSh = activeFormData
    ? (activeFormData.artwork_shiny || activeFormData.sprite_shiny || null)
    : (pokemon.artwork_shiny || pokemon.sprite_shiny);
  const types     = activeFormData?.types     || pokemon.types     || [];
  const stats     = activeFormData?.stats     || pokemon.stats     || [];
  const abilities = activeFormData?.abilities || pokemon.abilities || [];

  // regional evo steps where `from` is a base pokemon (not a regional form) get merged
  // into the main evo chain so they display as branches rather than separate chains
  const REGION_FORM_SUFFIX = /-(alola|galar|hisui|paldea)$/;
  const inlineEvoSteps = [];
  const separateRegionalEvos = {};
  for (const [region, steps] of Object.entries(pokemon.regionalEvolutions || {})) {
    const separate = [];
    for (const step of steps) {
      const fromIsBase = !REGION_FORM_SUFFIX.test(step.from) && !!NAME_TO_ID[step.from];
      if (fromIsBase) inlineEvoSteps.push(step);
      else separate.push(step);
    }
    if (separate.length) separateRegionalEvos[region] = separate;
  }
  const mergedEvolutions = [...(pokemon.evolutions || []), ...inlineEvoSteps];

  return (
    <div className="detail-page">
      <div className="detail-top-row">
        <button className="back-link" onClick={() => navigate(-1)}>← back</button>
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
            </div>
            {artworkSh && (
              <div>
                <img src={artworkSh} alt={`${pokemon.name} shiny`} className="detail-artwork" />
              </div>
            )}
          </div>
        </div>

        {/* right column: info */}
        <div className="detail-right">
          <div className="detail-name-row">
            <div>
              <h1>{formatName(pokemon.name)}</h1>
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
            {types.map(t => (
              <span key={t} className={`type-badge type-${t}`}>{t}</span>
            ))}
          </div>

          <FormChips pokemon={pokemon} activeForm={selectedForm} onSelect={selectForm} />

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
            {stats.map(s => <StatRow key={s.stat_name} stat={s} />)}
          </div>

          {/* abilities */}
          <div>
            <h2 style={{ fontSize: '.7rem', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: '10px' }}>abilities</h2>
            <ul className="abilities-list">
              {abilities.map(a => (
                <li key={a.ability_name}>
                  <button
                    className="ability-btn"
                    onClick={() => setSelectedAbility({ name: a.ability_name, is_hidden: a.is_hidden })}
                  >
                    <span style={a.is_hidden ? { fontStyle: 'italic' } : undefined}>{a.ability_name}</span>
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
        <EvoChain evolutions={mergedEvolutions} currentName={pokemon.name} />
        <RegionalEvoChains regionalEvolutions={separateRegionalEvos} currentName={pokemon.name} />
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
