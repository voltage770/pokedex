import { useEffect } from 'react';
import { useModalAnimation } from '../hooks/use-modal-animation';
import { useModalCycleNav } from '../hooks/use-modal-cycle-nav';
import { formatSlugLower } from '../utils/format-name';
import { pulseElement } from '../utils/pulse';
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

function BallModal({ ball, modalRef, onClose, onPrev, onNext, closing, bump }) {
  // cycle pulse via WAAPI on every keyboard / tap-arrow cycle.
  useEffect(() => {
    if (bump.n === 0) return;
    const anim = pulseElement(modalRef.current);
    return () => anim?.cancel();
  }, [bump.n, modalRef]);

  return (
    <div className={`ability-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div ref={modalRef} className="ball-modal" onClick={e => e.stopPropagation()}>
        <div className="ball-modal__header">
          <button className="modal-cycle-arrow modal-cycle-arrow--prev" onClick={onPrev} aria-label="previous">‹</button>
          <div className="ball-modal__title">
            {ball.sprite && <img src={ball.sprite} alt={ball.name} />}
            <h2>{formatSlugLower(ball.name)}</h2>
          </div>
          <button className="modal-cycle-arrow modal-cycle-arrow--next" onClick={onNext} aria-label="next">›</button>
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
  const { current: currentBall, bump, modalRef, open, close, prev, next } = useModalCycleNav(SECTIONED_BALLS);
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
                      onClick={(e) => {
                        const t = e.currentTarget;
                        pulseElement(t, { scale: 1.07, duration: 220, offset: 0.3 });
                        setTimeout(() => open(sectionIdx, index), 70);
                      }}>
                {b.sprite && <img src={b.sprite} alt={b.name} />}
                <span>{formatSlugLower(b.name)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {shownBall && (
        <BallModal
          ball={shownBall}
          modalRef={modalRef}
          onClose={close}
          onPrev={prev}
          onNext={next}
          closing={isClosing}
          bump={bump}
        />
      )}
    </div>
  );
}
