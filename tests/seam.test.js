// Where the detailed ground meets the coarse land around it (src/seam.js): no step, no gap, no overlap.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FEATHER, MARGIN, borderLoop, borderOffsets, borderPlace, coarseAt, holeBox, offsetAt, repairEdges, seamStrip, smoothstep,
  surroundZ, zip,
} from '../src/seam.js';
import { loadResort } from './helpers.js';

// a small detailed grid on a tilted plane, and a coarse grid of the same plane lifted by `lift` metres
const plane = (x, y) => 1000 + 0.05 * x + 0.02 * y;
function setup({ nx = 21, ny = 16, cell = 10, lift = 30 } = {}) {
  const sr = { nx: 40, ny: 36, cell: 50, x0: -900, y0: -900, zmin: 900 };
  const sh = new Uint16Array(sr.nx * sr.ny);
  for (let j = 0; j < sr.ny; j++) for (let i = 0; i < sr.nx; i++) sh[j * sr.nx + i] = Math.round(plane(sr.x0 + i * sr.cell, sr.y0 + j * sr.cell) + lift - sr.zmin);
  const loop = borderLoop(nx, ny, cell);
  const { d } = borderOffsets(loop, (p) => plane(p.x, p.y), (x, y) => coarseAt(sr, sh, x, y));
  return { sr, sh, loop, d, nx, ny, cell, W: (nx - 1) * cell, H: (ny - 1) * cell, lift };
}
const area2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

describe('smoothstep', () => {
  it('runs from 0 to 1 with flat ends', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 0)).toBe(0);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5);
    expect(smoothstep(0, 10, 10)).toBe(1);
    expect(smoothstep(0, 10, 20)).toBe(1);
    expect(smoothstep(0, 10, 0.1)).toBeLessThan(0.001);
  });
});

describe('border loop and places on it', () => {
  it('goes once round the grid edge, counter-clockwise, one point per cell', () => {
    const L = borderLoop(5, 4, 10);
    expect(L.pts.length).toBe(2 * (4 + 3));
    expect(L.length).toBe(2 * (40 + 30));
    expect(L.pts[0]).toMatchObject({ i: 0, j: 0, x: 0, y: 0, s: 0 });
    expect(L.pts[L.sides[1]]).toMatchObject({ i: 4, j: 0 });
    expect(L.pts[L.sides[2]]).toMatchObject({ i: 4, j: 3 });
    expect(L.pts[L.sides[3]]).toMatchObject({ i: 0, j: 3 });
    // each point is one cell from the last
    for (let k = 1; k < L.pts.length; k++) expect(Math.hypot(L.pts[k].x - L.pts[k - 1].x, L.pts[k].y - L.pts[k - 1].y)).toBe(10);
  });

  it('finds the nearest border point and the distance outside', () => {
    const W = 40, H = 30;
    expect(borderPlace(W, H, 15, -20)).toEqual({ s: 15, out: 20 });               // south of the south edge
    expect(borderPlace(W, H, 60, 10)).toEqual({ s: 50, out: 20 });                // east
    expect(borderPlace(W, H, 10, 40)).toEqual({ s: 40 + 30 + 30, out: 10 });      // north, measured east to west
    expect(borderPlace(W, H, -5, 10)).toEqual({ s: 40 + 30 + 40 + 20, out: 5 });  // west, measured north to south
    expect(borderPlace(W, H, -3, -4).out).toBe(5);                                // beyond a corner
    expect(borderPlace(W, H, 20, 15).out).toBe(0);                                // inside
  });

  it('reads the smoothed offset round the loop, wrapping past the start', () => {
    const L = borderLoop(5, 4, 10), d = Float64Array.from(L.pts, (_, k) => k);
    expect(offsetAt(L, d, 25)).toBeCloseTo(2.5);
    expect(offsetAt(L, d, L.length - 5)).toBeCloseTo((13 + 0) / 2);             // between the last point and the first
    expect(offsetAt(L, d, L.length + 10)).toBeCloseTo(1);
  });
});

describe('offset along the border', () => {
  it('measures coarse minus detailed, and smoothing keeps an even offset as it is', () => {
    const { d, lift } = setup();
    for (const v of d) expect(v).toBeCloseTo(lift, 0);
  });
  it('smooths a single spike away but keeps a long change', () => {
    const L = borderLoop(61, 61, 10);
    const spike = borderOffsets(L, (p) => (p === L.pts[30] ? 50 : 0), () => 0, 150).d;
    expect(Math.max(...spike.map(Math.abs))).toBeLessThan(5);
    const half = borderOffsets(L, (p) => (p.y === 0 ? 20 : 0), () => 0, 150).d;   // the whole south side 20 m off
    expect(Math.abs(half[30])).toBeGreaterThan(18);
  });
});

