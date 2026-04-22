import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useModalAnimation } from './hooks/use-modal-animation';
import HomePage from './pages/home-page';
import PokemonPage from './pages/pokemon-page';
import ComparePage from './pages/compare-page';
import TeamPage from './pages/team-page';
import LorePage from './pages/lore-page';
import NewsPage from './pages/news-page';
import TypesPage from './pages/types-page';
import PokeballsPage from './pages/pokeballs-page';
import BerriesPage from './pages/berries-page';
import MovesPage from './pages/moves-page';
import AboutPage from './pages/about-page';

const NAV_SECTIONS = [
  {
    items: [
      { to: '/', label: 'news' },
    ],
  },
  {
    items: [
      { to: '/berries',   label: 'berries' },
      { to: '/compare',   label: 'compare' },
      { to: '/lore',      label: 'lore & legends' },
      { to: '/moves',     label: 'moves' },
      { to: '/pokeballs', label: 'pokéballs' },
      { to: '/pokedex',   label: 'pokédex' },
      { to: '/team',      label: 'team builder' },
      { to: '/types',     label: 'type chart' },
    ],
  },
  {
    items: [
      { to: '/about', label: 'about' },
    ],
  },
];

const THEMES = ['auto', 'light', 'dark', 'ereader', 'retro', 'nitro'];

// every base starter across gen 1 → gen 9, plus pichu. shuffled on mount and
// doubled (JSX below) so the keyframe's `translateX(-50%)` lands sprite[count]
// exactly where sprite[0] started. the inner `.header-sprites` element is
// `width: max-content` in CSS, so -50% is always half the real content width
// regardless of this roster's length — adding or removing entries here just
// works, no CSS update needed.
const HEADER_SPRITE_IDS = [
  // gen 1
  1, 4, 7,
  // gen 2 (+ pichu)
  152, 155, 158, 172,
  // gen 3
  252, 255, 258,
  // gen 4
  387, 390, 393,
  // gen 5
  495, 498, 501,
  // gen 6
  650, 653, 656,
  // gen 7
  722, 725, 728,
  // gen 8
  810, 813, 816,
  // gen 9
  906, 909, 912,
];

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// animation durations for the sprite strip (milliseconds).
// normal is the default drift; a11y slows it ~73% so motion-sensitive users
// still get a living header without it whipping past.
const SPRITE_ANIM_NORMAL_MS = 52000;
const SPRITE_ANIM_A11Y_MS   = 90000;

