import { useEffect } from 'react';
import ABILITIES from '../data/abilities.json';

export default function AbilityModal({ ability, onClose, closing = false }) {
  // close on Escape — keyboard parity with the cycling modals.
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={`ability-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className="ability-modal" onClick={e => e.stopPropagation()}>
        <div className="ability-modal-header">
          <span className="ability-modal-name">{ability.name.replace(/-/g, ' ')}</span>
          {ability.is_hidden && <em className="ability-modal-hidden">hidden</em>}
          <button className="ability-modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="ability-modal-desc">
          {ABILITIES[ability.name] || 'no description available.'}
        </p>
      </div>
    </div>
  );
}
