// Where the detailed resort ground (the LiDAR grid) meets the coarse land around it (the 140 m "surround" grid).
//
// The two come from different sources, so along the border they disagree by metres to tens of metres. The
// surround is lifted or lowered to meet the detailed ground: at the border it takes the detailed ground's height
// (smoothed along the border), and the correction fades out over FEATHER metres, so further out the surround keeps
// its own shape. A strip of triangles then joins the detailed ground's own edge points (every grid cell) to the
// surround's first row of points round its hole, so the two surfaces share their edge and nothing overlaps.
//
// Plain arrays and numbers only (no three.js), so it can be tested on its own.
//
// Coordinates are the map's local metres: x east and y north from the detailed grid's south-west corner, the
// detailed ground covering [0, W] x [0, H].

export const FEATHER = 1000;      // metres over which the surround's correction fades to nothing
export const MARGIN = 60;         // the surround's hole reaches at least this far past the detailed edge
export const SMOOTH = 150;        // metres: the spread of the smoothing of the correction along the border

/**
 * Mend a broken outermost row or column of the detailed height grid, in place. Several maps were built with the
 * edge line averaged partly over empty ground beyond the elevation model, so it sits tens to hundreds of metres
 * below (or above) the line next to it all along that side: a wall at the edge of the map (Vail, Keystone, Loon,
 * Okemo and Sugarloaf on the south side, Mammoth on the west, Tignes on the east, found 2026-11-23). A side counts
 * as broken when its outer line differs from the next one in by more than three times as much as the next lines do
 * from each other (medians along the side, plus 2 m). The first `depth` lines are checked; the deepest one found
 * broken and every line outside it are replaced by carrying the slope of the two good lines inside them outward.
 * The cause is not known for certain (the source tiles' empty value counted in the average is the likely one);
 * tools/build_data.py applies the same rule, so new builds come out mended.
 *   h: Uint16Array of decimetres (row 0 = south), nx x ny. Returns the sides mended, as { S, N, W, E: lines }.
 */
export function repairEdges(h, nx, ny, depth = 3) {
  const fixed = {};
  if (nx < depth + 3 || ny < depth + 3) return fixed;
  const med = (a) => { const b = Float64Array.from(a).sort(); return b[b.length >> 1]; };
  // per side: number of points along it, and the grid index of point k on line d (d = 0 the outermost)
  const sides = {
    S: [nx, (k, d) => d * nx + k], N: [nx, (k, d) => (ny - 1 - d) * nx + k],
    W: [ny, (k, d) => k * nx + d], E: [ny, (k, d) => k * nx + nx - 1 - d],
  };
  for (const [name, [n, at]] of Object.entries(sides)) {
    const jump = (d) => { const a = new Float64Array(n); for (let k = 0; k < n; k++) a[k] = Math.abs(h[at(k, d)] - h[at(k, d + 1)]); return med(a) / 10; };
    // the deepest line whose jump inward is far bigger than the one after it: it and every line outside it are broken
    let bad = 0;
    for (let d = 0; d < depth; d++) if (jump(d) > 3 * jump(d + 1) + 2) bad = d + 1;
    if (!bad) continue;
    for (let d = bad - 1; d >= 0; d--) for (let k = 0; k < n; k++) {
      const v = 2 * h[at(k, d + 1)] - h[at(k, d + 2)];
      h[at(k, d)] = Math.min(65535, Math.max(0, v));
    }
    fixed[name] = bad;
  }
  return fixed;
}

