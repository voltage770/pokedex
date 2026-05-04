import { useEffect } from 'react';
import ABILITIES from '../data/abilities.json';

export default function AbilityModal({ ability, onClose, closing = false }) {
  // close on Escape — keyboard parity with the cycling modals.
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // abilities.json was previously a flat slug→string map. now it's
  // slug→{ effect, name_jp, romaji } so JP names can be rendered
  // alongside the English ability name. fall back gracefully when the
  // slug isn't in the map (newer abilities yet to be re-fetched).
  const data = ABILITIES[ability.name] || {};

  return (
    <div className={`ability-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className="ability-modal" onClick={e => e.stopPropagation()}>
        <div className="ability-modal-header">
          <span className="ability-modal-name">
            {ability.name.replace(/-/g, ' ')}
            {data.name_jp && (
              <small className="jp-subtitle">
                {data.name_jp}{data.romaji ? ` [${data.romaji}]` : ''}
              </small>
            )}
          </span>
          {ability.is_hidden && <em className="ability-modal-hidden">hidden</em>}
          <button className="ability-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="ability-modal-desc">
          {data.effect || 'no description available.'}
        </p>
      </div>
    </div>
  );
}
