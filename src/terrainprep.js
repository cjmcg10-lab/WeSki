// The heavy, pure part of building a resort's 3D map: the snow mask, the ground's colour fields, and the ground mesh
// cut into square pieces with coarser versions for far away. No three.js and no DOM, so it runs the same in a
// background worker (src/terrain.worker.js, while the map opens) and on the main thread (tests, or no worker).
// Everything it returns is a typed array, so the worker hands it over without copying.

export const CHUNK = 64;              // cells per ground piece side
export const LOD_STEPS = [1, 2, 4, 8]; // every 1st, 2nd, 4th or 8th height in a piece

/**
 * Half the width of a run's snow. Measured on aerial photos where we have it (`w`, tools/align_trails.py
 * --widths: typically 20 m wide, most 12-48 m); otherwise a typical cut run (26 m, greens a little wider).
 * Glades keep a wider band: they are runs through the trees, not cut strips.
 */
export function runRadius(t) {
  if (t.glade) return 16;
  if (t.w) return Math.min(45, Math.max(6, t.w / 2));
  return t.d === 0 ? 15 : 13;
}

/** Slope outlines (OpenStreetMap piste areas) shown on the map: those whose run is not hidden. */
export function shownAreas(resort) {
  const hidden = new Set(resort.trails.filter((t) => t.hide && t.name).map((t) => t.name));
  const shown = new Set(resort.trails.filter((t) => !t.hide && t.name).map((t) => t.name));
  return (resort.areas || []).filter((a) => !a.name || shown.has(a.name) || !hidden.has(a.name));
}

/** Is (x, y) inside the closed polygon [x0, y0, x1, y1, ...]? */
export function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
    const xi = P[i], yi = P[i + 1], xj = P[j], yj = P[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Distance from (x, y) to the nearest edge of the closed polygon [x0, y0, x1, y1, ...]. */
export function edgeDist(P, x, y) {
  let best = Infinity;
  for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
    const ax = P[j], ay = P[j + 1], dx = P[i] - ax, dy = P[i + 1] - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** The parts of resort.json this module reads (a worker gets only these, not the whole resort). */
export function prepInput(resort, h) {
  const T = (t) => ({ pts: t.pts, glade: t.glade, hide: t.hide, w: t.w, d: t.d, z: t.z, slow: t.slow, name: t.name });
  return {
    grid: resort.grid, h,
    trails: resort.trails.map(T), areas: resort.areas || [], zones: resort.zones || [], parks: resort.parks || [],
    buildings: resort.buildings.map((b) => ({ pts: b.pts.slice(0, 2) })),
    lifts: resort.lifts.map((l) => ({ pts: l.pts, hide: l.hide, len: l.len })),
  };
}

/** Snow mask, one value per grid point: groomed trails, slope outlines, lift lines and base areas are open snow. */
export function snowMask(R) {
  const { nx, ny, cell } = R.grid;
  const mask = new Float32Array(nx * ny);
  const stamp = (x, y, rad, v) => {
    const r = Math.ceil(rad / cell), ci = Math.round(x / cell), cj = Math.round(y / cell), r2 = rad * rad;
    for (let j = Math.max(0, cj - r); j <= Math.min(ny - 1, cj + r); j++) {
      const dy = j * cell - y;
      for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
        const dx = i * cell - x, o = j * nx + i;
        if (dx * dx + dy * dy <= r2 && mask[o] < v) mask[o] = v;
      }
    }
  };
  for (const t of R.trails) if (!t.hide) for (let i = 0; i < t.pts.length; i += 2) stamp(t.pts[i], t.pts[i + 1], runRadius(t), t.glade ? 0.4 : 1);
  for (const a of shownAreas(R)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < a.pts.length; k += 2) { x0 = Math.min(x0, a.pts[k]); x1 = Math.max(x1, a.pts[k]); y0 = Math.min(y0, a.pts[k + 1]); y1 = Math.max(y1, a.pts[k + 1]); }
    for (let j = Math.max(0, Math.floor(y0 / cell)); j <= Math.min(ny - 1, Math.ceil(y1 / cell)); j++)
      for (let i = Math.max(0, Math.floor(x0 / cell)); i <= Math.min(nx - 1, Math.ceil(x1 / cell)); i++)
        if (inPoly(a.pts, i * cell, j * cell)) mask[j * nx + i] = 1;
  }
  for (const b of R.buildings) stamp(b.pts[0], b.pts[1], 30, 1);
  for (const l of R.lifts) {
    if (l.hide) continue;
    const n = Math.ceil(l.len / 12);
    for (let k = 0; k <= n; k++) {
      const f = k / n, x = l.pts[0] + (l.pts[l.pts.length - 2] - l.pts[0]) * f, y = l.pts[1] + (l.pts[l.pts.length - 1] - l.pts[1]) * f;
      stamp(x, y, 9, 0.5);     // lift lines are cut through the trees (0.5: no trees; glades are 0.4)
    }
  }
  return mask;
}