describe('surround heights', () => {
  it('meet the detailed ground at the border and keep their own shape a feather width out', () => {
    const { sr, sh, loop, d, W, H, lift } = setup();
    const inside = (x, y) => plane(x, y);
    // just outside the border: the detailed height (the offset fully taken off)
    for (const [x, y] of [[50, -0.01], [W + 0.01, 70], [100, H + 0.01], [-0.01, 20]]) {
      expect(surroundZ(loop, d, x, y, coarseAt(sr, sh, x, y), inside)).toBeCloseTo(plane(x, y), 0);
    }
    // a feather width out and beyond: the coarse height untouched
    for (const out of [FEATHER, FEATHER + 300]) {
      const x = 100, y = -out, zc = coarseAt(sr, sh, x, y);
      expect(surroundZ(loop, d, x, y, zc, inside)).toBeCloseTo(zc, 6);
    }
    // in between: part way, never overshooting
    const zc = coarseAt(sr, sh, 100, -FEATHER / 2), z = surroundZ(loop, d, 100, -FEATHER / 2, zc, inside);
    expect(z).toBeLessThan(zc);
    expect(z).toBeGreaterThan(zc - lift);
    // inside the detailed area: the detailed height
    expect(surroundZ(loop, d, 60, 60, 0, inside)).toBe(plane(60, 60));
  });

  it('change smoothly outward: no jump anywhere along a line out from the border', () => {
    const { sr, sh, loop, d } = setup({ lift: 60 });
    let last = null;
    for (let out = 0.5; out < FEATHER + 200; out += 5) {
      const y = -out, z = surroundZ(loop, d, 100, y, coarseAt(sr, sh, 100, y), plane);
      if (last != null) expect(Math.abs(z - last)).toBeLessThan(1);            // the plane itself drops 0.1 m per 5 m
      last = z;
    }
  });
});

describe('the hole in the coarse mesh and the joining strip', () => {
  it('leaves out a box reaching at least MARGIN past the detailed area', () => {
    const { sr, W, H } = setup();
    const b = holeBox(sr, W, H);
    expect(sr.x0 + b.i0 * sr.cell).toBeLessThanOrEqual(-MARGIN);
    expect(sr.x0 + b.i1 * sr.cell).toBeGreaterThanOrEqual(W + MARGIN);
    expect(sr.y0 + b.j0 * sr.cell).toBeLessThanOrEqual(-MARGIN);
    expect(sr.y0 + b.j1 * sr.cell).toBeGreaterThanOrEqual(H + MARGIN);
    // and no more than one coarse cell beyond that
    expect(sr.x0 + b.i0 * sr.cell).toBeGreaterThan(-MARGIN - sr.cell);
    expect(sr.y0 + b.j1 * sr.cell).toBeLessThan(H + MARGIN + sr.cell);
  });

  it('zips two lines with triangles that all face up and cover the space between them once', () => {
    const outer = [0, 1, 2, 3].map((k) => ({ x: k * 30, y: 0, v: k }));
    const inner = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ x: 5 + k * 8.9, y: 20, v: 10 + k }));
    const tris = zip(outer, inner, []);
    expect(tris.length / 3).toBe(outer.length - 1 + inner.length - 1);
    const at = new Map([...outer, ...inner].map((p) => [p.v, p]));
    let area = 0;
    for (let t = 0; t < tris.length; t += 3) {
      const a = area2(at.get(tris[t]), at.get(tris[t + 1]), at.get(tris[t + 2]));
      expect(a).toBeGreaterThan(0);
      area += a / 2;
    }
    // the trapezoid between the two lines
    expect(area).toBeCloseTo(((90 + 80.1) / 2) * 20, 6);
  });

  it('fills exactly the ring between the hole and the detailed edge, every detailed edge point used', () => {
    const { sr, nx, ny, cell, W, H } = setup();
    const box = holeBox(sr, W, H), st = seamStrip(sr, box, nx, ny, cell);
    let area = 0;
    for (let t = 0; t < st.tris.length; t += 3) {
      const a = area2(st.verts[st.tris[t]], st.verts[st.tris[t + 1]], st.verts[st.tris[t + 2]]);
      expect(a).toBeGreaterThan(0);                                               // faces up (three.js front side)
      area += a / 2;
    }
    const hw = (box.i1 - box.i0) * sr.cell, hh = (box.j1 - box.j0) * sr.cell;
    expect(area).toBeCloseTo(hw * hh - W * H, 3);
    const edge = st.verts.filter((v) => v.kind === 1);
    expect(edge.length).toBe(2 * (nx - 1 + ny - 1));
    expect(new Set(edge.map((v) => v.o)).size).toBe(edge.length);
    const ring = st.verts.filter((v) => v.kind === 0);
    expect(ring.length).toBe(2 * (box.i1 - box.i0 + box.j1 - box.j0));
    // every edge between two detailed edge points belongs to exactly one triangle (the strip's inner rim, no holes)
    const rim = new Map();
    for (let t = 0; t < st.tris.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = st.verts[st.tris[t + e]], b = st.verts[st.tris[t + ((e + 1) % 3)]];
      if (a.kind === 1 && b.kind === 1) { const k = [a.o, b.o].sort((p, q) => p - q).join(); rim.set(k, (rim.get(k) || 0) + 1); }
    }
    expect(rim.size).toBe(edge.length);
    for (const n of rim.values()) expect(n).toBe(1);
  });

  it('joins Jay Peak without a step: the strip shares the detailed edge points', () => {
    const { resort, geo } = loadResort('jay-peak');
    const sh = new Uint16Array(readFileSync('public/data/jay-peak/surround.bin').buffer.slice(0));
    const G = resort.grid, sr = resort.surround, W = geo.W, H = geo.H;
    const st = seamStrip(sr, holeBox(sr, W, H), G.nx, G.ny, G.cell);
    const loop = borderLoop(G.nx, G.ny, G.cell);
    const edgeZ = (p) => G.zmin + geo.h[p.j * G.nx + p.i] / 10;
    const { d } = borderOffsets(loop, edgeZ, (x, y) => coarseAt(sr, sh, x, y));
    // the coarse points round the hole are already within a few metres of the detailed edge (the raw sources differ
    // by up to ~30 m there), and further out the coarse land is untouched
    const steps = [];
    for (const v of st.verts) if (v.kind === 0) {
      const { s } = borderPlace(W, H, v.x, v.y), z = surroundZ(loop, d, v.x, v.y, sh[v.o] + sr.zmin, () => 0);
      const p = loop.pts[Math.round(s / G.cell) % loop.pts.length];
      steps.push(Math.abs(z - edgeZ(p)));
    }
    steps.sort((a, b) => a - b);
    expect(steps[steps.length >> 1]).toBeLessThan(25);                           // includes the real slope over 60-200 m
    for (const v of st.verts) if (v.kind === 1) expect(v.x === 0 || v.y === 0 || Math.abs(v.x - W) < 1e-6 || Math.abs(v.y - H) < 1e-6).toBe(true);
  });
});

