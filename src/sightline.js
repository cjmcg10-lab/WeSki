// Can a spot on the 3D map be seen from the camera, or is a ridge in the way?
//
// Names on the map (runs, lifts, places) are drawn on a flat layer over the 3D picture, so without a check they show
// even when the mountain hides their spot. This walks the straight line from the label's spot to the camera over the
// height grid and reports how far above the ground the line stays. Only the ground counts: trees never hide a name
// (the same rule as the runs, which are seen through trees but not through ground).
//
// Pure functions, no three.js: map.js supplies the ground height and keeps the per-label state.

/** Metres the sight line must sink below the ground before a shown label is hidden ... */
export const HIDE_DEPTH = 4;
/** ... and the clearance it needs before a hidden label comes back (the gap between the two stops flicker at ridges). */
export const SHOW_CLEAR = 1;

/**
 * Lowest height of the line from target t to camera o above the ground, in metres (negative: the line goes under the
 * ground somewhere). o and t are {x, y, h}: map coordinates in metres and height. ground(x, y) gives the ground height
 * there (-Infinity where there is no ground data, which never blocks).
 * opts: skip = metres next to the target not checked (the slope the label stands on), maxSamples, minStep,
 * top = highest ground anywhere (once the line is above it nothing further can block), stopBelow = give up early once
 * the line is this far under the ground (the answer is "hidden" whatever comes after).
 */
export function clearance(ground, o, t, opts = {}) {
  const { skip = 30, maxSamples = 120, minStep = 14, top = Infinity, stopBelow = Infinity } = opts;
  const dx = o.x - t.x, dy = o.y - t.y, dh = o.h - t.h, L = Math.hypot(dx, dy, dh);
  if (!(L > skip)) return Infinity;
  const step = Math.max(minStep, (L - skip) / maxSamples), ux = dx / L, uy = dy / L, uh = dh / L;
  let min = Infinity;
  for (let s = skip; s < L; s += step) {
    const h = t.h + uh * s;
    if (h > top) { if (uh >= 0) break; continue; }     // above every mountain and still climbing: nothing more can block
    const g = ground(t.x + ux * s, t.y + uy * s);
    const c = h - g;
    if (c < min) { min = c; if (min < -stopBelow) break; }
  }
  return min;
}

/** Shown or hidden after a new clearance, with hysteresis: a label near a ridgeline keeps what it was. */
export function nextSeen(prev, clear) {
  if (prev == null) return clear > -(HIDE_DEPTH + SHOW_CLEAR) / 2;    // first look: split the difference
  return prev ? clear >= -HIDE_DEPTH : clear > SHOW_CLEAR;
}

/** Fade a label's opacity toward 1 (seen) or 0 (hidden) over `seconds`. */
export function fade(a, seen, dt, seconds = 0.25) {
  const k = Math.min(1, Math.max(0, dt) / seconds);
  return seen ? Math.min(1, a + k) : Math.max(0, a - k);
}

/**
 * Does a label tested with the camera at `at` need testing again now that the camera is at `cam`? Yes once the
 * camera has moved more than about 0.4% of its distance to the label (plus a metre), which moves a ridge's edge by
 * well under a pixel's worth of the hysteresis band.
 */
export function stale(at, cam, dist) {
  if (!at) return true;
  return Math.hypot(cam.x - at.x, cam.y - at.y, cam.h - at.h) > 1 + 0.004 * dist;
}