/** Smooth step from 0 at a to 1 at b (zero slope at both ends). */
export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Height of the coarse grid at (x, y), bilinear (sr: { nx, ny, cell, x0, y0, zmin }, sh: heights above zmin). */
export function coarseAt(sr, sh, x, y) {
  const fx = Math.min(Math.max((x - sr.x0) / sr.cell, 0), sr.nx - 1.001), fy = Math.min(Math.max((y - sr.y0) / sr.cell, 0), sr.ny - 1.001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * sr.nx + i;
  return sr.zmin + sh[o] * (1 - u) * (1 - v) + sh[o + 1] * u * (1 - v) + sh[o + sr.nx] * (1 - u) * v + sh[o + sr.nx + 1] * u * v;
}

/**
 * The detailed grid's edge points, once round, counter-clockwise from the south-west corner: south edge west to east,
 * east edge south to north, north edge east to west, west edge north to south. Each point: grid index i, j, its
 * place x, y and its distance s along the loop. Also the loop's length and where each side starts (in points).
 */
export function borderLoop(nx, ny, cell) {
  const pts = [], W = (nx - 1) * cell, H = (ny - 1) * cell;
  const add = (i, j) => pts.push({ i, j, x: i * cell, y: j * cell, s: 0 });
  const sides = [0];
  for (let i = 0; i < nx - 1; i++) add(i, 0);
  sides.push(pts.length);
  for (let j = 0; j < ny - 1; j++) add(nx - 1, j);
  sides.push(pts.length);
  for (let i = nx - 1; i > 0; i--) add(i, ny - 1);
  sides.push(pts.length);
  for (let j = ny - 1; j > 0; j--) add(0, j);
  pts.forEach((p, k) => { p.s = k * cell; });
  return { pts, length: pts.length * cell, sides, W, H };
}

/** Distance along the border loop of the border point nearest to (x, y), and how far (x, y) lies outside [0, W] x [0, H]. */
export function borderPlace(W, H, x, y) {
  const cx = Math.min(W, Math.max(0, x)), cy = Math.min(H, Math.max(0, y));
  const out = Math.hypot(x - cx, y - cy);
  // which side: the one the point lies beyond; inside, the nearest side
  let side;
  if (out > 0) {
    if (cy === 0 && cx < W) side = 0; else if (cx === W && cy < H) side = 1; else if (cy === H && cx > 0) side = 2; else side = 3;
  } else {
    const d = [y, W - x, H - y, x];
    side = d.indexOf(Math.min(...d));
  }
  const s = side === 0 ? cx : side === 1 ? W + cy : side === 2 ? W + H + (W - cx) : 2 * W + H + (H - cy);
  return { s, out };
}

/**
 * Per border point, coarse minus detailed height, smoothed along the loop (a Gaussian SMOOTH metres wide, wrapping
 * round the corners). d[k] is for loop point k; detailedZ(p) and coarseZ(x, y) give the two heights.
 */
export function borderOffsets(loop, detailedZ, coarseZ, sigma = SMOOTH) {
  const n = loop.pts.length, cell = loop.length / n, raw = new Float64Array(n);
  loop.pts.forEach((p, k) => { raw[k] = coarseZ(p.x, p.y) - detailedZ(p); });
  const r = Math.max(1, Math.ceil((3 * sigma) / cell)), wts = [];
  for (let q = -r; q <= r; q++) wts.push(Math.exp(-0.5 * ((q * cell) / sigma) ** 2));
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let a = 0, w = 0;
    for (let q = -r; q <= r; q++) { const c = wts[q + r]; a += raw[(((k + q) % n) + n) % n] * c; w += c; }
    out[k] = a / w;
  }
  return { d: out, raw };
}

/** The smoothed offset at distance s along the loop (linear between points, wrapping round). */
export function offsetAt(loop, d, s) {
  const n = d.length, cell = loop.length / n, f = ((s / cell) % n + n) % n, k = Math.floor(f), t = f - k;
  return d[k] * (1 - t) + d[(k + 1) % n] * t;
}

/**
 * Height of a surround point at (x, y) whose own (coarse) height is zc: the coarse height less the border's offset,
 * fading from all of it at the border to none at FEATHER metres out. Inside the detailed area (out = 0) it is the
 * detailed height minus nothing: insideZ(x, y) is used there (those points lie under the detailed ground and only
 * shape the shading of their neighbours).
 */
export function surroundZ(loop, d, x, y, zc, insideZ, feather = FEATHER) {
  const { s, out } = borderPlace(loop.W, loop.H, x, y);
  if (out === 0) return insideZ(x, y);
  return zc - offsetAt(loop, d, s) * (1 - smoothstep(0, feather, out));
}

/**
 * The surround cells to leave out: those inside the box of grid lines that reaches at least `margin` past the
 * detailed area on every side. Returns that box in surround grid indices (cells i0..i1-1, j0..j1-1 are left out).
 */
