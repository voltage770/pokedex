// shared imperative scale pulse used across the site whenever content inside
// a stable container changes (cycling modals, pokemon detail prev/next, form
// switches). gentler than a typical click-feedback bump — the goal is "the
// content updated" rather than "you pressed something". one place to tune so
// all surfaces stay consistent.
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
