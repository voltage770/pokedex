import ABILITIES from '../data/abilities.json';

export default function AbilityModal({ ability, onClose, closing = false }) {
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
