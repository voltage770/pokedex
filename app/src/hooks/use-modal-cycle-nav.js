import { useCallback, useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from './use-body-scroll-lock';

// shared modal navigation behavior for the berry / pokeball / badge pages (and
// any future item-grid page with a paginated modal). bundles three concerns:
//
//   1. arrow-key bindings on window for Esc / ←  / →  (desktop keyboard nav)
//   2. modulo cycling inside a sectioned list (sectionIdx + index)
//   3. a `bump` counter + direction for the WAAPI pulse animation that fires
//      on every cycle — same pulse on keyboard nav and on tappable arrows.
//
// touch users get tappable prev/next arrow buttons rendered inside each
// modal page (see <ModalCycleArrows> usage in badges-page / berries-page /
// pokeballs-page). the previous swipe gesture was removed in favor of
// these arrows — swipes felt either glitchy (with mid-flight interruption)
// or sluggish (without), and explicit tap targets are clearer + more
// accessible across mobile + tablet.
//
// usage from the page component:
//
//   const { current, bump, modalRef, open, close, prev, next } =
//     useModalCycleNav(SECTIONED_ITEMS);
//
//   // pass modalRef + bump to the Modal component; the page's modal
//   // useEffect runs the pulse animation on bump.n change.
//   <Modal modalRef={modalRef} item={current} bump={bump} ... />
//   // and render arrows next to the modal:
//   <button onClick={prev}>‹</button> <button onClick={next}>›</button>

// initialId (optional) lets a page that arrived via cross-modal navigation
// open a specific item's modal on first render — the lookup runs inside
// useState's lazy initializer so the modal is in the DOM at the very first
// commit. that's load-bearing for the View Transitions cross-modal path:
// `flushSync(navigate)` produces a synchronous render, and the browser
// snapshots the new DOM right after. if the initial render didn't already
// have the modal open, the snapshot would land on a blank destination and
// the crossfade would lose the shared-element effect.
export function useModalCycleNav(sections, initialId = null) {
  const [selected, setSelected] = useState(() => {
    if (!initialId) return null;
    for (let s = 0; s < sections.length; s++) {
      const idx = sections[s].items.findIndex(i => i.id === initialId);
      if (idx !== -1) return { sectionIdx: s, index: idx };
    }
    return null;
  });
  const [bump, setBump] = useState({ n: 0, dir: 0 });

  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const modalRef = useRef(null);

  const open = useCallback((sectionIdx, index) => {
    setSelected({ sectionIdx, index });
    // reset bump so the new modal mounts with bump.n === 0 — otherwise the
    // modal's `useEffect(... [bump.n])` would fire the cycle-pulse animation
    // on first render (using whatever value bump held at the previous close),
    // showing a stray pulse on top of the open-pop anim.
    setBump({ n: 0, dir: 0 });
  }, []);

  const close = useCallback(() => setSelected(null), []);

  const cycle = useCallback((delta) => {
    setSelected(s => {
      if (!s) return s;
      const len = sectionsRef.current[s.sectionIdx].items.length;
      return { ...s, index: ((s.index + delta) % len + len) % len };
    });
    setBump(b => ({ n: b.n + 1, dir: delta }));
  }, []);

  const prev = useCallback(() => cycle(-1), [cycle]);
  const next = useCallback(() => cycle(1),  [cycle]);

  // global keyboard shortcuts. only bind when the modal is open so other pages
  // / inputs aren't intercepted. Esc / ← / → are the universal cycling triad.
  useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      if (e.key === 'Escape')          close();
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, close, prev, next]);

  // body scroll lock while any modal is open — without it, taps that drift
  // even a few pixels can scroll the underlying page, which feels like the
  // modal is wobbling under the user's finger. cycling between items keeps
  // the lock; only flips off when the modal closes entirely.
  useBodyScrollLock(!!selected);

  const current = selected
    ? sections[selected.sectionIdx].items[selected.index]
    : null;

  return { selected, current, bump, modalRef, open, close, prev, next };
}
