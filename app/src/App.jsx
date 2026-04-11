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

const THEMES = ['light', 'dark', 'warm', 'retro', 'ereader'];

const OPTIONAL_FILTERS = [
  { key: 'type',    label: 'type' },
  { key: 'class',   label: 'class' },
  { key: 'minStat', label: 'min stat' },
];

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
    } else if (location.pathname !== prevPath.current) {
      window.scrollTo(0, 0);
    }
    prevPath.current = location.pathname;
  }, [location.key, navType, location.pathname]);

  return null;
}

// header lives inside BrowserRouter so it can use useSearchParams
function AppHeader({ theme, setTheme, colorblind, setColorblind, ease, setEase, enabledFilters, toggleFilter, filterOrder, reorderFilters }) {
  const [visualsOpen,  setVisualsOpen]  = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const visualsRef  = useRef(null);
  const featuresRef = useRef(null);
  const dragIndex   = useRef(null);
  const touchIndex  = useRef(null);

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
          <button className="settings-btn settings-burger" onClick={() => setFeaturesOpen(o => !o)} aria-label="menu">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
              <rect y="0" width="16" height="2" rx="1"/>
              <rect y="5" width="16" height="2" rx="1"/>
              <rect y="10" width="16" height="2" rx="1"/>
            </svg>
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
          <button className="settings-btn settings-cog" onClick={() => setVisualsOpen(o => !o)} aria-label="settings">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
              <path d="M7.5 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm-1.5 2.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"/>
              <path d="M5.85.5a1 1 0 0 0-.98.8L4.6 2.4a5.5 5.5 0 0 0-.9.52l-1.1-.35a1 1 0 0 0-1.17.46L.28 4.47a1 1 0 0 0 .22 1.27l.87.7a5.6 5.6 0 0 0 0 1.12l-.87.7a1 1 0 0 0-.22 1.27l1.15 1.44a1 1 0 0 0 1.17.46l1.1-.35c.28.2.58.37.9.52l.27 1.1a1 1 0 0 0 .98.8h2.3a1 1 0 0 0 .98-.8l.27-1.1c.32-.15.62-.32.9-.52l1.1.35a1 1 0 0 0 1.17-.46l1.15-1.44a1 1 0 0 0-.22-1.27l-.87-.7a5.6 5.6 0 0 0 0-1.12l.87-.7a1 1 0 0 0 .22-1.27L13.57 3.03a1 1 0 0 0-1.17-.46l-1.1.35a5.5 5.5 0 0 0-.9-.52L10.13 1.3a1 1 0 0 0-.98-.8H5.85Zm.17 1h2.96l.3 1.22.44.2c.37.17.71.39 1.02.64l.37.3 1.22-.4 1.48 1.86-.97.78.06.47c.06.42.06.85 0 1.27l-.06.47.97.78-1.48 1.86-1.22-.4-.37.3c-.31.25-.65.47-1.02.64l-.44.2-.3 1.22H6l-.3-1.22-.44-.2a4.5 4.5 0 0 1-1.02-.64l-.37-.3-1.22.4L1.17 8.52l.97-.78-.06-.47a4.6 4.6 0 0 1 0-1.27l.06-.47-.97-.78L2.65 2.89l1.22.4.37-.3c.31-.25.65-.47 1.02-.64l.44-.2.3-1.22Z"/>
            </svg>
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
                <label className="toggle-row" style={{ marginTop: '10px' }}>
                  <span>ease mode</span>
                  <div
                    className={`toggle-switch${ease ? ' on' : ''}`}
                    onClick={() => setEase(v => !v)}
                  />
                </label>
                <p className="settings-hint">removes animations, increases font size, weight, and spacing, boosts contrast — easier on sensitive eyes</p>
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
                      data-drag-index={i}
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
                      onTouchStart={() => { touchIndex.current = i; }}
                      onTouchMove={e => {
                        e.preventDefault();
                        const touch = e.touches[0];
                        const el = document.elementFromPoint(touch.clientX, touch.clientY);
                        const item = el?.closest('[data-drag-index]');
                        if (!item) return;
                        const targetIndex = Number(item.dataset.dragIndex);
                        if (targetIndex === touchIndex.current) return;
                        const next = [...filterOrder];
                        const [moved] = next.splice(touchIndex.current, 1);
                        next.splice(targetIndex, 0, moved);
                        touchIndex.current = targetIndex;
                        reorderFilters(next);
                      }}
                      onTouchEnd={() => { touchIndex.current = null; }}
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

// applies and persists theme + colorblind + ease preferences
function useVisualSettings() {
  const [theme, setTheme]           = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'cream' ? 'warm' : (saved || 'warm');
  });
  const [colorblind, setColorblind] = useState(() => localStorage.getItem('colorblind') === 'true');
  const [ease, setEase]             = useState(() => localStorage.getItem('ease') === 'true');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-colorblind', colorblind);
    localStorage.setItem('colorblind', colorblind);
  }, [colorblind]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ease', ease);
    localStorage.setItem('ease', ease);
  }, [ease]);

  return { theme, setTheme, colorblind, setColorblind, ease, setEase };
}

export default function App() {
  const { theme, setTheme, colorblind, setColorblind, ease, setEase } = useVisualSettings();
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
        ease={ease} setEase={setEase}
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
