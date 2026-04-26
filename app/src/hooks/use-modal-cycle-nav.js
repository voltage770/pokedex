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

  const current = selected
    ? sections[selected.sectionIdx].items[selected.index]
    : null;

  return { selected, current, bump, open, close, prev, next };
}