export function holeBox(sr, W, H, margin = MARGIN) {
  const i0 = Math.max(0, Math.floor((-margin - sr.x0) / sr.cell)), i1 = Math.min(sr.nx - 1, Math.ceil((W + margin - sr.x0) / sr.cell));
  const j0 = Math.max(0, Math.floor((-margin - sr.y0) / sr.cell)), j1 = Math.min(sr.ny - 1, Math.ceil((H + margin - sr.y0) / sr.cell));
  return { i0, i1, j0, j1 };
}

/**
 * Join two lines running side by side with triangles (a zip): outer and inner are arrays of { x, y, v } (v: the
 * vertex number), from the same start corner to the same end corner. Each step takes the next point of whichever
 * line is less far along (by share of its own length). Triangles are pushed to tris as vertex numbers, always
 * counter-clockwise seen from above (x east, y north), which is what three.js draws as the front.
 */
export function zip(outer, inner, tris) {
  const along = (L) => {
    const t = [0];
    for (let k = 1; k < L.length; k++) t.push(t[k - 1] + Math.hypot(L[k].x - L[k - 1].x, L[k].y - L[k - 1].y));
    const len = t[t.length - 1] || 1;
    return t.map((a) => a / len);
  };
  const to = along(outer), ti = along(inner);
  let a = 0, b = 0;
  const tri = (p, q, r) => {
    const c = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    if (c === 0) return;
    if (c > 0) tris.push(p.v, q.v, r.v); else tris.push(p.v, r.v, q.v);
  };
  while (a < outer.length - 1 || b < inner.length - 1) {
    const nextOuter = b >= inner.length - 1 || (a < outer.length - 1 && to[a + 1] <= ti[b + 1]);
    if (nextOuter) { tri(outer[a], inner[b], outer[a + 1]); a++; } else { tri(outer[a], inner[b], inner[b + 1]); b++; }
  }
  return tris;
}

/**
 * The strip joining the surround's hole (box from holeBox) to the detailed area's edge. Returns, in order, the
 * points the strip uses: first the surround points round the hole (kind 0, grid index o into the surround grid), then
 * the detailed edge points (kind 1, grid index o into the detailed grid), and the triangles as indices into that
 * list. nx: the surround grid's width; dnx, dny: the detailed grid's size.
 */
export function seamStrip(sr, box, dnx, dny, dcell) {
  const { i0, i1, j0, j1 } = box, W = (dnx - 1) * dcell, H = (dny - 1) * dcell;
  const verts = [];
  const sv = (i, j) => { verts.push({ kind: 0, o: j * sr.nx + i, x: sr.x0 + i * sr.cell, y: sr.y0 + j * sr.cell, v: verts.length }); return verts[verts.length - 1]; };
  const dv = (i, j) => { verts.push({ kind: 1, o: j * dnx + i, x: i * dcell, y: j * dcell, v: verts.length }); return verts[verts.length - 1]; };
  // each corner point once, shared by the two sides that meet there
  const oc = [sv(i0, j0), sv(i1, j0), sv(i1, j1), sv(i0, j1)];
  const ic = [dv(0, 0), dv(dnx - 1, 0), dv(dnx - 1, dny - 1), dv(0, dny - 1)];
  const line = (c0, c1, pts) => [c0, ...pts, c1];
  const range = (a, b) => { const r = []; if (a < b) for (let k = a + 1; k < b; k++) r.push(k); else for (let k = a - 1; k > b; k--) r.push(k); return r; };
  const outer = [
    line(oc[0], oc[1], range(i0, i1).map((i) => sv(i, j0))),
    line(oc[1], oc[2], range(j0, j1).map((j) => sv(i1, j))),
    line(oc[2], oc[3], range(i1, i0).map((i) => sv(i, j1))),
    line(oc[3], oc[0], range(j1, j0).map((j) => sv(i0, j))),
  ];
  const inner = [
    line(ic[0], ic[1], range(0, dnx - 1).map((i) => dv(i, 0))),
    line(ic[1], ic[2], range(0, dny - 1).map((j) => dv(dnx - 1, j))),
    line(ic[2], ic[3], range(dnx - 1, 0).map((i) => dv(i, dny - 1))),
    line(ic[3], ic[0], range(dny - 1, 0).map((j) => dv(0, j))),
  ];
  const tris = [];
  for (let k = 0; k < 4; k++) zip(outer[k], inner[k], tris);
  return { verts, tris, W, H };
}
