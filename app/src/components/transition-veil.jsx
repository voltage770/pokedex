import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { VEIL_EVENT } from '../utils/cross-modal-nav';

// MOCKUP — global dim overlay used by the `dip` and `curtain` cross-modal
// transition modes. listens for the shared `xfade-veil` window event and
// drives its own opacity imperatively (no React re-render mid-transition).
//
// rendered via portal at document.body so its position:fixed isn't trapped
// by any ancestor with transform/will-change creating a containing block —
// matches the pattern already used by .ptr (pull-to-refresh).
//
// timing per mode:
//   dip-up      — opacity 0 → 0.85 over 80ms (fade in)
//   dip-down    — opacity 0.85 → 0 over 100ms (fade out)
//   curtain-up  — same as dip-up (fade-in is identical)
//   curtain-down — opacity 0.85 → 0 over 120ms (slightly longer fade-out
//                  so the cover-down feels deliberate, not snappy)
//
// transition is set inline so each mode picks its own duration cleanly.

const FADE_IN_MS    = 80;
const FADE_OUT_DIP  = 100;
const FADE_OUT_CURT = 120;
const VEIL_OPACITY  = 0.85;

export default function TransitionVeil() {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      const el = ref.current;
      if (!el) return;
      const mode = e.detail?.mode;
      switch (mode) {
        case 'dip-up':
        case 'curtain-up':
          el.style.transition = `opacity ${FADE_IN_MS}ms ease-out`;
          el.style.opacity = String(VEIL_OPACITY);
          el.style.pointerEvents = 'auto';
          break;
        case 'dip-down':
          el.style.transition = `opacity ${FADE_OUT_DIP}ms ease-in`;
          el.style.opacity = '0';
          // re-disable pointer events after fade-out so the layer doesn't
          // accidentally swallow clicks while invisible
          setTimeout(() => { el.style.pointerEvents = 'none'; }, FADE_OUT_DIP);
          break;
        case 'curtain-down':
          el.style.transition = `opacity ${FADE_OUT_CURT}ms ease-in`;
          el.style.opacity = '0';
          setTimeout(() => { el.style.pointerEvents = 'none'; }, FADE_OUT_CURT);
          break;
      }
    };
    window.addEventListener(VEIL_EVENT, handler);
    return () => window.removeEventListener(VEIL_EVENT, handler);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      className="transition-veil"
      aria-hidden="true"
      style={{
        position:      'fixed',
        inset:         0,
        background:    '#000',
        opacity:       0,
        pointerEvents: 'none',
        // z-index above modals (modal overlays are 500). veil needs to cover
        // the modal during cross-page navigation since we're hiding the
        // swap underneath.
        zIndex:        900,
      }}
    />,
    document.body,
  );
}
