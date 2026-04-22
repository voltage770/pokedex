import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalAnimation } from '../hooks/use-modal-animation';
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

function BallModal({ ball, onPrev, onNext, onClose, closing, bump }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onPrev, onNext, onClose]);

  // cycle pulse driven imperatively via WAAPI. skip on initial mount (bump.n === 0) so the
  // opening `modal-pop` animation plays cleanly, then pulse on each subsequent arrow press.
  useEffect(() => {
    if (bump.n === 0 || !modalRef.current) return;
    const anim = modalRef.current.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.025)', offset: .3 },
        { transform: 'scale(1)' },
      ],
      { duration: 220, easing: 'ease-out' },
    );
    return () => anim.cancel();
  }, [bump.n]);

  return (
    <div className={`ability-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div ref={modalRef} className="ball-modal" onClick={e => e.stopPropagation()}>
        <div className="ball-modal__header">
          {ball.sprite && <img src={ball.sprite} alt={ball.name} />}
          <h2>{formatBallName(ball.name)}</h2>
          <button className="ability-modal-close" onClick={onClose}>✕</button>
        </div>
        {ball.effect && <p className="ball-modal__effect">{ball.effect}</p>}
        {ball.flavor_text && <p className="ball-modal__flavor">{ball.flavor_text}</p>}
        <div className="ball-modal__meta">
          <div className="info-cell">
            <span className="info-cell__label">price</span>
            <span className="info-cell__value">
              {ball.cost > 0 ? `₽${ball.cost.toLocaleString()}` : 'not sold'}
            </span>
          </div>
          {ball.category && (
            <div className="info-cell">
              <span className="info-cell__label">class</span>
              <span className="info-cell__value">
                {ball.category.replace(/-/g, ' ').replace(' balls', '')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PokeballsPage() {
  const [selected, setSelected] = useState(null); // { sectionIdx, index }
  const [bump, setBump] = useState({ n: 0, dir: 0 }); // cycle bump: increments on each arrow press, dir +1/-1

  const close = useCallback(() => setSelected(null), []);
  const cycle = useCallback((delta) => {
    setSelected(s => {
      if (!s) return s;
      const n = SECTIONED_BALLS[s.sectionIdx].items.length;
      return { ...s, index: ((s.index + delta) % n + n) % n };
    });
    setBump(b => ({ n: b.n + 1, dir: delta }));
  }, []);
  const prev = useCallback(() => cycle(-1), [cycle]);
  const next = useCallback(() => cycle(1), [cycle]);

  const currentBall = selected
    ? SECTIONED_BALLS[selected.sectionIdx].items[selected.index]
    : null;
  const { displayed: shownBall, isClosing } = useModalAnimation(currentBall);

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

      {shownBall && (
        <BallModal ball={shownBall} onPrev={prev} onNext={next} onClose={close} closing={isClosing} bump={bump} />
      )}
    </div>
  );
}