function HeaderSprites({ a11y }) {
  // shuffle once per mount so the ordering is random per session but stable
  // across re-renders (otherwise the strip would reshuffle on every state
  // change in the header and jitter mid-animation).
  const strip = useMemo(() => {
    const shuffled = shuffle(HEADER_SPRITE_IDS);
    return [...shuffled, ...shuffled];
  }, []);

  // JS-managed animation via the Web Animations API rather than CSS. two
  // reasons: (1) on a11y toggle we can retime the running animation in place
  // — compute current progress, update duration, seek currentTime to preserve
  // that progress — so sprites keep moving without a reset. CSS animation
  // changes would restart from 0. (2) the universal
  // `[data-a11y='true'] * { animation: none !important }` rule in main.scss
  // only kills CSS animations; WAAPI animations are on a separate track and
  // sail right past it.
  const stripRef = useRef(null);
  const animRef  = useRef(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    animRef.current = el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-50%)' },
      ],
      {
        duration:   a11y ? SPRITE_ANIM_A11Y_MS : SPRITE_ANIM_NORMAL_MS,
        iterations: Infinity,
        easing:     'linear',
      },
    );
    return () => animRef.current?.cancel();
    // intentionally mount-only: a11y-driven retime is handled by the next
    // effect so we don't cancel+restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    const timing      = anim.effect?.getComputedTiming?.();
    const oldDuration = typeof timing?.duration === 'number' ? timing.duration : SPRITE_ANIM_NORMAL_MS;
    const currentTime = Number(anim.currentTime) || 0;
    const progress    = (currentTime % oldDuration) / oldDuration;
    const newDuration = a11y ? SPRITE_ANIM_A11Y_MS : SPRITE_ANIM_NORMAL_MS;
    anim.effect?.updateTiming({ duration: newDuration });
    // seek so the visual position survives the retime; without this the
    // strip would jump backward/forward to whatever spot corresponds to the
    // raw currentTime in the new duration.
    anim.currentTime = newDuration * progress;
  }, [a11y]);

  // structural note: outer `.header-sprites-clip` handles positioning + the
  // header-width clip box. inner `.header-sprites` has `width: max-content`
  // so its `-50%` transform translates by exactly half the content width —
  // one full copy — landing sprite[count] where sprite[0] started. merging
  // the clip and the animated element would force the animated element's
  // width to match the header, breaking the loop math.
  return (
    <div className="header-sprites-clip" aria-hidden="true">
      <div className="header-sprites" ref={stripRef}>
        {strip.map((id, i) => (
          <img
            key={i}
            src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`}
            alt=""
            decoding="async"
          />
        ))}
      </div>
    </div>
  );
}


const DEFAULT_FILTERS      = { type: true, class: false, minStat: false };
const DEFAULT_FILTER_ORDER = ['type', 'class', 'minStat'];

// saves scroll positions per location key and restores them on back navigation
// only scrolls to top when the pathname actually changes — search param changes (e.g. form switching) are ignored
function ScrollManager() {
  const location   = useLocation();
  const navType    = useNavigationType();
  const positions  = useRef({});
  const prevPath   = useRef(location.pathname);

  useEffect(() => {
    const save = () => { positions.current[location.key] = window.scrollY; };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [location.key]);

  useEffect(() => {
    if (navType === 'POP') {
      window.scrollTo(0, positions.current[location.key] ?? 0);
    } else if (location.pathname !== prevPath.current && !location.state?.noScroll) {
      window.scrollTo(0, 0);
    }
    prevPath.current = location.pathname;
  }, [location.key, navType, location.pathname]);

  return null;
}

// header lives inside BrowserRouter so it can use useSearchParams
function AppHeader({ theme, setTheme, a11y, setA11y, enabledFilters, toggleFilter, filterOrder, reorderFilters }) {
  const [visualsOpen,  setVisualsOpen]  = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const { displayed: visualsShown,  isClosing: visualsClosing }  = useModalAnimation(visualsOpen);
  const { displayed: featuresShown, isClosing: featuresClosing } = useModalAnimation(featuresOpen);
  const visualsRef    = useRef(null);
  const featuresRef   = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (visualsRef.current  && !visualsRef.current.contains(e.target))  setVisualsOpen(false);
      if (featuresRef.current && !featuresRef.current.contains(e.target)) setFeaturesOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="site-header">
      <HeaderSprites a11y={a11y} />

      <div className="header-left">
        <div className="settings-anchor" ref={featuresRef}>
          <button className="settings-btn settings-burger" onClick={() => setFeaturesOpen(o => !o)} aria-label="menu">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect y="2" width="16" height="2" rx="1"/>
              <rect y="7" width="16" height="2" rx="1"/>
              <rect y="12" width="16" height="2" rx="1"/>
            </svg>
          </button>
          {featuresShown && (
            <div className={`settings-modal features-modal${featuresClosing ? ' closing' : ''}`}>
              {NAV_SECTIONS.map((section, si) => (
                <Fragment key={si}>
                  {si > 0 && <div className="dropdown-divider" />}
                  {section.label && <div className="nav-section-label">{section.label}</div>}
                  {section.items.map(f => (
                    <Link key={f.to} to={f.to} className="feature-link" onClick={() => setFeaturesOpen(false)}>
                      {f.label}
                    </Link>
                  ))}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="header-right">
        <div className="settings-anchor" ref={visualsRef}>
          <button className="settings-btn settings-cog" onClick={() => setVisualsOpen(o => !o)} aria-label="settings">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
            </svg>
          </button>

          {visualsShown && (
            <div className={`settings-modal${visualsClosing ? ' closing' : ''}`}>
              <span className="settings-label">visuals</span>

              <div className="settings-section">
                <span className="settings-sublabel">theme</span>
                <select
                  className="theme-select"
                  value={theme}
                  onChange={e => { setTheme(e.target.value); setVisualsOpen(false); }}
                >
                  {THEMES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="dropdown-divider" />

              <div className="settings-section">
                <span className="settings-sublabel">a11y</span>
                <label className="toggle-row">
                  <span>a11y mode</span>
                  <div
                    className={`toggle-switch${a11y ? ' on' : ''}`}
                    onClick={() => {
                      setA11y(v => !v);
                      // let the 200ms toggle knob transition finish before the modal fades out,
                      // so the user sees the switch reach its new position. matches the natural
                      // delay from the native <select> closing before theme onChange fires.
                      setTimeout(() => setVisualsOpen(false), 200);
                    }}
                  />
                </label>
                <p className="settings-hint">adds patterns to stat bars, removes animations, increases font size and spacing, boosts contrast</p>
              </div>

            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// applies and persists theme + a11y preferences.
// 'auto' follows the OS prefers-color-scheme setting live — we watch matchMedia so a
// system-level toggle (e.g. macOS light→dark at sundown) updates the site immediately
// without a reload. selecting any explicit theme overrides the OS preference.
function useVisualSettings() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    // migrate old 'warm'/'cream' values to 'light'
    if (saved === 'warm' || saved === 'cream') return 'light';
    // new/unset users default to 'auto' so first visit matches their system.
    return saved || 'auto';
  });
  const [a11y, setA11y] = useState(() => localStorage.getItem('a11y') === 'true');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme !== 'auto') {
      document.documentElement.setAttribute('data-theme', theme);
      return;
    }
    // auto: resolve to light/dark from OS, and re-resolve on system change.
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.setAttribute('data-theme', mql.matches ? 'dark' : 'light');
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-a11y', a11y);
    localStorage.setItem('a11y', a11y);
  }, [a11y]);

  return { theme, setTheme, a11y, setA11y };
}

export default function App() {
  const { theme, setTheme, a11y, setA11y } = useVisualSettings();
  const [enabledFilters, setEnabledFilters] = useState(() => {
    try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem('enabledFilters')) }; }
    catch { return DEFAULT_FILTERS; }
  });

  const [filterOrder, setFilterOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('filterOrder'));
      // ensure any new keys are appended if missing
      if (Array.isArray(saved)) {
        const missing = DEFAULT_FILTER_ORDER.filter(k => !saved.includes(k));
        return [...saved, ...missing];
      }
    } catch {}
    return DEFAULT_FILTER_ORDER;
  });

  const toggleFilter = (key) => {
    setEnabledFilters(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('enabledFilters', JSON.stringify(next));
      return next;
    });
  };

  const reorderFilters = (newOrder) => {
    setFilterOrder(newOrder);
    localStorage.setItem('filterOrder', JSON.stringify(newOrder));
  };

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollManager />
      <AppHeader
        theme={theme} setTheme={setTheme}
        a11y={a11y} setA11y={setA11y}
        enabledFilters={enabledFilters} toggleFilter={toggleFilter}
        filterOrder={filterOrder} reorderFilters={reorderFilters}
      />
      <Routes>
        <Route path="/"            element={<NewsPage />} />
        <Route path="/pokedex"     element={<HomePage enabledFilters={enabledFilters} filterOrder={filterOrder} toggleFilter={toggleFilter} />} />
        <Route path="/pokemon/:id" element={<PokemonPage />} />
        <Route path="/compare"     element={<ComparePage />} />
        <Route path="/types"       element={<TypesPage />} />
        <Route path="/moves"       element={<MovesPage />} />
        <Route path="/pokeballs"   element={<PokeballsPage />} />
        <Route path="/berries"     element={<BerriesPage />} />
        <Route path="/team"        element={<TeamPage />} />
        <Route path="/lore"        element={<LorePage />} />
        <Route path="/about"       element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
