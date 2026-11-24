// "Help improve the maps": the once-a-day summary of one ski day (opt-in; see docs/PRIVACY_DATA.md). Pure, unit tested
// in tests/map-evidence.test.js. src/main.js sends it the day after (flushContrib).
import { ST } from './tracker.js';

const NEAR_KINDS = ['lodge', 'parking', 'food', 'service', 'shelter'];

/** Places where GPS points never count: lodges, car parks, food, services and shelters (70 m), and buildings (their size + 30 m). */
export function blockedPlaces(R) {
  const near = [];
  for (const p of R.pois || []) if (NEAR_KINDS.includes(p.kind)) near.push([p.x, p.y, 70]);
  for (const b of R.buildings || []) {
    const q = b.pts; let cx = 0, cy = 0, r = 0;
    for (let k = 0; k < q.length; k += 2) { cx += q[k]; cy += q[k + 1]; }
    cx /= q.length / 2; cy /= q.length / 2;
    for (let k = 0; k < q.length; k += 2) r = Math.max(r, Math.hypot(q[k] - cx, q[k + 1] - cy));
    near.push([cx, cy, r + 30]);
  }
  return near;
}

/**
 * Runs skied, 20 m squares skied off the mapped runs, and squares skied on them (only their number is ever sent). Only
 * what looks like skiing counts: moving at ski speed on the ground the map covers, not on a lift, not standing still,
 * and not in or near lodges, other buildings or car parks. That leaves out home, the car, the lodge and the lift line,
 * wherever in the day they come. Squares (on or off the runs) count only while going downhill.
 * P: tracked points [time ms, x, y, z, state, lift?]. trailOf(x, y, prev) -> {t} or null (src/ontrail.js trailAt).
 */
export function daySummary(P, { trailOf, inBounds, near = [] }, runs, cells, onCells) {
  const blocked = (x, y) => near.some(([bx, by, r]) => Math.abs(x - bx) < r && Math.abs(y - by) < r && Math.hypot(x - bx, y - by) < r);
  let prev = null;
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], p = P[i], c = P[i + 1];
    const [, x, y, , st] = p;
    if (st !== ST.SKI || p[5] || c[5] || !inBounds(x, y)) { prev = null; continue; }
    const dt = (c[0] - a[0]) / 1000, v = dt > 0 ? Math.hypot(c[1] - a[1], c[2] - a[2]) / dt : 0;
    if (v < 2.5 || v > 40 || blocked(x, y)) { prev = null; continue; }   // standing, walking, or a GPS jump
    const on = trailOf(x, y, prev);
    prev = on?.t || null;
    if (on) runs.add(on.t.id);
    if (c[3] - a[3] >= 1) continue;
    const sq = `${Math.floor(x / 20)},${Math.floor(y / 20)}`;
    (on ? onCells : cells).add(sq);
  }
}

/** The body POSTed to /api/contrib: no time, no order, no identity; `on` is a count only. */
export function contribBody(resort, key, day, runs, cells, onCells) {
  return { resort, key, day, runs: [...runs].slice(0, 400), cells: [...cells].slice(0, 6000).map((c) => c.split(',').map(Number)), on: Math.min(onCells.size, 20000) };
}
