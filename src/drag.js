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
  let st = null, quietUntil = 0;
  // A tap or drag on the strip can move the panel under the finger; on iPhones the click that
  // follows lands on whatever is there now (a mountain in the list). Swallow clicks for a moment.
  panel.addEventListener('click', (e) => {
    if (performance.now() < quietUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
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
    if (!moved) {
      if (e.type === 'pointerup' && opts.onTap?.()) quietUntil = performance.now() + 500;
      return;
    }
    quietUntil = performance.now() + 500;
    if (dy > 70) opts.onDown?.();
    else if (dy < -40) opts.onUp?.();
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}

/**
 * A panel with several resting places (the home screen's mountain list: whole screen, normal, shrunk to its bar).
 * The panel follows the finger while its top strip is dragged, and on release snaps to the nearest resting place,
 * or to the next one in the direction of a quick flick. Positions are px from the top of the screen.
 *   zone()            height in px of the strip at the top of the panel that can be dragged
 *   stops()           { name: position } of the resting places, worked out when a drag starts
 *   current()         the name of the place the panel rests at now
 *   move(p, stops)    put the panel's top at p while dragging
 *   settle(name, p)   called on release with the place to go to (p is where the finger left it)
 *   onTap()           a plain tap in the strip; return true when it did something
 */
export function dragStops(panel, opts) {
  let st = null, quietUntil = 0;
  panel.addEventListener('click', (e) => {
    if (performance.now() < quietUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  panel.addEventListener('pointerdown', (e) => {
    const r = panel.getBoundingClientRect();
    if (e.clientY - r.top > opts.zone()) return;
    if (e.target.closest('button:not(.grab), input, a, label, select')) return;
    st = { id: e.pointerId, y0: e.clientY, moved: false, trail: [{ t: e.timeStamp, y: e.clientY }] };
  });
  panel.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dy = e.clientY - st.y0;
    if (!st.moved && Math.abs(dy) < 6) return;
    if (!st.moved) {
      st.moved = true;
      st.stops = opts.stops();
      st.p0 = st.stops[opts.current()];
      const ps = Object.values(st.stops);
      st.min = Math.min(...ps); st.max = Math.max(...ps);
      try { panel.setPointerCapture?.(e.pointerId); } catch { /* the pointer has already gone */ }
      panel.classList.add('dragging');
    }
    st.trail.push({ t: e.timeStamp, y: e.clientY });
    while (st.trail.length > 2 && e.timeStamp - st.trail[0].t > 100) st.trail.shift();
    // past the first and last resting place the panel only gives a little (a third of the finger's travel)
    let p = st.p0 + dy;
    if (p < st.min) p = st.min - (st.min - p) / 3;
    if (p > st.max) p = st.max + (p - st.max) / 3;
    st.p = p;
    opts.move(p, st.stops);
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    panel.classList.remove('dragging');
    if (!s.moved) {
      if (e.type === 'pointerup' && opts.onTap?.()) quietUntil = performance.now() + 500;
      return;
    }
    quietUntil = performance.now() + 500;
    const first = s.trail[0], last = s.trail[s.trail.length - 1];
    const v = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;   // px per ms, down is positive
    const list = Object.entries(s.stops).sort((a, b) => a[1] - b[1]);
    let to;
    if (v > 0.45) to = list.find(([, q]) => q > s.p + 1) || list[list.length - 1];
    else if (v < -0.45) to = [...list].reverse().find(([, q]) => q < s.p - 1) || list[0];
    else to = list.reduce((a, b) => (Math.abs(b[1] - s.p) < Math.abs(a[1] - s.p) ? b : a));
    opts.settle(to[0], s.p);
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}
