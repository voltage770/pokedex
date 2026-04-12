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

const THEMES = ['light', 'dark', 'retro', 'ereader'];

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
  const visualsRef    = useRef(null);
  const featuresRef   = useRef(null);
  const dragIndex     = useRef(null);
  const touchIndex    = useRef(null);
  const [draggingIndex, setDraggingIndex] = useState(null);

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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect y="2" width="16" height="2" rx="1"/>
              <rect y="7" width="16" height="2" rx="1"/>
              <rect y="12" width="16" height="2" rx="1"/>
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
            </svg>
          </button>

          {visualsOpen && (
            <div className="settings-modal">
              <span className="settings-label">visuals</span>

              <div className="settings-section">
                <span className="settings-sublabel">theme</span>
                <select
                  className="theme-select"
                  value={theme}
                  onChange={e => setTheme(e.target.value)}
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
                    onClick={() => setA11y(v => !v)}
                  />
                </label>
                <p className="settings-hint">adds patterns to stat bars, removes animations, increases font size and spacing, boosts contrast</p>
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
                      className={`settings-checkbox-row${draggingIndex === i ? ' is-dragging' : ''}`}
                      data-drag-index={i}
                      draggable
                      onDragStart={() => { dragIndex.current = i; setDraggingIndex(i); }}
                      onDragOver={e => {
                        e.preventDefault();
                        if (dragIndex.current === i) return;
                        const next = [...filterOrder];
                        const [moved] = next.splice(dragIndex.current, 1);
                        next.splice(i, 0, moved);
                        dragIndex.current = i;
                        reorderFilters(next);
                      }}
                      onDragEnd={() => { setDraggingIndex(null); }}
                      onTouchStart={() => { touchIndex.current = i; setDraggingIndex(i); }}
                      onTouchMove={e => {
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
                        setDraggingIndex(targetIndex);
                        reorderFilters(next);
                      }}
                      onTouchEnd={() => { touchIndex.current = null; setDraggingIndex(null); }}
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

// applies and persists theme + a11y preferences
function useVisualSettings() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    // migrate old 'warm'/'cream' values to 'light'
    return (saved === 'warm' || saved === 'cream') ? 'light' : (saved || 'light');
  });
  const [a11y, setA11y] = useState(() => localStorage.getItem('a11y') === 'true');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
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
        <Route path="/"            element={<HomePage enabledFilters={enabledFilters} filterOrder={filterOrder} />} />
        <Route path="/pokemon/:id" element={<PokemonPage />} />
        <Route path="/compare"     element={<ComparePage />} />
        <Route path="/team"        element={<TeamPage />} />
        <Route path="/lore"        element={<LorePage />} />
      </Routes>
    </BrowserRouter>
  );
}