/**
 * The ground's colour fields (see SkiMap.groundMaterial): RGBA distance fields for groomed snow, glades and zones,
 * and the zone code per pixel.
 */
export function groundFields(R) {
  const { nx, ny, cell } = R.grid;
  const W = (nx - 1) * cell, H = (ny - 1) * cell;
  const tw = Math.ceil(W / Math.max(cell / 2, Math.max(W, H) / 2048)), th = Math.ceil(H / Math.max(cell / 2, Math.max(W, H) / 2048));
  const sx = W / tw, sy = H / th, N = tw * th;
  const RW = Math.max(12, 2 * Math.max(sx, sy));                  // distance covered by the field each side of an edge
  const field = new Uint8Array(N * 4), zc = new Uint8Array(N);
  for (let o = 3; o < field.length; o += 4) field[o] = 255;
  // field value: 0.5 on the edge `rad` from the line, 1 well inside, 0 well outside
  const stroke = (pts, rad, fn) => {
    const Rr = rad + RW, R2 = Rr * Rr;
    for (let q = 0; q < pts.length; q += 2) {
      const x1 = pts[q], y1 = pts[q + 1], last = q + 2 >= pts.length, x2 = last ? x1 : pts[q + 2], y2 = last ? y1 : pts[q + 3];
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - Rr) / sx)), i1 = Math.min(tw - 1, Math.ceil((Math.max(x1, x2) + Rr) / sx));
      const j0 = Math.max(0, Math.floor((Math.min(y1, y2) - Rr) / sy)), j1 = Math.min(th - 1, Math.ceil((Math.max(y1, y2) + Rr) / sy));
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * sy;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) * sx, t = L2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2)) : 0;
          const ex = x - x1 - t * dx, ey = y - y1 - t * dy, d2 = ex * ex + ey * ey;
          if (d2 < R2) fn(j * tw + i, Math.min(1, 0.5 + (rad - Math.sqrt(d2)) / (2 * RW)));
        }
      }
    }
  };
  const into = (ch) => (o, f) => { const v = f * 255; if (v > field[o * 4 + ch]) field[o * 4 + ch] = v; };
  const T = R.trails.filter((t) => !t.hide);
  for (const t of T) stroke(t.pts, runRadius(t), into(t.glade ? 1 : 0));
  // slopes OpenStreetMap outlines (piste areas): filled to their real shape, with the same soft edge
  for (const a of shownAreas(R)) {
    const P = a.pts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < P.length; k += 2) { x0 = Math.min(x0, P[k]); x1 = Math.max(x1, P[k]); y0 = Math.min(y0, P[k + 1]); y1 = Math.max(y1, P[k + 1]); }
    const i0 = Math.max(0, Math.floor((x0 - RW) / sx)), i1 = Math.min(tw - 1, Math.ceil((x1 + RW) / sx));
    const j0 = Math.max(0, Math.floor((y0 - RW) / sy)), j1 = Math.min(th - 1, Math.ceil((y1 + RW) / sy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * sx, y = (j + 0.5) * sy, d = edgeDist(P, x, y);
      if (d > RW) { if (inPoly(P, x, y)) into(0)(j * tw + i, 1); continue; }
      into(0)(j * tw + i, Math.max(0, Math.min(1, 0.5 + (inPoly(P, x, y) ? d : -d) / (2 * RW))));
    }
  }
  for (const b of R.buildings) stroke([b.pts[0], b.pts[1]], 30, into(0));
  for (const l of R.lifts) if (!l.hide) stroke([l.pts[0], l.pts[1], l.pts[l.pts.length - 2], l.pts[l.pts.length - 1]], 9, into(1));
  // zones, by code; later codes win where zones overlap. +16: may tint off the groomed snow
  const CODE = { free: 1, extreme: 2, sled: 3, race: 4, learn: 5, family: 6, slow: 7, park: 8 };
  // A pixel's code is read without blending, so where a zone has nothing under it, it also takes pixels a little
  // outside its edge (f > 0.35): the smooth field then draws the edge instead of the texture cells. Such a pixel is
  // only held weakly: any other zone that really covers it (f > 0.5) takes it over.
  const paint = (pts, rad, v, off) => stroke(pts, rad, (o, f) => {
    const cur = zc[o] & 15;
    const fv = f * 255;
    const take = !cur ? f > 0.35 : v !== cur && f > 0.5 && (v > cur || field[o * 4 + 2] < 127.5);
    if (take) { zc[o] = v | (off ? 16 : 0); field[o * 4 + 2] = fv; } else if (v === cur && fv > field[o * 4 + 2]) field[o * 4 + 2] = fv;
  });
  for (const t of T) {
    const z = t.z || (t.slow ? 'slow' : null);
    if (z) paint(t.pts, z === 'free' || z === 'extreme' ? 20 : 30, CODE[z], z === 'free' || z === 'extreme' ? 1 : 0);
  }
  for (const z of R.zones) paint(z.pts, 14, CODE[z.kind], 1);
  for (const p of R.parks) paint(p.pts, 17, CODE.park, p.trail >= 0 ? 0 : 1);
  return { field, zc, tw, th };
}