describe('mending a broken edge line of the height grid', () => {
  const grid = (nx, ny, f) => { const h = new Uint16Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = f(i, j); return h; };
  const slope = (i, j) => 5000 + 30 * i + 17 * j + ((i * 7 + j * 3) % 5) * 4;   // decimetres, a tilted plane with ripples

  it('leaves a good grid alone', () => {
    const h = grid(30, 20, slope), copy = h.slice();
    expect(repairEdges(h, 30, 20)).toEqual({});
    expect(h).toEqual(copy);
  });

  it('mends a south row hundreds of metres too low and nothing else', () => {
    const h = grid(30, 20, (i, j) => (j === 0 ? Math.round(slope(i, j) * 0.8) : slope(i, j)));
    const before = h.slice();
    expect(repairEdges(h, 30, 20)).toEqual({ S: 1 });
    for (let i = 0; i < 30; i++) expect(Math.abs(h[i] - slope(i, 0))).toBeLessThanOrEqual(20);   // within 2 m
    for (let k = 30; k < h.length; k++) expect(h[k]).toBe(before[k]);
  });

  it('mends east and west columns too, and two broken lines on one side', () => {
    const nx = 30, ny = 20;
    const h = grid(nx, ny, (i, j) => (i === nx - 1 ? 100 : i <= 1 ? slope(i, j) + 4000 + i * 900 : slope(i, j)));
    const fixed = repairEdges(h, nx, ny);
    expect(fixed.E).toBe(1);
    expect(fixed.W).toBe(2);
    for (let j = 0; j < ny; j++) {
      expect(Math.abs(h[j * nx + nx - 1] - slope(nx - 1, j))).toBeLessThanOrEqual(30);
      expect(Math.abs(h[j * nx] - slope(0, j))).toBeLessThanOrEqual(40);
    }
  });

  it('keeps real cliffs: a step inside the grid is not an edge fault', () => {
    const h = grid(30, 20, (i, j) => slope(i, j) + (i > 15 ? 3000 : 0)), copy = h.slice();
    expect(repairEdges(h, 30, 20)).toEqual({});
    expect(h).toEqual(copy);
  });

  it('never wraps round below zero or above the top of the range', () => {
    const h = grid(10, 10, (i, j) => (j === 0 ? 30000 : Math.max(0, 200 - j * 100)));
    repairEdges(h, 10, 10);
    for (let i = 0; i < 10; i++) expect(h[i]).toBeLessThanOrEqual(65535);
    const g = grid(10, 10, (i, j) => (j === 0 ? 0 : 60000 + j * 1000 > 65535 ? 65535 : 60000 + j * 1000));
    repairEdges(g, 10, 10);
    for (let i = 0; i < 10; i++) expect(g[i]).toBeGreaterThanOrEqual(0);
  });
});
