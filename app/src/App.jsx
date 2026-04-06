import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PokemonPage from './pages/PokemonPage';

const THEMES = ['cream', 'light', 'dark'];

// applies and persists theme + colorblind preferences
function useVisualSettings() {
  const [theme, setTheme]           = useState(() => localStorage.getItem('theme') || 'cream');
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
  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useRef(null);

  // close modal when clicking outside
  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modalOpen]);

  return (
    <BrowserRouter basename="/pokedex">
      <header className="site-header">
        <Link to="/" className="site-logo">pokédex</Link>

        <div className="settings-anchor" ref={modalRef}>
          <button className="settings-btn" onClick={() => setModalOpen(o => !o)}>
            visual settings
          </button>

          {modalOpen && (
            <div className="settings-modal">
              <div className="settings-section">
                <span className="settings-label">theme</span>
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

              <div className="settings-section">
                <span className="settings-label">accessibility</span>
                <label className="toggle-row">
                  <span>colorblind mode</span>
                  <div
                    className={`toggle-switch${colorblind ? ' on' : ''}`}
                    onClick={() => setColorblind(v => !v)}
                  />
                </label>
                <p className="settings-hint">adds patterns to stat bars and increases contrast — does not alter type or sprite colors</p>
              </div>
            </div>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/"            element={<HomePage />} />
        <Route path="/pokemon/:id" element={<PokemonPage />} />
      </Routes>
    </BrowserRouter>
  );
}
