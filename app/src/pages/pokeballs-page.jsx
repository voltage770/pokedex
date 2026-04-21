import { useState } from 'react';
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

function formatBallName(slug) {
  return slug.replace(/-/g, ' ');
}

function BallModal({ ball, onClose }) {
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
  const [selected, setSelected] = useState(null);

  return (
    <div className="items-page">
      <h1>pokéballs</h1>
      <p className="items-page__sub">{balls.length} types</p>

      {SECTIONS.map(section => {
        const items = balls.filter(b => b.category === section.key).sort(section.sort);
        if (!items.length) return null;
        return (
          <div key={section.key} className="items-section">
            <h2 className="items-section__label">{section.label}</h2>
            <div className="ball-grid">
              {items.map(b => (
                <button key={b.id} className="ball-thumb" onClick={() => setSelected(b)}>
                  {b.sprite && <img src={b.sprite} alt={b.name} />}
                  <span>{formatBallName(b.name)}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {selected && <BallModal ball={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
