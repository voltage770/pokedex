import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalAnimation } from '../hooks/use-modal-animation';
import berries from '../data/berries.json';

const FLAVOR_ORDER = ['spicy', 'dry', 'sweet', 'bitter', 'sour'];

const SECTIONS = [
  { label: 'status cure',       match: b => b.id <= 10 },
  { label: 'hp + flavor',       match: b => b.id >= 11 && b.id <= 15 },
  { label: 'ev reducing',       match: b => b.id >= 21 && b.id <= 26 },
  { label: 'type resist',       match: b => b.id >= 36 && b.id <= 52 },
  { label: 'pinch stat boost',  match: b => b.id >= 53 && b.id <= 57 },
  { label: 'special',           match: b => b.id >= 58 && b.id <= 64 },
  { label: 'pokéblock / poffin', match: b => (b.id >= 16 && b.id <= 20) || (b.id >= 27 && b.id <= 35) },
];

const SECTIONED_BERRIES = SECTIONS.map(s => ({
  ...s,
  items: berries.filter(s.match).sort((a, b) => a.id - b.id),
})).filter(s => s.items.length);

function formatName(slug) {
  return slug.replace(/-/g, ' ');
}

function BerryModal({ berry, onPrev, onNext, onClose, closing, bump }) {
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

  const hasFlavors = FLAVOR_ORDER.some(f => berry.flavors[f]);

  return (
    <div className={`ability-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div ref={modalRef} className="ball-modal ball-modal--berry" onClick={e => e.stopPropagation()}>
        <div className="ball-modal__header">
          {berry.sprite && <img src={berry.sprite} alt={berry.name} />}
          <h2>{formatName(berry.name)} berry</h2>
          <button className="ability-modal-close" onClick={onClose}>✕</button>
        </div>
        {berry.effect && <p className="ball-modal__effect">{berry.effect}</p>}
        {berry.flavor_text && <p className="ball-modal__flavor">{berry.flavor_text}</p>}

        {hasFlavors && (
          <div className="berry-flavors">
            {FLAVOR_ORDER.map(f => berry.flavors[f] ? (
              <span key={f} className={`berry-flavor flavor-${f}`}>
                {f} <strong>{berry.flavors[f]}</strong>
              </span>
            ) : null)}
          </div>
        )}

        <div className="ball-modal__meta">
          {berry.natural_gift_type && (
            <div className="info-cell">
              <span className="info-cell__label">type</span>
              <span className="info-cell__value">
                <span className={`type-badge type-${berry.natural_gift_type}`}>{berry.natural_gift_type}</span>
              </span>
            </div>
          )}
          {berry.natural_gift_power > 0 && (
            <div className="info-cell">
              <span className="info-cell__label">power</span>
              <span className="info-cell__value">{berry.natural_gift_power}</span>
            </div>
          )}
          {berry.growth_time > 0 && (
            <div className="info-cell">
              <span className="info-cell__label">growth</span>
              <span className="info-cell__value">{berry.growth_time}h</span>
            </div>
          )}
          {berry.max_harvest > 0 && (
            <div className="info-cell">
              <span className="info-cell__label">yield</span>
              <span className="info-cell__value">{berry.max_harvest}</span>
            </div>
          )}
          {berry.size > 0 && (
            <div className="info-cell">
              <span className="info-cell__label">size</span>
              <span className="info-cell__value">{(berry.size / 10).toFixed(1)} cm</span>
            </div>
          )}
          {berry.firmness && (
            <div className="info-cell">
              <span className="info-cell__label">firmness</span>
              <span className="info-cell__value">{berry.firmness.replace(/-/g, ' ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BerriesPage() {
  const [selected, setSelected] = useState(null); // { sectionIdx, index }
  const [bump, setBump] = useState({ n: 0, dir: 0 }); // cycle bump: increments on each arrow press, dir +1/-1

  const close = useCallback(() => setSelected(null), []);
  const cycle = useCallback((delta) => {
    setSelected(s => {
      if (!s) return s;
      const n = SECTIONED_BERRIES[s.sectionIdx].items.length;
      return { ...s, index: ((s.index + delta) % n + n) % n };
    });
    setBump(b => ({ n: b.n + 1, dir: delta }));
  }, []);
  const prev = useCallback(() => cycle(-1), [cycle]);
  const next = useCallback(() => cycle(1), [cycle]);

  const currentBerry = selected
    ? SECTIONED_BERRIES[selected.sectionIdx].items[selected.index]
    : null;
  const { displayed: shownBerry, isClosing } = useModalAnimation(currentBerry);

  return (
    <div className="items-page">
      <h1>berries</h1>
      <p className="items-page__sub">{berries.length} berry types</p>

      {SECTIONED_BERRIES.map((section, sectionIdx) => (
        <div key={section.label} className="items-section">
          <h2 className="items-section__label">{section.label}</h2>
          <div className="ball-grid">
            {section.items.map((b, index) => (
              <button key={b.id} className="ball-thumb"
                      onClick={() => setSelected({ sectionIdx, index })}>
                {b.sprite && <img src={b.sprite} alt={b.name} />}
                <span>{formatName(b.name)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {shownBerry && (
        <BerryModal berry={shownBerry} onPrev={prev} onNext={next} onClose={close} closing={isClosing} bump={bump} />
      )}
    </div>
  );
}
