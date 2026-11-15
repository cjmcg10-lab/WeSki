// Which trails has the skier been down? Matches recorded skiing (not lift rides, not stops)
// to the mapped trails.
import { nearestOnLine } from './geo.js';
import { ST } from './tracker.js';

const NEAR = 28;          // metres from a trail's centre line that still counts as "on it"

function boxes(resort) {
  return (resort._boxes ||= resort.trails.map((t) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < t.pts.length; i += 2) { x0 = Math.min(x0, t.pts[i]); x1 = Math.max(x1, t.pts[i]); y0 = Math.min(y0, t.pts[i + 1]); y1 = Math.max(y1, t.pts[i + 1]); }
    return [x0 - NEAR, x1 + NEAR, y0 - NEAR, y1 + NEAR];
  }));
}

/**
 * Add the skied distance of points[from..to) to `acc` (Map trailId -> metres).
 * Only segments recorded while skiing count.
 */
export function matchTrails(resort, points, from = 1, to = points.length, acc = new Map()) {
  const bx = boxes(resort);
  for (let i = Math.max(1, from); i < to; i++) {
    const a = points[i - 1], b = points[i];
    if (b[4] !== ST.SKI || b[5]) continue;
    const x = (a[1] + b[1]) / 2, y = (a[2] + b[2]) / 2;
    let best = -1, bd = NEAR;
    for (let k = 0; k < resort.trails.length; k++) {
      const q = bx[k];
      if (x < q[0] || x > q[1] || y < q[2] || y > q[3]) continue;
      const d = nearestOnLine(resort.trails[k].pts, x, y).d;
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) acc.set(best, (acc.get(best) || 0) + Math.hypot(b[1] - a[1], b[2] - a[2]));
  }
  return acc;
}

/** A trail segment counts as explored after 80 m on it, or 40% of a short one. */
export function exploredIds(resort, acc) {
  const ids = new Set();
  for (const [id, m] of acc) if (m >= Math.min(80, resort.trails[id].len * 0.4)) ids.add(id);
  return ids;
}

/** Named trails with their difficulty and whether any of their segments is in `ids`. */
export function trailChecklist(resort, ids) {
  const by = new Map();
  for (const t of resort.trails) {
    if (!t.name) continue;
    const e = by.get(t.name) || { name: t.name, d: t.d, done: false };
    e.d = Math.max(e.d, t.d);
    if (ids.has(t.id)) e.done = true;
    by.set(t.name, e);
  }
  return [...by.values()].sort((a, b) => a.d - b.d || a.name.localeCompare(b.name));
}
