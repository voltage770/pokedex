import { useCallback, useEffect, useState } from 'react';
import balls from '../data/pokeballs.json';

const STANDARD_ORDER = ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'safari-ball', 'sport-ball'];

const SECTIONS = [
  { key: 'standard-balls', label: 'standard', sort: (a, b) => {
    const ai = STANDARD_ORDER.indexOf(a.name), bi = STANDARD_ORDER.indexOf(b.name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  }},
  { key: 'special-balls',  label: 'special',  sort: (a, b) => a.name.localeCompare(b.name) },
  { key: 'apricorn-balls', label: 'apricorn', sort: (a, b) => a.name.localeCompare(b.name) },
];

const SECTIONED_BALLS = SECTIONS.map(s => ({
  ...s,
  items: balls.filter(b => b.category === s.key).sort(s.sort),
})).filter(s => s.items.length);

function formatBallName(slug) {
  return slug.replace(/-/g, ' ');
}

function BallModal({ ball, onPrev, onNext, onClose }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onPrev, onNext, onClose]);

  return (
    <div className="ability-modal-overlay" onClick={onClose}>
      <div className="ball-modal" onClick={e => e.stopPropagation()}>
        <div className="ball-modal__header">
          {ball.sprite && <img src={ball.sprite} alt={ball.name} />}
          <h2>{formatBallName(ball.name)}</h2>
          <button className="ability-modal-close" onClick={onClose}>✕</button>
        </div>
        {ball.effect && <p className="ball-modal__effect">{ball.effect}</p>}
        {ball.flavor_text && <p className="ball-modal__flavor">{ball.flavor_text}</p>}
        <div className="ball-modal__meta">
          {ball.cost > 0 && <span>₽{ball.cost.toLocaleString()}</span>}
          {ball.cost === 0 && <span>not sold</span>}
          <span>{ball.category?.replace(/-/g, ' ').replace(' balls', '')}</span>
        </div>
      </div>
    </div>
  );
}

export default function PokeballsPage() {
  const [selected, setSelected] = useState(null); // { sectionIdx, index }

  const close = useCallback(() => setSelected(null), []);
  const cycle = useCallback((delta) => {
    setSelected(s => {
      if (!s) return s;
      const n = SECTIONED_BALLS[s.sectionIdx].items.length;
      return { ...s, index: ((s.index + delta) % n + n) % n };
    });
  }, []);
  const prev = useCallback(() => cycle(-1), [cycle]);
  const next = useCallback(() => cycle(1), [cycle]);

  const currentBall = selected
    ? SECTIONED_BALLS[selected.sectionIdx].items[selected.index]
    : null;

  return (
    <div className="items-page">
      <h1>pokéballs</h1>
      <p className="items-page__sub">{balls.length} types</p>

      {SECTIONED_BALLS.map((section, sectionIdx) => (
        <div key={section.key} className="items-section">
          <h2 className="items-section__label">{section.label}</h2>
          <div className="ball-grid">
            {section.items.map((b, index) => (
              <button key={b.id} className="ball-thumb"
                      onClick={() => setSelected({ sectionIdx, index })}>
                {b.sprite && <img src={b.sprite} alt={b.name} />}
                <span>{formatBallName(b.name)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {currentBall && (
        <BallModal ball={currentBall} onPrev={prev} onNext={next} onClose={close} />
      )}
    </div>
  );
}
