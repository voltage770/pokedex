// MOCKUP — four interchangeable transition strategies for cross-modal page
// navigation (badge↔leader). a setting in the visuals dropdown picks which
// mode is active. once the user lands on a preferred one, the other three
// can be deleted along with this file.
//
// modes:
//   - snap     — current behavior: 200ms close delay, navigate, 60ms pulse on arrival
//   - view     — View Transitions API: snapshots old DOM, runs navigate
//                synchronously, browser crossfades to the new DOM. requires
//                `view-transition-name: shared-modal` on .ball-modal so the
//                browser morphs the modal box between pages instead of
//                cross-fading both at once. falls back to snap on browsers
//                without the API (older safari, firefox).
//   - dip      — quick global dim "flash": fade-in 80ms, navigate while opaque,
//                fade-out 100ms. no shared-element morph; the dim hides the swap.
//   - curtain  — held global dim: same as dip but holds the opaque phase 200ms
//                longer so the cover-up feels more deliberate. for users who
//                want the transition to read as a punctuation mark.

import { flushSync } from 'react-dom';

// veil component listens for these events on window. payload shape
// matches the strategy below.
export const VEIL_EVENT = 'xfade-veil';

// dispatch helper — keeps the listener API in sync between dispatcher and
// listener (no string-typo mismatches between strategies and the veil).
function dispatchVeil(detail) {
  window.dispatchEvent(new CustomEvent(VEIL_EVENT, { detail }));
}

// snap — fades the source modal out via inline opacity (clean, just opacity)
// rather than letting the .closing class trigger modal-pop-out's scale +
// translate animation. the bouncy geometry mid-close was reading as
// "leftover text getting trashed" because the modal was unmounted partway
// through scale-down. plain opacity has no transform, so the text doesn't
// shift sub-pixel as it fades.
function snap({ modalRef, onClose, navigate, toPath, openId }) {
  if (modalRef?.current) {
    modalRef.current.style.transition = 'opacity .2s ease-out';
    modalRef.current.style.opacity = '0';
  }
  setTimeout(() => {
    onClose();
    navigate(toPath, { state: { openId } });
  }, 200);
}

// view transitions API — the silkiest path on modern browsers.
function viewTransition({ navigate, toPath, openId, onClose }) {
  if (!document.startViewTransition) {
    // graceful fallback so a non-supporting browser doesn't break.
    snap({ onClose, navigate, toPath, openId });
    return;
  }
  document.startViewTransition(() => {
    // flushSync forces React to commit the route change synchronously so
    // the destination modal is in the DOM by the time view transitions
    // captures the "new" snapshot. the destination useModalCycleNav reads
    // location.state.openId in its useState initializer (not a useEffect),
    // so the modal renders open on first paint. if we don't flushSync,
    // the browser snapshots the new page BEFORE its modal has mounted
    // and the crossfade lands on a blank destination.
    flushSync(() => {
      navigate(toPath, { state: { openId } });
    });
  });
}

// dip — short veil flash. veil opacity 0 → 0.85 → 0 over ~180ms, navigate
// fires during the opaque phase. no shared element morph — covers the swap.
function dip({ onClose, navigate, toPath, openId }) {
  dispatchVeil({ mode: 'dip-up' });
  // navigate AFTER the veil reaches opaque (80ms in). closing the source
  // modal at the same time so it doesn't pop in behind the dim layer when
  // the destination page mounts.
  setTimeout(() => {
    onClose();
    navigate(toPath, { state: { openId } });
    // signal the destination side to fade the veil out — happens on the
    // next event loop tick so the destination modal has time to mount.
    setTimeout(() => dispatchVeil({ mode: 'dip-down' }), 30);
  }, 80);
}

// curtain — longer held veil. fade-in 80ms, hold 200ms, fade-out 120ms. the
// "punctuation" version — feels more deliberate than dip.
function curtain({ onClose, navigate, toPath, openId }) {
  dispatchVeil({ mode: 'curtain-up' });
  setTimeout(() => {
    onClose();
    navigate(toPath, { state: { openId } });
    setTimeout(() => dispatchVeil({ mode: 'curtain-down' }), 200);
  }, 80);
}

const STRATEGIES = { snap, view: viewTransition, dip, curtain };

// public api — the page's click handler calls this with the active mode.
// signature deliberately matches across strategies so swapping is a single
// dispatch lookup; the legacy snap path is preserved verbatim.
export function crossModalNavigate(mode, args) {
  const fn = STRATEGIES[mode] || snap;
  fn(args);
}
