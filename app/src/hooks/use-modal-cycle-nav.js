import { useCallback, useEffect, useRef, useState } from 'react';

// shared modal navigation behavior for the berry + pokeball pages (and any future
// item-grid page with a paginated modal). bundles three concerns that were
// duplicated verbatim across both pages:
//
//   1. arrow-key bindings on window for Esc / ←  / →
//   2. modulo cycling inside a sectioned list (sectionIdx + index)
//   3. a `bump` counter + direction for the WAAPI pulse animation
//
// usage from the page component:
//
//   const sections = SECTIONED_ITEMS;
//   const { selected, current, bump, open, close, prev, next } =
//     useModalCycleNav(sections);
//
//   <button onClick={() => open(sectionIdx, index)} />
//   {current && <Modal item={current} onPrev={prev} onNext={next} onClose={close} bump={bump} />}
//
// `selected` is the raw {sectionIdx, index} or null. `current` is the resolved
// item (sections[selected.sectionIdx].items[selected.index]) or null. consumers
// typically pass `current` through useModalAnimation to also get close-anim latch.
export function useModalCycleNav(sections) {
  const [selected, setSelected] = useState(null); // { sectionIdx, index } | null
  const [bump, setBump] = useState({ n: 0, dir: 0 });

  // keep section list reference fresh without re-binding handlers on every render
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

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

  // touch-swipe cycling (mobile / ipad). swipe left → next, swipe right → prev,
  // matching the ios photo-viewer convention. only bind while the modal is
  // open so we don't intercept page scrolls elsewhere. requires the swipe to
  // be horizontally-dominant (dx > dy * 1.4) so vertical scrolls inside a
  // long modal aren't misread as cycle gestures, and a 50px threshold so
  // accidental small drags don't trigger.
  useEffect(() => {
    if (!selected) return;

    let startX = 0, startY = 0, tracking = false;
    const SWIPE_THRESHOLD = 50;
    const HORIZONTAL_BIAS = 1.4;

    const onStart = (e) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < SWIPE_THRESHOLD)            return;
      if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) return;
      if (dx < 0) next();
      else        prev();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend',   onEnd);
    };
  }, [selected, prev, next]);

  const current = selected
    ? sections[selected.sectionIdx].items[selected.index]
    : null;

  return { selected, current, bump, open, close, prev, next };
}
