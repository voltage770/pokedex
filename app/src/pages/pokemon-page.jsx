import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { formatName, formatFormName, formatSlug } from '../utils/format-name';
import { usePokemonDetail } from '../hooks/use-pokemon';
import { useModalAnimation } from '../hooks/use-modal-animation';
import { NAME_TO_ID, FORM_DATA, FORM_TO_BASE_ID, EXCLUDED_FORMS, getBaseFormLabel, FORM_SUFFIX_SPECIES } from '../utils/api';
import { STAT_LABELS_FULL as STAT_LABELS, EV_STAT_LABELS } from '../utils/stats';
import { defensiveMatchups, MATCHUP_ORDER } from '../utils/type-chart';
import { pulseElement } from '../utils/pulse';
import AbilityModal from '../components/ability-modal';

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

function GenderDisplay({ rate }) {
  if (rate == null) return <span className="meta-value">—</span>;
  if (rate === -1)  return <span className="meta-value">—</span>;
  const femalePct = (rate / 8) * 100;
  const malePct   = 100 - femalePct;
  const fmt = n => n % 1 === 0 ? `${n}%` : `${n.toFixed(1)}%`;
  return (
    <span className="gender-display">
      {malePct > 0   && <span className="gender-m">♂ {fmt(malePct)}</span>}
      {malePct > 0 && femalePct > 0 && <span className="gender-sep">|</span>}
      {femalePct > 0 && <span className="gender-f">♀ {fmt(femalePct)}</span>}
    </span>
  );
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

function EvoArrow({ step }) {
  if (step.isMega) {
    const stone  = step.item ? formatSlug(step.item) : null;
    const isMove = step.item === 'dragon-ascent';
    return (
      <div className="evo-arrow evo-arrow--mega">
        ↔
        {stone && <span>{isMove ? `know ${stone}` : stone}</span>}
      </div>
    );
  }

  const trigger = step.trigger;
  const chips   = [];

  if (step.min_level)        chips.push(`lv ${step.min_level}`);

  if (step.item) {
    if (trigger === 'use-item') chips.push(`use ${formatSlug(step.item)}`);
    else if (trigger === 'trade') chips.push(`trade holding ${formatSlug(step.item)}`);
    else                          chips.push(`hold ${formatSlug(step.item)}`);
  }

  if (trigger === 'trade' && !step.item && !step.trade_species) chips.push('trade');
  if (step.trade_species)    chips.push(`trade for ${formatName(step.trade_species)}`);

  if (step.known_move)       chips.push(`know ${formatSlug(step.known_move)}`);
  if (step.known_move_type)  chips.push(`${formatSlug(step.known_move_type)} move`);
  if (step.min_happiness)    chips.push('high friendship');
  if (step.time_of_day)      chips.push(step.time_of_day);
  if (step.needs_rain)       chips.push('rain');
  if (step.turn_upside_down) chips.push('upside down');
  if (step.location)         chips.push(`in ${formatSlug(step.location)}`);
  if (step.nature)           chips.push(`${step.nature} nature`);

  // catch-all for uncommon triggers (shed, spin, etc.)
  if (!chips.length && trigger && trigger !== 'level-up') chips.push(formatSlug(trigger));

  return (
    <div className="evo-arrow">
      →
      {chips.map(c => <span key={c}>{c}</span>)}
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

// full overrides — for forms where suffix stripping produces an incomplete or misleading label
const FORM_CHIP_LABEL_OVERRIDES = {
  'calyrex-ice':                 'ice rider',
  'calyrex-shadow':              'shadow rider',
  'zygarde-10':                  '10% forme',
  'zygarde-complete':            'complete forme',
};

// trailing word appended to derived chip labels for a given pokemon's form set
// e.g. 'giratina-altered' → 'forme' means 'origin' becomes 'origin forme'
const FORM_WORD_SUFFIXES = {
  // -forme
  'giratina-altered':      'forme',
  'deoxys-normal':         'forme',
  'shaymin-land':          'forme',
  'meloetta-aria':         'forme',
  'aegislash-shield':      'forme',
  // -mode
  'darmanitan-standard':   'mode',
  'morpeko-full-belly':    'mode',
  // -face
  'eiscue-ice':            'face',
  // -style
  'oricorio-baile':        'style',
  'urshifu-single-strike': 'style',
  // -form
  'keldeo-ordinary':       'form',
  'wishiwashi-solo':       'form',
  'mimikyu-disguised':     'form',
  'castform':              'form',
  'tatsugiri-curly':       'form',
  'lycanroc-midday':       'form',
  'toxtricity-amped':      'form',
  'basculin-red-striped':  'form',
  // -size
  'pumpkaboo-average':     'size',
};

// derives a short display label for a form chip by stripping the shared prefix with the base name
// e.g. getFormChipLabel('charizard-mega-x', 'charizard')       → 'mega x'
//      getFormChipLabel('vulpix-alola', 'vulpix')              → 'alolan'
//      getFormChipLabel('toxtricity-amped-gmax', 'toxtricity-amped') → 'amped gmax'
//      getFormChipLabel('toxtricity-low-key-gmax', 'toxtricity-amped') → 'low key gmax'
//      getFormChipLabel('charizard-gmax', 'charizard')         → 'gigantamax'
function getFormChipLabel(formName, pokemonName) {
  if (FORM_CHIP_LABEL_OVERRIDES[formName]) return FORM_CHIP_LABEL_OVERRIDES[formName];
  // gmax: show "{variant} gmax" or "gigantamax" if no variant
  if (formName.endsWith('-gmax')) {
    const speciesName  = getSpeciesName(pokemonName);
    const withoutGmax  = formName.slice(0, -5); // strip '-gmax'
    const variant = withoutGmax.startsWith(speciesName + '-')
      ? withoutGmax.slice(speciesName.length + 1).replace(/-/g, ' ')
      : '';
    return variant ? `${variant} gmax` : 'gigantamax';
  }

  // strip the SPECIES prefix, not the full pokemon-name prefix. this keeps the variant-specific
  // part in the label when the current pokemon is already a specific variant (e.g. viewing
  // tatsugiri-curly, the chip for tatsugiri-curly-mega must say "curly mega form" not "mega form").
  const speciesName = getSpeciesName(pokemonName);
  const pokeWords = speciesName.split('-');
  const formWords = formName.split('-');
  let i = 0;
  while (i < pokeWords.length && i < formWords.length && pokeWords[i] === formWords[i]) i++;
  const suffix = formWords.slice(i).join('-');
  if (!suffix)                  return 'base';
  if (REGION_ADJECTIVE[suffix]) return REGION_ADJECTIVE[suffix];
  const label = suffix.split('-').join(' ');
  const word  = FORM_WORD_SUFFIXES[pokemonName];
  return word ? `${label} ${word}` : label;
}

function EvoNode({ name, currentName, adj }) {
  const { id: currentId } = useParams();
  const navigate = useNavigate();
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
  const destId = id ?? NAME_TO_ID[baseSlug] ?? FORM_TO_BASE_ID[name] ?? null;
  const linkTo = destId
    ? (id ? `/pokemon/${id}` : `/pokemon/${destId}?form=${name}`)
    : null;

  return (
    <div className="evo-node">
      {linkTo ? (
        <div
          role="link"
          tabIndex={0}
          className={`evo-pokemon${name === currentName ? ' evo-current' : ''}`}
          // preventDefault on mousedown blocks the browser's focus-on-click, which would otherwise scroll .evo-chain (an overflow-x container) to bring the clicked card "into view". keyboard tab focus still works.
          onMouseDown={e => e.preventDefault()}
          // `state.scrollTop` flags this as a "go-to-top on land" navigation —
          // ScrollManager honors it even when only search params change (e.g.
          // mega evo cards keep the same pathname but flip ?form=). without
          // this flag, ScrollManager only scrolls on pathname change, so
          // clicking a mega card kept the user at their previous scroll
          // position, which felt broken.
          onClick={() => navigate(linkTo, { replace: true, state: { scrollTop: true } })}
          onKeyDown={e => e.key === 'Enter' && navigate(linkTo, { replace: true, state: { scrollTop: true } })}
          style={{ cursor: 'pointer' }}
        >
          {nodeContent}
        </div>
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
  // multi-root chains (e.g. tatsugiri's per-variant mega chains) stack vertically instead of
  // fanning out horizontally — each root is its own independent evolution line.
  const chainClass = `evo-chain${roots.length > 1 ? ' evo-chain--multi-root' : ''}`;
  return (
    <div className={chainClass}>
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

// species-specific chip ordering — used when the default alt_forms order doesn't match the
// intuitive progression for that species. each entry is a list of form slugs (null = base chip)
// in the desired display order. chips not present in the override are appended at the end.
const SPECIES_FORM_ORDER = {
  // zygarde: 10% → 50% (base) → complete → mega
  'zygarde-50': ['zygarde-10', null, 'zygarde-complete', 'zygarde-mega'],
};

function FormChips({ pokemon, activeForm, onSelect }) {
  const available = new Set(Object.keys(pokemon.form_data || {}));

  const allForms = FORM_GROUP_ORDER.flatMap(field =>
    (pokemon[field] || []).filter(f => available.has(f) && !EXCLUDED_FORMS.has(f))
  );

  if (!allForms.length) return null;

  let chips = [
    { form: null,  label: getBaseFormLabel(pokemon.name) || 'base' },
    ...allForms.map(f => ({ form: f, label: getFormChipLabel(f, pokemon.name) })),
  ];

  const orderOverride = SPECIES_FORM_ORDER[pokemon.name];
  if (orderOverride) {
    const byForm = new Map(chips.map(c => [c.form, c]));
    const reordered = orderOverride.map(f => byForm.get(f)).filter(Boolean);
    const seen = new Set(orderOverride);
    chips = [...reordered, ...chips.filter(c => !seen.has(c.form))];
  }

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

export default function PokemonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pokemon, loading, error } = usePokemonDetail(id);
  const [selectedAbility, setSelectedAbility] = useState(null);
  const { displayed: abilityShown, isClosing: abilityClosing } = useModalAnimation(selectedAbility);

  const formParam = searchParams.get('form');

  // keyboard navigation between pokemon: ← / → mirror the visible prev/next
  // buttons in the top nav row. only bind when we're not inside an open
  // ability modal (which has its own Escape handling and shouldn't trap arrows
  // since it's just text). bounds aren't enforced here — same as the buttons,
  // which already happily navigate to nonexistent ids and let the route 404.
  useEffect(() => {
    if (!pokemon || abilityShown) return;
    const handler = (e) => {
      // ignore arrow keys when the user is typing in an input/textarea/etc.
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowLeft')       navigate(`/pokemon/${pokemon.id - 1}`, { replace: true });
      else if (e.key === 'ArrowRight') navigate(`/pokemon/${pokemon.id + 1}`, { replace: true });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pokemon, abilityShown, navigate]);

  // visual cue when the detail content updates — same scale pulse used by
  // the cycling modals (berry / pokeball / badge). consistent feel across
  // the app, and avoids the white-flash artifact we hit with an opacity
  // fade specifically on alt→alt form transitions. fires for both pokemon
  // id changes (prev/next nav) and form changes (form chip click); content
  // swap is instant in both cases.
  const detailCardRef       = useRef(null);
  const detailFirstMountRef = useRef(true);

  useEffect(() => {
    if (detailFirstMountRef.current) {
      detailFirstMountRef.current = false;
      return;
    }
    // bigger and slower than the cycling modals' default — the detail card
    // is large enough that a stronger pulse + longer duration reads as a
    // smooth "settling" of new content rather than a quick snap.
    const anim = pulseElement(detailCardRef.current, { scale: 1.02, duration: 400 });
    return () => anim?.cancel();
  }, [pokemon?.id, formParam]);

  // preload + pre-decode every form's artwork as soon as the pokemon loads.
  // network-only preloading (just setting img.src) caches the bytes but the
  // browser still has to decode the image when an actual <img> element
  // displays it — that decode happens on the main thread and can flash
  // mid-render on src change. img.decode() returns a promise that resolves
  // once the image is fully decoded into a paintable bitmap, after which
  // the actual <img> render is instant.
  useEffect(() => {
    if (!pokemon?.form_data) return;
    const urls = [];
    for (const form of Object.values(pokemon.form_data)) {
      if (!form) continue;
      if (form.artwork_url)   urls.push(form.artwork_url);
      if (form.artwork_shiny) urls.push(form.artwork_shiny);
      if (form.sprite_url)    urls.push(form.sprite_url);
      if (form.sprite_shiny)  urls.push(form.sprite_shiny);
    }
    urls.forEach(u => {
      const img = new Image();
      img.src = u;
      img.decode?.().catch(() => {});
    });
  }, [pokemon?.id]);

  const evoRef = useRef(null);

  if (loading) return <div className="page-center">loading...</div>;
  if (error)   return <div className="page-center error">error: {error}</div>;
  if (!pokemon) return null;

  const activeFormData = formParam && pokemon.form_data?.[formParam] ? pokemon.form_data[formParam] : null;
  const selectForm     = f => f ? setSearchParams({ form: f }, { replace: true }) : setSearchParams({}, { replace: true });

  const padId     = String(pokemon.id).padStart(3, '0');
  const artwork   = activeFormData
    ? (activeFormData.artwork_url   || activeFormData.sprite_url   || pokemon.artwork_url)
    : (pokemon.artwork_url   || pokemon.sprite_url);
  const artworkSh = activeFormData
    ? (activeFormData.artwork_shiny || activeFormData.sprite_shiny || null)
    : (pokemon.artwork_shiny || pokemon.sprite_shiny);
  const types    = activeFormData?.types    || pokemon.types    || [];
  const stats    = activeFormData?.stats    || pokemon.stats    || [];
  const abilities= activeFormData?.abilities|| pokemon.abilities|| [];
  const matchups = defensiveMatchups(types);
  const height   = activeFormData?.height   ?? pokemon.height;
  const weight   = activeFormData?.weight   ?? pokemon.weight;
  const evYield  = activeFormData?.ev_yield ?? pokemon.ev_yield ?? [];

  // inline a region's chain into the main chain only if at least one of its steps is
  // base→regional (e.g. goomy → sliggoo-hisui). that guarantees the chain attaches to a species
  // in the main tree, and all subsequent regional→regional steps inline alongside so the whole
  // regional line renders connected instead of fragmenting across main + separate. chains made
  // entirely of regional→regional steps (e.g. slowpoke-galar, meowth, sneasel-hisui) stay in the
  // separate section as before.
  const REGION_FORM_SUFFIX = /-(alola|galar|hisui|paldea)$/;
  const inlineEvoSteps = [];
  const separateRegionalEvos = {};
  for (const [region, steps] of Object.entries(pokemon.regionalEvolutions || {})) {
    const hasBaseEntry = steps.some(s => !REGION_FORM_SUFFIX.test(s.from) && !!NAME_TO_ID[s.from]);
    if (hasBaseEntry) inlineEvoSteps.push(...steps);
    else              separateRegionalEvos[region] = steps;
  }
  const mergedEvolutions = [...(pokemon.evolutions || []), ...inlineEvoSteps];

  return (
    <div className="detail-page">
      <div className="detail-top-row">
        <button className="back-link" onClick={() => navigate(-1)}>← back</button>
        <div className="detail-nav">
          {pokemon.id > 1 && (
            <button onClick={() => navigate(`/pokemon/${pokemon.id - 1}`, { replace: true })}>← #{String(pokemon.id - 1).padStart(3, '0')}</button>
          )}
          <button onClick={() => navigate(`/pokemon/${pokemon.id + 1}`, { replace: true })}>#{String(pokemon.id + 1).padStart(3, '0')} →</button>
        </div>
      </div>

      <div className="detail-card-wrap">
      <div ref={detailCardRef} className="detail-card">
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
              {pokemon.name_jp && (
                <small className="jp-subtitle detail-jp">
                  {pokemon.name_jp}{pokemon.romaji ? ` · ${pokemon.romaji}` : ''}
                </small>
              )}
              {pokemon.genus && <p className="detail-genus">{pokemon.genus}</p>}
            </div>
            <div className="detail-id-block">
              <div className="detail-id-row">
                <span className="detail-gen">gen {pokemon.generation}</span>
                <span className="detail-id">#{padId}</span>
              </div>
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

          <FormChips pokemon={pokemon} activeForm={formParam} onSelect={selectForm} />

          {(activeFormData?.flavor_text || pokemon.flavor_text) && (
            <p className="detail-flavor">{activeFormData?.flavor_text || pokemon.flavor_text}</p>
          )}

          {/* quick stats: height, weight, gender */}
          <div className="detail-meta">
            <div className="meta-chip">
              <span className="meta-label">height</span>
              <span className="meta-value">{(height / 10).toFixed(1)} m</span>
            </div>
            <div className="meta-chip">
              <span className="meta-label">weight</span>
              <span className="meta-value">{(weight / 10).toFixed(1)} kg</span>
            </div>
            <div className="meta-chip">
              <span className="meta-label">gender</span>
              <GenderDisplay rate={pokemon.gender_rate} />
            </div>
          </div>

          {/* base stats */}
          <div className="detail-stats">
            <h2>base stats</h2>
            {stats.map(s => <StatRow key={s.stat_name} stat={s} />)}
          </div>

          {/* abilities */}
          <div>
            <h2 style={{ fontSize: '.7rem', fontWeight: 'var(--fw-semibold)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: '10px' }}>abilities</h2>
            <ul className="abilities-list">
              {abilities.map(a => (
                <li key={a.ability_name}>
                  <button
                    className="ability-btn"
                    onClick={() => setSelectedAbility({ name: a.ability_name, is_hidden: a.is_hidden })}
                  >
                    <span style={a.is_hidden ? { fontStyle: 'italic' } : undefined}>{a.ability_name.replace(/-/g, ' ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* defensive type matchups — damage taken from each attacking type
              against this pokemon's current types. neutral (1×) is omitted;
              groups appear in order of severity (4× → 0). */}
          <div className="detail-matchups">
            <h2 style={{ fontSize: '.7rem', fontWeight: 'var(--fw-semibold)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: '10px' }}>damage taken</h2>
            {MATCHUP_ORDER.map(({ mult, label }) => {
              const list = matchups[String(mult)];
              if (!list?.length) return null;
              return (
                <div key={mult} className="matchup-row">
                  <span className="matchup-row__mult">{label}</span>
                  <span className="matchup-row__types">
                    {list.map(t => (
                      <span key={t} className={`type-badge type-${t}`}>{t}</span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* evolution chain — clicking a card navigates and ScrollManager
          smooth-scrolls back to the top of the page. */}
      <div className="detail-evolutions" ref={evoRef}>
        <h2>evolution chain</h2>
        {(() => {
          // when a form is selected, pass it as currentName so only an exact matching evo node
          // gets highlighted. if no node matches (e.g. megas, gmaxes), nothing is highlighted.
          // when no form is selected, highlight the base pokemon as usual.
          const currentEvoName = formParam ?? pokemon.name;
          return <>
            <EvoChain evolutions={mergedEvolutions} currentName={currentEvoName} />
            <RegionalEvoChains regionalEvolutions={separateRegionalEvos} currentName={currentEvoName} />
          </>;
        })()}
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
          <span className="meta-label">base exp</span>
          <span className="meta-value">{pokemon.base_experience ?? '—'}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-label">growth rate</span>
          <span className="meta-value">{pokemon.growth_rate ?? '—'}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-label">egg groups</span>
          <span className="meta-value">{(pokemon.egg_groups || []).filter(g => g !== 'no-eggs').join(', ') || 'none'}</span>
        </div>
        {evYield.length > 0 && (
          <div className="meta-chip">
            <span className="meta-label">ev yield</span>
            <span className="meta-value">{evYield.map(e => `${e.effort} ${EV_STAT_LABELS[e.stat_name] ?? e.stat_name}`).join(' / ')}</span>
          </div>
        )}
      </div>

      {abilityShown && (
        <AbilityModal ability={abilityShown} closing={abilityClosing} onClose={() => setSelectedAbility(null)} />
      )}
    </div>
  );
}