/**
 * Smooth vertex normals of a regular grid triangulated as (a, b, e) and (a, e, d) per cell: each corner gets the
 * area-weighted sum of its triangles' normals, exactly as three.js computeVertexNormals would, without building the
 * triangle list first. pos holds x, y, z per point (at least nx * ny of them).
 */
export function gridNormals(pos, nx, ny, out = new Float32Array(nx * ny * 3)) {
  const add = (v, x, y, z) => { out[v * 3] += x; out[v * 3 + 1] += y; out[v * 3 + 2] += z; };
  const tri = (a, b, c) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    add(a, x, y, z); add(b, x, y, z); add(c, x, y, z);
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
    tri(a, b, e); tri(a, e, d);
  }
  for (let v = 0; v < nx * ny; v++) {
    const x = out[v * 3], y = out[v * 3 + 1], z = out[v * 3 + 2], l = Math.hypot(x, y, z) || 1;
    out[v * 3] = x / l; out[v * 3 + 1] = y / l; out[v * 3 + 2] = z / l;
  }
  return out;
}

/** The square pieces of a grid of nx x ny points, C cells a side (the last row and column may be narrower). */
export function chunkLayout(nx, ny, C = CHUNK) {
  const out = [];
  for (let j0 = 0; j0 < ny - 1; j0 += C) for (let i0 = 0; i0 < nx - 1; i0 += C) out.push({ i0, j0, i1: Math.min(nx - 1, i0 + C), j1: Math.min(ny - 1, j0 + C) });
  return out;
}

/** Kept grid lines of a piece at step st: every st-th line from the start, and always the far edge. */
export function levelLines(a0, a1, st) {
  const xs = [];
  for (let a = a0; a < a1; a += st) xs.push(a);
  xs.push(a1);
  return xs;
}

/** Steps a piece can use: a coarser step needs at least two cells of that size each way. */
export function pieceSteps(ch, steps = LOD_STEPS) {
  return steps.filter((st) => st === 1 || (ch.i1 - ch.i0 >= st * 2 && ch.j1 - ch.j0 >= st * 2));
}

/**
 * Worst height error (in the height units of hAt) of drawing a piece with every st-th height instead of all of them,
 * measured at every left-out point against the coarse triangles (split the same way as the full grid).
 */
export function levelError(hAt, ch, st) {
  if (st === 1) return 0;
  const xs = levelLines(ch.i0, ch.i1, st), ys = levelLines(ch.j0, ch.j1, st);
  let err = 0;
  for (let b = 0; b + 1 < ys.length; b++) for (let a = 0; a + 1 < xs.length; a++) {
    const ia = xs[a], ib = xs[a + 1], ja = ys[b], jb = ys[b + 1], du = ib - ia, dv = jb - ja;
    const za = hAt(ia, ja), zb = hAt(ib, ja), zd = hAt(ia, jb), ze = hAt(ib, jb);
    for (let j = ja; j <= jb; j++) {
      const v = (j - ja) / dv;
      for (let i = ia; i <= ib; i++) {
        const u = (i - ia) / du;
        const z = u >= v ? za + u * (zb - za) + v * (ze - zb) : za + u * (ze - zd) + v * (zd - za);
        const e = Math.abs(z - hAt(i, j));
        if (e > err) err = e;
      }
    }
  }
  return err;
}

/**
 * Where the skirt points of a chunked grid live in the vertex buffer. Every point on a piece's edge line gets one
 * copy hanging below it; row lines (constant j) come first, then column lines (constant i).
 */
