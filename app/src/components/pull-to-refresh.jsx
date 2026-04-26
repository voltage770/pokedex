import { useEffect, useRef, useState } from 'react';

// pull-to-refresh affordance for ios standalone (home-screen) mode where the
// browser reload button doesn't exist. ignored in regular safari since
// safari has its own scroll/url-bar interaction at the top of a page that
// pull-to-refresh would fight with.
//
// usage:
//   <PullToRefresh onRefresh={async () => { ... }} />
//
// onRefresh should return a promise; the spinner stays in its "refreshing"
// state until that promise settles. errors are swallowed (caller should
// handle their own error state — the indicator just hides).

const PULL_THRESHOLD = 60;     // px past which release triggers refresh
const MAX_PULL       = 100;    // hard cap on visual pull distance
const RESISTANCE     = 0.5;    // 1.0 = 1:1 finger tracking; <1 = "heavy" feel
const HOLD_OFFSET    = 50;     // indicator y-position while refreshing

const isStandalone = () =>
  (typeof window !== 'undefined') && (
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator?.standalone === true
  );

export default function PullToRefresh({ onRefresh, enabled = true }) {
  const [pull, setPull]             = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // refs mirror state for closure capture inside the effect's event handlers,
  // so we can register the listeners once on mount instead of rebinding them
  // on every state change.
  const startY         = useRef(null);
  const pullRef        = useRef(0);
  const refreshingRef  = useRef(false);
  useEffect(() => { pullRef.current       = pull;       }, [pull]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    if (!enabled || !isStandalone()) return;

    const onStart = (e) => {
      // only initiate a pull from the very top of the page; any scroll offset
      // means the user wants to scroll up, not refresh.
      if (window.scrollY > 0 || refreshingRef.current) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e) => {
      if (startY.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        if (pullRef.current !== 0) setPull(0);
        return;
      }
      const dampened = Math.min(dy * RESISTANCE, MAX_PULL);
      setPull(dampened);
      // suppress ios native rubber-band so we own the visual feedback
      if (dy > 6) e.preventDefault();
    };

    const onEnd = async () => {
      if (startY.current == null) return;
      const finalPull = pullRef.current;
      startY.current = null;
      if (finalPull >= PULL_THRESHOLD) {
        setRefreshing(true);
        try { await onRefresh(); } catch { /* caller handles error state */ }
        setRefreshing(false);
      }
      setPull(0);
    };

    window.addEventListener('touchstart',  onStart, { passive: true  });
    window.addEventListener('touchmove',   onMove,  { passive: false });
    window.addEventListener('touchend',    onEnd,   { passive: true  });
    window.addEventListener('touchcancel', onEnd,   { passive: true  });
    return () => {
      window.removeEventListener('touchstart',  onStart);
      window.removeEventListener('touchmove',   onMove);
      window.removeEventListener('touchend',    onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, onRefresh]);

  const visible = pull > 4 || refreshing;
  if (!visible) return null;

  const ready = pull >= PULL_THRESHOLD;
  const y     = refreshing ? HOLD_OFFSET : pull;

  // snap-back / snap-forward animation when transitioning between states
  // (idle → refreshing or refreshing → idle); during active dragging the
  // movement should track the finger 1:1 with no transition.
  const transitioning = refreshing && y === HOLD_OFFSET;

  return (
    <div
      className={`ptr ${refreshing ? 'ptr--refreshing' : ''} ${ready ? 'ptr--ready' : ''}`}
      style={{
        transform:  `translateY(${y}px)`,
        transition: transitioning ? 'transform .25s ease' : 'none',
      }}
      aria-hidden="true"
    >
      <span className="ptr__icon">↻</span>
    </div>
  );
}
