import { useEffect, useState } from 'react';

// keeps a modal mounted long enough to play a close animation that mirrors its open animation.
// pass any value — truthy opens, falsy closes. during close, the last truthy value stays in
// `displayed` so content (e.g. selected item) is preserved while the animation plays.
// consumers render: `{displayed && <Modal … className={isClosing ? 'closing' : ''} />}`.
export function useModalAnimation(value, duration = 250) {
  const [displayed, setDisplayed] = useState(value || null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (value) {
      setDisplayed(value);
      setIsClosing(false);
      return;
    }
    if (!displayed) return;
    setIsClosing(true);
    const t = setTimeout(() => {
      setDisplayed(null);
      setIsClosing(false);
    }, duration);
    return () => clearTimeout(t);
    // displayed intentionally omitted — only `value` should drive transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return { displayed, isClosing };
}
