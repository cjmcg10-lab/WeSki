// Which run is someone on? A run on the map is a thin centre line, but on the snow it is a strip
// 20 to 80 m wide, and a phone's GPS wanders 5 to 20 m. So a point counts as on a run when it is
// within the run's half-width plus the GPS error of the line, or inside the run's outline where
// the map has one; and a run once found is kept while the skier stays near it (hysteresis), so
// two runs side by side do not flicker back and forth.
import { nearestOnLine } from './geo.js';

const HALF = 22;        // half-width of a run with no measured width (metres)
const HALF_GLADE = 18;  // glades are narrower lines through the trees
const GPS_MAX = 30;     // GPS error counted at most this much
const KEEP = 15;        // extra reach for the run you were already on

/** Half-width of a run in metres: measured (`w`, full width) when the build has it, else typical. */
export function halfWidth(t) {
  if (t.w) return Math.max(8, t.w / 2);
  return t.glade ? HALF_GLADE : HALF;
}

function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * The run at (x, y), or null. opts: acc = GPS accuracy in metres (default 10), prev = the run
 * returned last time for the same person (kept while they stay near it).
 * Returns {t, d, edge}: the trail, the distance to its centre line, and the distance beyond its
 * edge (0 when on the run itself).
 */
export function trailAt(resort, x, y, { acc = 10, prev = null } = {}) {
  const gps = Math.min(GPS_MAX, Math.max(5, acc || 10));
  const outlined = new Set();
  for (const a of resort.areas || []) if (a.name && a.pts.length >= 6 && inside(a.pts, x, y)) outlined.add(a.name);
  let best = null, kept = null;
  for (const t of resort.trails) {
    const n = nearestOnLine(t.pts, x, y);
    const half = halfWidth(t);
    const out = t.name && outlined.has(t.name);
    if (!out && n.d > half + gps + KEEP) continue;
    const edge = out ? 0 : Math.max(0, n.d - half);
    const c = { t, d: n.d, edge };
    if (prev && t.id === prev.id && edge <= gps + KEEP) kept = c;
    if (edge > gps) continue;
    if (!best || edge < best.edge || (edge === best.edge && n.d < best.d)) best = c;
  }
  // stay on the run you were on unless another one is clearly closer
  if (kept && (!best || best.t.id === kept.t.id || kept.edge <= best.edge + 8)) return kept;
  return best;
}
