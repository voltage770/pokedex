import { useCallback, useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from './use-body-scroll-lock';

// shared modal navigation behavior for the berry / pokeball / badge pages (and
// any future item-grid page with a paginated modal). bundles four concerns:
//
//   1. arrow-key bindings on window for Esc / ←  / →
//   2. modulo cycling inside a sectioned list (sectionIdx + index)
//   3. a `bump` counter + direction for the WAAPI pulse animation that fires
//      on keyboard / arrow-button cycles (NOT swipes — see #4)
//   4. drag-to-swipe gesture: the modal box translates with the user's finger
//      horizontally, then on release either slides out → in to the next item
//      (commit) or springs back to center (cancel). swipes set `bump` silently
//      so the pulse animation doesn't double-up on the slide animation.
//
// usage from the page component:
//
//   const { current, bump, modalRef, open, close, prev, next } =
//     useModalCycleNav(SECTIONED_ITEMS);
//
//   // pass modalRef down to the Modal component which attaches it to the
//   // outer box element. the hook reads modalRef.current to apply transforms
//   // directly via DOM manipulation (bypasses React state for 60fps tracking).
//   <Modal modalRef={modalRef} item={current} bump={bump} ... />
//
// modalRef is owned by the hook so swipe + pulse share the same element ref.
// the Modal component just spreads it onto its outer container.

const SWIPE_THRESHOLD   = 50;   // px of dx required to commit the cycle
const HORIZONTAL_BIAS   = 1.4;  // |dx| must exceed |dy| × this to count as horizontal
const COMMIT_OUT_MS     = 180;  // slide-out duration on commit
const COMMIT_IN_MS      = 220;  // slide-in duration on commit
const SPRING_BACK_MS    = 200;  // spring-back duration on cancel
const DIRECTION_LOCK_PX = 8;    // |dx| before we lock in horizontal vs vertical

export function useModalCycleNav(sections) {
  const [selected, setSelected] = useState(null); // { sectionIdx, index } | null
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

  // `silent` skips the bump increment so swipe-driven cycles don't also fire
  // the pulse animation (the slide animation is the visual feedback there).
  const cycle = useCallback((delta, { silent = false } = {}) => {
    setSelected(s => {
      if (!s) return s;
      const len = sectionsRef.current[s.sectionIdx].items.length;
      return { ...s, index: ((s.index + delta) % len + len) % len };
    });
    if (!silent) setBump(b => ({ n: b.n + 1, dir: delta }));
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

  // body scroll lock while any modal is open. without this, an attempted
  // horizontal swipe on mobile that has even a few px of vertical drift
  // scrolls the page underneath the modal, which feels like the modal is
  // wobbling up/down. cycling between items keeps the lock — only flips
  // off when the modal closes entirely.
  useBodyScrollLock(!!selected);

  // touch drag-to-swipe — modal follows the finger horizontally, release
  // commits or springs back. listeners live at the document level so the
  // gesture is forgiving (start outside the modal box still counts), but
  // the visual transform applies to the modal element via modalRef.
  //
  // bound on every viewport size. mouse / keyboard users on desktop get
  // the keyboard ←/→ handler above; touch users on phone or tablet get
  // this swipe gesture. the touch listeners only fire on actual touch
  // events, so non-touch devices are unaffected by their presence.
  //
  // dep array uses `!!selected` instead of `selected` so this effect only
  // re-binds on open/close, not on every cycle (selected.index changes).
  // re-binding mid-animation could drop in-flight WAAPI handlers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;

    let startX = 0, startY = 0;
    let tracking = false;
    let dragging = false;
    let committing = false;  // lock during slide-out → slide-in window
    let raf = null;

    const writeX = (px, instant = true) => {
      const el = modalRef.current;
      if (!el) return;
      el.style.transition = instant ? 'none' : '';
      el.style.transform = `translateX(${px}px)`;
    };

    const clearTransform = () => {
      const el = modalRef.current;
      if (!el) return;
      el.style.transform = '';
      el.style.transition = '';
    };

    const onStart = (e) => {
      if (committing || e.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      dragging = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onMove = (e) => {
      if (!tracking || committing) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // wait until movement crosses the lock threshold, then decide whether
      // this is a horizontal swipe (we own it) or vertical (let it scroll).
      if (!dragging) {
        if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
        if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) {
          tracking = false;  // vertical-dominant — abandon
          return;
        }
        dragging = true;
      }

      // resistance past 50% of viewport width — drags farther than that feel
      // increasingly heavy so the modal can't be flung clean off the screen.
      const screenW = window.innerWidth;
      const half = screenW * 0.5;
      const damped = Math.abs(dx) > half
        ? Math.sign(dx) * (half + (Math.abs(dx) - half) * 0.3)
        : dx;

      if (raf == null) {
        raf = requestAnimationFrame(() => {
          raf = null;
          writeX(damped);
        });
      }
    };

    const onEnd = (e) => {
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      if (!tracking) return;
      tracking = false;
      const wasDragging = dragging;
      dragging = false;
      if (!wasDragging) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const el = modalRef.current;
      if (!el) return;

      const screenW = window.innerWidth;
      const passed = Math.abs(dx) >= SWIPE_THRESHOLD;

      if (passed) {
        committing = true;
        const sign = dx > 0 ? 1 : -1;

        // slide-out: from current position to off-screen in swipe direction
        const out = el.animate(
          [{ transform: `translateX(${dx}px)` },
           { transform: `translateX(${sign * screenW}px)` }],
          { duration: COMMIT_OUT_MS, easing: 'ease-in', fill: 'forwards' }
        );

        out.onfinish = () => {
          // switch to next/prev item silently — slide handles the visual,
          // we don't want the pulse to also fire.
          cycle(sign > 0 ? -1 : 1, { silent: true });

          // wait for React to commit the new content, then jump the box to
          // the opposite edge and animate it back to center.
          requestAnimationFrame(() => {
            const el2 = modalRef.current;
            if (!el2) { committing = false; return; }
            el2.style.transition = 'none';
            el2.style.transform  = `translateX(${-sign * screenW}px)`;

            requestAnimationFrame(() => {
              const inAnim = el2.animate(
                [{ transform: `translateX(${-sign * screenW}px)` },
                 { transform: 'translateX(0)' }],
                { duration: COMMIT_IN_MS, easing: 'ease-out', fill: 'forwards' }
              );
              inAnim.onfinish = () => {
                clearTransform();
                committing = false;
              };
            });
          });
        };
      } else {
        // spring back to center
        const back = el.animate(
          [{ transform: `translateX(${dx}px)` },
           { transform: 'translateX(0)' }],
          { duration: SPRING_BACK_MS, easing: 'ease-out', fill: 'forwards' }
        );
        back.onfinish = clearTransform;
      }
    };

    document.addEventListener('touchstart',  onStart, { passive: true });
    document.addEventListener('touchmove',   onMove,  { passive: true });
    document.addEventListener('touchend',    onEnd,   { passive: true });
    document.addEventListener('touchcancel', onEnd,   { passive: true });
    return () => {
      document.removeEventListener('touchstart',  onStart);
      document.removeEventListener('touchmove',   onMove);
      document.removeEventListener('touchend',    onEnd);
      document.removeEventListener('touchcancel', onEnd);
      if (raf != null) cancelAnimationFrame(raf);
      clearTransform();
    };
  }, [!!selected, cycle]);

  const current = selected
    ? sections[selected.sectionIdx].items[selected.index]
    : null;

  return { selected, current, bump, modalRef, open, close, prev, next };
}
