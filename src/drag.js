// Pull a panel down by its top strip (the grab bar and title) to close or shrink it, and up to
// bring it back. Buttons and fields inside the strip still work normally: a drag only starts
// once the finger has moved, and taps on controls are left alone.

/**
 * panel: the element that moves. opts:
 *   zone       height in px of the strip at the top of the panel that can be dragged (default 64)
 *   offset()   current resting offset in px (for a panel that is already shrunk), default 0
 *   onDown()   called after a pull down of more than about 70 px
 *   onUp()     called after a push up of more than about 40 px (optional)
 *   onTap()    called on a plain tap in the strip (optional)
 */
export function dragPanel(panel, opts) {
  const zone = opts.zone ?? 64;
  let st = null;
  panel.addEventListener('pointerdown', (e) => {
    const r = panel.getBoundingClientRect();
    if (e.clientY - r.top > zone) return;
    if (e.target.closest('button:not(.grab), input, a, label, select')) return;
    st = { id: e.pointerId, y0: e.clientY, base: opts.offset?.() || 0, moved: false };
  });
  panel.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dy = e.clientY - st.y0;
    if (!st.moved && Math.abs(dy) < 6) return;
    if (!st.moved) { st.moved = true; panel.setPointerCapture?.(e.pointerId); panel.classList.add('dragging'); }
    const y = Math.max(opts.onUp ? -st.base : 0, dy);
    panel.style.transform = `translateY(${st.base + y}px)`;
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dy = e.clientY - st.y0, moved = st.moved;
    st = null;
    panel.classList.remove('dragging');
    panel.style.transform = '';
    if (!moved) { if (e.type === 'pointerup') opts.onTap?.(); return; }
    if (dy > 70) opts.onDown?.();
    else if (dy < -40) opts.onUp?.();
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}
