// shared imperative scale pulse used across the site whenever content inside
// a stable container changes (cycling modals, pokemon detail prev/next).
// gentler than a typical click-feedback bump — the goal is "the content
// updated" rather than "you pressed something". one place to tune so all
// surfaces stay consistent.
export function pulseElement(el, options = {}) {
  if (!el) return null;
  const {
    scale    = 1.015,
    duration = 300,
    easing   = 'ease-in-out',
    offset   = 0.35,
  } = options;
  return el.animate(
    [
      { transform: 'scale(1)' },
      { transform: `scale(${scale})`, offset },
      { transform: 'scale(1)' },
    ],
    { duration, easing },
  );
}

// soft opacity dip used when the same container's contents update but the
// container itself doesn't move — e.g. switching between forms on a pokemon
// detail page. a scale pulse there reads as too jarring because the card
// is already huge and stable; fading the contents briefly to ~0.35 and back
// communicates "this just refreshed" without the size animation.
export function fadeElement(el, options = {}) {
  if (!el) return null;
  const {
    dip      = 0.35,
    duration = 260,
    easing   = 'ease-in-out',
  } = options;
  return el.animate(
    [
      { opacity: 1 },
      { opacity: dip, offset: 0.5 },
      { opacity: 1 },
    ],
    { duration, easing },
  );
}
