import { useEffect } from 'react';
import { getAppScroller } from '../utils/app-scroll';

// locks the page's scroll container while `locked` is true. used by modals
// and dropdowns to prevent the underlying page from scrolling when the user
// touches / drags on the overlay.
//
// the scroll container is `.app-scroll` (see _base.scss SCROLL ARCHITECTURE),
// not the body itself — body has overflow:hidden permanently. flipping the
// container's overflow to hidden freezes scroll without changing scrollTop,
// so closing the lock returns the user to the exact position they left.
//
// kept the `useBodyScrollLock` name even though it no longer touches body
// directly — same intent (lock the page's scroll), and renaming would just
// churn imports across the consumer hooks/components.
export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;
    const scroller = getAppScroller();
    if (!scroller) return;
    const prev = scroller.style.overflow;
    scroller.style.overflow = 'hidden';
    return () => { scroller.style.overflow = prev; };
  }, [locked]);
}