export function skirtLayout(nx, ny, C = CHUNK) {
  const nRows = Math.ceil((ny - 1) / C) + 1, nCols = Math.ceil((nx - 1) / C) + 1, base = nx * ny;
  const rowOf = (j) => (j === ny - 1 ? nRows - 1 : j / C), colOf = (i) => (i === nx - 1 ? nCols - 1 : i / C);
  return {
    nRows, nCols, base, count: nRows * nx + nCols * ny,
    row: (j, i) => base + rowOf(j) * nx + i,
    col: (i, j) => base + nRows * nx + colOf(i) * ny + j,
    rowLine: (r) => (r === nRows - 1 ? ny - 1 : r * C), colLine: (c) => (c === nCols - 1 ? nx - 1 : c * C),
  };
}

/**
 * Triangle indices of one piece at step st: its cells, then a skirt round its edge that hangs down to hide any gap
 * to a neighbour drawn at another step. skip(i, j), when given, leaves out full-detail cells (and coarse cells all of
 * whose full cells are left out). Writes into `out` from `at` when given, else returns a new Uint32Array.
 */
export function pieceIndex(ch, st, nx, sk, skip = null, out = null, at = 0) {
  const xs = levelLines(ch.i0, ch.i1, st), ys = levelLines(ch.j0, ch.j1, st);
  const cells = (xs.length - 1) * (ys.length - 1), ring = 2 * (xs.length - 1 + ys.length - 1);
  const idx = out || new Uint32Array((cells + ring) * 6);
  let k = out ? at : 0;
  const allSkipped = (ia, ib, ja, jb) => { for (let j = ja; j < jb; j++) for (let i = ia; i < ib; i++) if (!skip(i, j)) return false; return true; };
  for (let b = 0; b + 1 < ys.length; b++) for (let a = 0; a + 1 < xs.length; a++) {
    if (skip && allSkipped(xs[a], xs[a + 1], ys[b], ys[b + 1])) continue;
    const A = ys[b] * nx + xs[a], B = ys[b] * nx + xs[a + 1], D = ys[b + 1] * nx + xs[a], E = ys[b + 1] * nx + xs[a + 1];
    idx[k++] = A; idx[k++] = B; idx[k++] = E; idx[k++] = A; idx[k++] = E; idx[k++] = D;
  }
  // the ring runs counter-clockwise in (i, j); each quad (T1, B1, T2), (T2, B1, B2) then faces out of the piece
  const quad = (t1, b1, t2, b2) => { idx[k++] = t1; idx[k++] = b1; idx[k++] = t2; idx[k++] = t2; idx[k++] = b1; idx[k++] = b2; };
  const { i0, j0, i1, j1 } = ch;
  for (let a = 0; a + 1 < xs.length; a++) quad(j0 * nx + xs[a], sk.row(j0, xs[a]), j0 * nx + xs[a + 1], sk.row(j0, xs[a + 1]));
  for (let b = 0; b + 1 < ys.length; b++) quad(ys[b] * nx + i1, sk.col(i1, ys[b]), ys[b + 1] * nx + i1, sk.col(i1, ys[b + 1]));
  for (let a = xs.length - 1; a > 0; a--) quad(j1 * nx + xs[a], sk.row(j1, xs[a]), j1 * nx + xs[a - 1], sk.row(j1, xs[a - 1]));
  for (let b = ys.length - 1; b > 0; b--) quad(ys[b] * nx + i0, sk.col(i0, ys[b]), ys[b - 1] * nx + i0, sk.col(i0, ys[b - 1]));
  if (out) return k;
  return k === idx.length ? idx : idx.slice(0, k);
}

/**
 * A grid surface cut into pieces with skirts, ready to draw: one vertex buffer (the grid points, then the skirt
 * points), one index buffer holding every piece's full-detail triangles one after the other (a piece draws its own
 * stretch of it), and per piece its bounds and the height error of each coarser step. Coarser index lists are made
 * later, only for pieces that need one (pieceIndex). skirtSrc gives the grid point each skirt point hangs from (to
 * copy other per-point values such as colours).
 *   pos: x, y, z per grid point (nx * ny of them); skip(i, j): cells not drawn (optional); normals: given instead of
 *   worked out from the grid.
 */
