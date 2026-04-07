import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PokemonPage from './pages/PokemonPage';
import ComparePage from './pages/ComparePage';
import TeamPage from './pages/TeamPage';
import LorePage from './pages/LorePage';

const FEATURES = [
  { to: '/compare', label: 'compare' },
  { to: '/team',    label: 'team builder' },
  { to: '/lore',    label: 'lore & legends' },
];

const THEMES = ['light', 'dark', 'warm', 'retro'];

const OPTIONAL_FILTERS = [
  { key: 'type',    label: 'type' },
  { key: 'class',   label: 'class' },
  { key: 'minStat', label: 'min stat' },
];

const DEFAULT_FILTERS      = { type: true, class: false, minStat: false };
const DEFAULT_FILTER_ORDER = ['type', 'class', 'minStat'];

// saves scroll positions per location key and restores them on back navigation
function ScrollManager() {
  const location  = useLocation();
  const navType   = useNavigationType();
  const positions = useRef({});

  useEffect(() => {
    const save = () => { positions.current[location.key] = window.scrollY; };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [location.key]);

  useEffect(() => {
    if (navType === 'POP') {
      window.scrollTo(0, positions.current[location.key] ?? 0);
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.key, navType]);

  return null;
}

// header lives inside BrowserRouter so it can use useSearchParams
function AppHeader({ theme, setTheme, colorblind, setColorblind, enabledFilters, toggleFilter, filterOrder, reorderFilters }) {
  const [visualsOpen,  setVisualsOpen]  = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const visualsRef  = useRef(null);
  const featuresRef = useRef(null);
  const dragIndex   = useRef(null);

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
      <Link to="/" className="site-logo">pokédex</Link>

      <div className="header-right">
        <div className="settings-anchor" ref={featuresRef}>
          <button className="settings-btn settings-burger" onClick={() => setFeaturesOpen(o => !o)}>
            ≡
          </button>
          {featuresOpen && (
            <div className="settings-modal features-modal">
              {FEATURES.map((f, i) => (
                <>
                  {i > 0 && <div className="dropdown-divider" />}
                  <Link key={f.to} to={f.to} className="feature-link" onClick={() => setFeaturesOpen(false)}>
                    {f.label}
                  </Link>
                </>
              ))}
            </div>
          )}
        </div>

        <div className="settings-anchor" ref={visualsRef}>
          <button className="settings-btn settings-cog" onClick={() => setVisualsOpen(o => !o)}>
            ⚙
          </button>

          {visualsOpen && (
            <div className="settings-modal">
              <span className="settings-label">visuals</span>

              <div className="settings-section">
                <span className="settings-sublabel">theme</span>
                <div className="theme-toggle">
                  {THEMES.map(t => (
                    <button
                      key={t}
                      className={`theme-btn${theme === t ? ' active' : ''}`}
                      onClick={() => setTheme(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="dropdown-divider" />

              <div className="settings-section">
                <span className="settings-sublabel">accessibility</span>
                <label className="toggle-row">
                  <span>colorblind mode</span>
                  <div
                    className={`toggle-switch${colorblind ? ' on' : ''}`}
                    onClick={() => setColorblind(v => !v)}
                  />
                </label>
                <p className="settings-hint">adds patterns to stat bars and increases contrast — does not alter type or sprite colors</p>
              </div>

              <div className="dropdown-divider" />

              <div className="settings-section">
                <span className="settings-sublabel">filter options</span>
                {filterOrder.map((key, i) => {
                  const f = OPTIONAL_FILTERS.find(o => o.key === key);
                  if (!f) return null;
                  return (
                    <label
                      key={f.key}
                      className="settings-checkbox-row"
                      draggable
                      onDragStart={() => { dragIndex.current = i; }}
                      onDragOver={e => {
                        e.preventDefault();
                        if (dragIndex.current === i) return;
                        const next = [...filterOrder];
                        const [moved] = next.splice(dragIndex.current, 1);
                        next.splice(i, 0, moved);
                        dragIndex.current = i;
                        reorderFilters(next);
                      }}
                    >
                      <span className="drag-handle">⠿</span>
                      <input
                        type="checkbox"
                        checked={!!enabledFilters[f.key]}
                        onChange={() => toggleFilter(f.key)}
                      />
                      <span>{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// applies and persists theme + colorblind preferences
function useVisualSettings() {
  const [theme, setTheme]           = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'cream' ? 'warm' : (saved || 'warm');
  });
  const [colorblind, setColorblind] = useState(() => localStorage.getItem('colorblind') === 'true');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-colorblind', colorblind);
    localStorage.setItem('colorblind', colorblind);
  }, [colorblind]);

  return { theme, setTheme, colorblind, setColorblind };
}

export default function App() {
  const { theme, setTheme, colorblind, setColorblind } = useVisualSettings();
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
        colorblind={colorblind} setColorblind={setColorblind}
        enabledFilters={enabledFilters} toggleFilter={toggleFilter}
        filterOrder={filterOrder} reorderFilters={reorderFilters}
      />
      <Routes>
        <Route path="/"            element={<HomePage enabledFilters={enabledFilters} filterOrder={filterOrder} />} />
        <Route path="/pokemon/:id" element={<PokemonPage />} />
        <Route path="/compare"     element={<ComparePage />} />
        <Route path="/team"        element={<TeamPage />} />
        <Route path="/lore"        element={<LorePage />} />
      </Routes>
    </BrowserRouter>
  );
}
