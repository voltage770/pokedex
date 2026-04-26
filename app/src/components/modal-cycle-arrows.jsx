// chevron pair rendered inside any cycling modal's overlay. anchored to the
// viewport edges (not the modal box) so they sit clear of content on every
// breakpoint without needing modal-width math. clicking them calls the same
// prev/next handlers the keyboard ← → and touch swipes already use.
export default function ModalCycleArrows({ onPrev, onNext }) {
  const handle = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <>
      <button
        type="button"
        className="modal-cycle-arrow modal-cycle-arrow--prev"
        onClick={handle(onPrev)}
        aria-label="previous"
      >‹</button>
      <button
        type="button"
        className="modal-cycle-arrow modal-cycle-arrow--next"
        onClick={handle(onNext)}
        aria-label="next"
      >›</button>
    </>
  );
}