export function chunkSurface(pos, nx, ny, { C = CHUNK, steps = LOD_STEPS, skip = null, normals = null } = {}) {
  const n = nx * ny, sk = skirtLayout(nx, ny, C), chunks = chunkLayout(nx, ny, C);
  const hAt = (i, j) => pos[(j * nx + i) * 3 + 1];
  const P = new Float32Array((n + sk.count) * 3);
  P.set(pos.subarray(0, n * 3));
  const N = new Float32Array(P.length);
  if (normals) N.set(normals.subarray(0, n * 3)); else gridNormals(P, nx, ny, N);
  const skirtSrc = new Uint32Array(sk.count);
  // errors first: a piece's skirt must reach below the worst error any step of it or of its neighbour can have
  const rowD = new Float32Array(sk.nRows * nx), colD = new Float32Array(sk.nCols * ny);
  let total = 0;
  for (const ch of chunks) {
    // a piece with left-out cells (the land around the resort, under the detailed map) keeps full detail
    let holes = false;
    if (skip) for (let j = ch.j0; j < ch.j1 && !holes; j++) for (let i = ch.i0; i < ch.i1; i++) if (skip(i, j)) { holes = true; break; }
    ch.steps = holes ? [1] : pieceSteps(ch, steps);
    ch.errs = ch.steps.map((st) => levelError(hAt, ch, st));
    const drop = Math.max(4, Math.min(150, ch.errs[ch.errs.length - 1] * 1.5 + 2));
    ch.drop = drop;
    for (const j of [ch.j0, ch.j1]) { const r = sk.row(j, 0) - sk.base; for (let i = ch.i0; i <= ch.i1; i++) if (rowD[r + i] < drop) rowD[r + i] = drop; }
    for (const i of [ch.i0, ch.i1]) { const c = sk.col(i, 0) - sk.base - sk.nRows * nx; for (let j = ch.j0; j <= ch.j1; j++) if (colD[c + j] < drop) colD[c + j] = drop; }
    let y0 = Infinity, y1 = -Infinity;
    for (let j = ch.j0; j <= ch.j1; j++) for (let i = ch.i0; i <= ch.i1; i++) { const y = hAt(i, j); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    ch.y0 = y0 - drop; ch.y1 = y1;
    total += ((ch.i1 - ch.i0) * (ch.j1 - ch.j0) + 2 * (ch.i1 - ch.i0 + ch.j1 - ch.j0)) * 6;
  }
  const put = (v, src, d) => { skirtSrc[v - n] = src; P[v * 3] = P[src * 3]; P[v * 3 + 1] = P[src * 3 + 1] - d; P[v * 3 + 2] = P[src * 3 + 2]; N[v * 3] = N[src * 3]; N[v * 3 + 1] = N[src * 3 + 1]; N[v * 3 + 2] = N[src * 3 + 2]; };
  for (let r = 0; r < sk.nRows; r++) { const j = sk.rowLine(r); for (let i = 0; i < nx; i++) put(sk.row(j, i), j * nx + i, rowD[r * nx + i] || 4); }
  for (let c = 0; c < sk.nCols; c++) { const i = sk.colLine(c); for (let j = 0; j < ny; j++) put(sk.col(i, j), j * nx + i, colD[c * ny + j] || 4); }
  const index = new Uint32Array(total);
  let k = 0;
  for (const ch of chunks) { ch.start = k; k = pieceIndex(ch, 1, nx, sk, skip, index, k); ch.count = k - ch.start; }
  return { pos: P, nrm: N, index: k === total ? index : index.slice(0, k), chunks, nx, ny, C, skirtSrc };
}

/** Coarsest step of a piece whose height error stays under `px` screen pixels (metres per pixel `mpp` there). */
export function pickLevel(errs, mpp, px) {
  let k = 0;
  const lim = px * mpp;
  for (let L = 1; L < errs.length; L++) if (errs[L] < lim) k = L;
  return k;
}

/** Sharpness while the map moves: 65% of the full sharpness in steps of a quarter, never below 1x. */
export function movingPr(full) {
  return Math.max(1, Math.round(full * 0.65 * 4) / 4);
}

/** Everything the map's ground needs, from the parts of the resort prepInput keeps. */
export function prepTerrain(R) {
  const { nx, ny, cell } = R.grid, h = R.h, W = (nx - 1) * cell, H = (ny - 1) * cell;
  const mask = snowMask(R);
  const n = nx * ny, pos = new Float32Array(n * 3);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const o = j * nx + i;
    pos[o * 3] = i * cell - W / 2; pos[o * 3 + 1] = h[o] / 10; pos[o * 3 + 2] = -(j * cell - H / 2);
  }
  const surface = chunkSurface(pos, nx, ny);
  const fields = groundFields(R);
  return { mask, surface, fields };
}

/** The typed arrays in a prepTerrain result, to hand over from a worker without copying. */
export function prepBuffers(p) {
  return [p.mask.buffer, p.surface.pos.buffer, p.surface.nrm.buffer, p.surface.index.buffer, p.surface.skirtSrc.buffer, p.fields.field.buffer, p.fields.zc.buffer];
}
