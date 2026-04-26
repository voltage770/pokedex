import { useEffect, useRef } from 'react';
import { useModalAnimation } from '../hooks/use-modal-animation';
import { useModalCycleNav } from '../hooks/use-modal-cycle-nav';
import { pulseElement } from '../utils/pulse';
import ModalCycleArrows from '../components/modal-cycle-arrows';
import badges from '../data/badges.json';

// region order matches the games' release sequence — kanto first, paldea last.
const REGIONS = [
  { slug: 'kanto',  label: 'kanto'  },
  { slug: 'johto',  label: 'johto'  },
  { slug: 'hoenn',  label: 'hoenn'  },
  { slug: 'sinnoh', label: 'sinnoh' },
  { slug: 'unova',  label: 'unova'  },
  { slug: 'kalos',  label: 'kalos'  },
  { slug: 'galar',  label: 'galar'  },
  { slug: 'paldea', label: 'paldea' },
];

// merge BW + B2W2 into a single unova section. the same badge name often
// appears in both gen-5 games with different leaders or cities (basic badge:
// lenora @ nacrene in BW vs cheren @ aspertia in B2W2). when that happens,
// fold the entries into one card and comma-join the differing fields — same
// pattern as galar where version-exclusive sword/shield gyms each get their
// own row but the shared 6 just appear once.
//   data file stays granular (unova-bw and unova-b2w2 are separate regions);
//   the merge is done at page-load so it's trivial to revisit later.
function mergeUnova(all) {
  const unovaSrc  = all.filter(b => b.region === 'unova-bw' || b.region === 'unova-b2w2');
  const byName    = new Map();
  for (const b of unovaSrc) {
    if (!byName.has(b.name)) {
      byName.set(b.name, {
        ...b,
        region:       'unova',
        region_label: 'unova',
        id:           b.id.replace(/-unova-(bw|b2w2)$/, '-unova'),
      });
      continue;
    }
    const existing = byName.get(b.name);
    const merge = (key) => {
      const a = existing[key], c = b[key];
      if (!a || !c || a === c) return;
      if (a.split(', ').includes(c)) return;
      existing[key] = `${a}, ${c}`;
    };
    merge('leader');
    merge('city');
  }
  return [...byName.values()];
}

const allBadges = [
  ...badges.filter(b => b.region !== 'unova-bw' && b.region !== 'unova-b2w2'),
  ...mergeUnova(badges),
];

const SECTIONED_BADGES = REGIONS
  .map(r => ({ ...r, items: allBadges.filter(b => b.region === r.slug) }))
  .filter(s => s.items.length);

// trio badge stores its type as "grass, fire, water" because the striaton gym
// has three rotating leaders. split on comma so the modal can render each as
// its own colored badge instead of a single mismatched class.
function splitTypes(t) {
  return (t || '').split(',').map(s => s.trim()).filter(Boolean);
}

function BadgeModal({ badge, onClose, onPrev, onNext, closing, bump }) {
  const modalRef = useRef(null);

  // cycle pulse via WAAPI. skip on initial mount (bump.n === 0) so the
  // opening modal-pop animation plays cleanly, then pulse on each cycle.
  useEffect(() => {
    if (bump.n === 0) return;
    const anim = pulseElement(modalRef.current);
    return () => anim?.cancel();
  }, [bump.n]);

  const types = splitTypes(badge.type);

  return (
    <div className={`ability-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <ModalCycleArrows onPrev={onPrev} onNext={onNext} />
      <div ref={modalRef} className="ball-modal ball-modal--badge" onClick={e => e.stopPropagation()}>
        <div className="ball-modal__header">
          {badge.sprite && <img src={badge.sprite} alt={badge.name} referrerPolicy="no-referrer" />}
          <h2>{badge.name}</h2>
          <button className="ability-modal-close" onClick={onClose}>✕</button>
        </div>

        {badge.design && <p className="ball-modal__flavor">{badge.design}</p>}

        <div className="ball-modal__meta">
          <div className="info-cell">
            <span className="info-cell__label">leader</span>
            <span className="info-cell__value">{badge.leader || '—'}</span>
          </div>
          <div className="info-cell">
            <span className="info-cell__label">city</span>
            <span className="info-cell__value">{badge.city || '—'}</span>
          </div>
          <div className="info-cell">
            <span className="info-cell__label">type</span>
            <span className="info-cell__value info-cell__value--types">
              {types.length
                ? types.map(t => <span key={t} className={`type-badge type-${t}`}>{t}</span>)
                : '—'}
            </span>
          </div>
          <div className="info-cell">
            <span className="info-cell__label">gen</span>
            <span className="info-cell__value">{badge.generation}</span>
          </div>
          <div className="info-cell">
            <span className="info-cell__label">obey to</span>
            <span className="info-cell__value">{badge.obedience ? `lv. ${badge.obedience}` : '—'}</span>
          </div>
          <div className="info-cell">
            <span className="info-cell__label">unlocks</span>
            <span className="info-cell__value">{badge.hm || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BadgesPage() {
  const { current: currentBadge, bump, open, close, prev, next } = useModalCycleNav(SECTIONED_BADGES);
  const { displayed: shownBadge, isClosing } = useModalAnimation(currentBadge);

  return (
    <div className="items-page">
      <h1>badges</h1>
      <p className="items-page__sub">{allBadges.length} badges across {SECTIONED_BADGES.length} regions</p>

      {SECTIONED_BADGES.map((section, sectionIdx) => (
        <div key={section.slug} className="items-section">
          <h2 className="items-section__label">{section.label}</h2>
          <div className="ball-grid">
            {section.items.map((b, index) => (
              <button key={b.id} className="ball-thumb"
                      onClick={() => open(sectionIdx, index)}>
                {b.sprite && <img src={b.sprite} alt={b.name} loading="lazy" referrerPolicy="no-referrer" />}
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {shownBadge && (
        <BadgeModal badge={shownBadge} onClose={close} onPrev={prev} onNext={next} closing={isClosing} bump={bump} />
      )}
    </div>
  );
}
