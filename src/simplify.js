// Fewer points for lines drawn on the map, where they make no visible difference. Pure functions (tests/simplify.test.js).

/**
 * A run's points for drawing. Runs are stored with a point every ~9 m so they follow the ground; most of those points
 * sit on straight, even stretches. Keeps only the points needed for the drawn line to stay within tolXY metres of the
 * mapped line in plan, and within tolZ metres of the snow in height (the line floats 2.7-3.2 m above the snow, so it
 * never sinks into it). Douglas-Peucker on a combined error. P: flat [x, y, ...]; zAt(x, y): the snow height.
 * The first and last points are always kept. Returns P itself when there is nothing to gain.
 */
export function simplifyRun(P, zAt, tolXY = 2, tolZ = 1.5) {
  const n = P.length / 2;
  if (n < 4) return P;
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = zAt(P[2 * i], P[2 * i + 1]);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [0, n - 1];
  while (stack.length) {
    const hi = stack.pop(), lo = stack.pop();
    if (hi - lo < 2) continue;
    const ax = P[2 * lo], ay = P[2 * lo + 1], az = z[lo], dx = P[2 * hi] - ax, dy = P[2 * hi + 1] - ay, dz = z[hi] - az;
    const L2 = dx * dx + dy * dy || 1e-9;
    let best = 1, bi = -1;
    for (let k = lo + 1; k < hi; k++) {
      const f = Math.max(0, Math.min(1, ((P[2 * k] - ax) * dx + (P[2 * k + 1] - ay) * dy) / L2));
      const qx = ax + f * dx, qy = ay + f * dy, qz = az + f * dz;
      // 1 = exactly at the limit: off the mapped line in plan, off the snow under the chord, off the dropped point
      const e = Math.max(Math.hypot(P[2 * k] - qx, P[2 * k + 1] - qy) / tolXY, Math.abs(qz - zAt(qx, qy)) / tolZ, Math.abs(qz - z[k]) / tolZ);
      if (e > best) { best = e; bi = k; }
    }
    if (bi > 0) { keep[bi] = 1; stack.push(lo, bi, bi, hi); }
  }
  let m = 0;
  for (let i = 0; i < n; i++) m += keep[i];
  if (m === n) return P;
  const out = new Array(m * 2);
  for (let i = 0, j = 0; i < n; i++) if (keep[i]) { out[j++] = P[2 * i]; out[j++] = P[2 * i + 1]; }
  return out;
}

/**
 * Points of a 3D polyline (objects with x, y, z) needed to stay within tol metres of it: Douglas-Peucker in 3D.
 * Used for lift cables, which are stored with a point every ~10 m for their sag. Returns a new array of the same
 * point objects; the first and last are always kept.
 */
export function simplifyPath3(pts, tol) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [0, n - 1], t2 = tol * tol;
  while (stack.length) {
    const hi = stack.pop(), lo = stack.pop();
    if (hi - lo < 2) continue;
    const a = pts[lo], b = pts[hi], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz || 1e-9;
    let best = t2, bi = -1;
    for (let k = lo + 1; k < hi; k++) {
      const p = pts[k], f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / L2));
      const ex = p.x - a.x - f * dx, ey = p.y - a.y - f * dy, ez = p.z - a.z - f * dz, e = ex * ex + ey * ey + ez * ez;
      if (e > best) { best = e; bi = k; }
    }
    if (bi > 0) { keep[bi] = 1; stack.push(lo, bi, bi, hi); }
  }
  return pts.filter((_, i) => keep[i]);
}
