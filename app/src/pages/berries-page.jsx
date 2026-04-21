import berries from '../data/berries.json';

const FLAVOR_ORDER = ['spicy', 'dry', 'sweet', 'bitter', 'sour'];

function formatName(slug) {
  return slug.replace(/-/g, ' ');
}

function BerryCard({ berry }) {
  const hasFlavors = FLAVOR_ORDER.some(f => berry.flavors[f]);

  return (
    <div className="item-card">
      {berry.sprite && (
        <img className="item-card__sprite" src={berry.sprite} alt={berry.name} />
      )}
      <div className="item-card__body">
        <h2 className="item-card__name">{formatName(berry.name)} berry</h2>
        {berry.effect && <p className="item-card__effect">{berry.effect}</p>}
        {berry.flavor_text && <p className="item-card__flavor">{berry.flavor_text}</p>}

        {hasFlavors && (
          <div className="berry-flavors">
            {FLAVOR_ORDER.map(f => berry.flavors[f] ? (
              <span key={f} className="berry-flavor">
                {f} <strong>{berry.flavors[f]}</strong>
              </span>
            ) : null)}
          </div>
        )}

        <div className="item-card__meta">
          {berry.natural_gift_type && (
            <span className={`type-badge type-${berry.natural_gift_type}`}>
              {berry.natural_gift_type}
            </span>
          )}
          {berry.natural_gift_power > 0 && <span>power {berry.natural_gift_power}</span>}
          {berry.growth_time > 0 && <span>{berry.growth_time}h growth</span>}
          {berry.size > 0 && <span>{berry.size / 10} cm</span>}
          {berry.firmness && <span>{berry.firmness}</span>}
        </div>
      </div>
    </div>
  );
}

export default function BerriesPage() {
  return (
    <div className="items-page">
      <h1>berries</h1>
      <p className="items-page__sub">{berries.length} berry types</p>
      <div className="items-grid">
        {berries.map(b => <BerryCard key={b.id} berry={b} />)}
      </div>
    </div>
  );
}
