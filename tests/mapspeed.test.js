// The map speed helpers: simpler run and cable lines, the ground cut into pieces with coarser far versions.
import { describe, it, expect } from 'vitest';
import { simplifyRun, simplifyPath3 } from '../src/simplify.js';
import {
  chunkLayout, chunkSurface, gridNormals, levelError, levelLines, pickLevel, pieceIndex, pieceSteps, skirtLayout,
  movingPr, prepInput, prepTerrain, snowMask,
} from '../src/terrainprep.js';
import { loadResort } from './helpers.js';

// distance from point (x, y) to the polyline Q (flat)
const distTo = (Q, x, y) => {
  let best = Infinity;
  for (let i = 2; i < Q.length; i += 2) {
    const ax = Q[i - 2], ay = Q[i - 1], dx = Q[i] - ax, dy = Q[i + 1] - ay, L2 = dx * dx + dy * dy || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - f * dx, y - ay - f * dy));
  }
  return best;
};

describe('simpler run lines', () => {
  const flat = () => 100;
  it('drops points on a straight, even stretch and keeps the ends', () => {
    const P = []; for (let i = 0; i <= 50; i++) P.push(i * 9, 0);
    expect(simplifyRun(P, flat)).toEqual([0, 0, 450, 0]);
  });
  it('keeps the drawn line within 2 m of the mapped one in plan', () => {
    const P = []; for (let i = 0; i <= 200; i++) P.push(i * 9, 40 * Math.sin(i / 9) + 3 * Math.sin(i * 1.7));
    const S = simplifyRun(P, flat);
    expect(S.length).toBeLessThan(P.length * 0.6);
    for (let i = 0; i < P.length; i += 2) expect(distTo(S, P[i], P[i + 1])).toBeLessThan(2.0001);
  });
  it('keeps the line within 1.5 m of the snow over a bump', () => {
    const z = (x) => (x > 200 && x < 260 ? 6 * Math.sin(((x - 200) / 60) * Math.PI) : 0);
    const P = []; for (let i = 0; i <= 50; i++) P.push(i * 9, 0);
    const S = simplifyRun(P, (x) => z(x));
    expect(S.length).toBeGreaterThan(4);
    for (let k = 2; k < S.length; k += 2) {
      const ax = S[k - 2], bx = S[k];
      for (let x = ax; x <= bx; x += 9) { const f = (x - ax) / (bx - ax || 1); expect(Math.abs(z(ax) + f * (z(bx) - z(ax)) - z(x))).toBeLessThan(1.6); }
    }
  });
  it('leaves short runs alone', () => {
    const P = [0, 0, 5, 5, 10, 0];
    expect(simplifyRun(P, flat)).toBe(P);
  });
});

describe('simpler cables', () => {
  it('keeps a sagging span within the tolerance and drops points on a straight one', () => {
    const pts = []; for (let i = 0; i <= 10; i++) pts.push({ x: i * 10, y: -2.5 * 4 * (i / 10) * (1 - i / 10), z: 0 });
    const s = simplifyPath3(pts, 0.25);
    expect(s[0]).toBe(pts[0]); expect(s[s.length - 1]).toBe(pts[10]);
    expect(s.length).toBeLessThan(pts.length);
    expect(s.length).toBeGreaterThan(2);
    const line = pts.map((p) => ({ ...p, y: 0 }));
    expect(simplifyPath3(line, 0.25)).toHaveLength(2);
  });
});

describe('ground in pieces', () => {
  const grid = (nx, ny, f) => {
    const pos = new Float32Array(nx * ny * 3);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const o = j * nx + i; pos[o * 3] = i * 10; pos[o * 3 + 1] = f(i, j); pos[o * 3 + 2] = -j * 10; }
    return pos;
  };
  it('covers every cell exactly once at full detail, in pieces', () => {
    const nx = 150, ny = 90, S = chunkSurface(grid(nx, ny, (i, j) => Math.sin(i / 7) * 20 + j), nx, ny);
    expect(S.chunks).toHaveLength(3 * 2);
    const seen = new Uint8Array((nx - 1) * (ny - 1));
    for (const ch of S.chunks) {
      const cells = (ch.i1 - ch.i0) * (ch.j1 - ch.j0);
      for (let t = ch.start; t < ch.start + cells * 6; t += 6) {
        const a = S.index[t], i = a % nx, j = Math.floor(a / nx);
        seen[j * (nx - 1) + i]++;
      }
    }
    expect([...seen].every((v) => v === 1)).toBe(true);
  });
  it('a flat piece has no error at any step; a bumpy one more at coarser steps', () => {
    const nx = 65, ny = 65, flat = grid(nx, ny, () => 5), bumpy = grid(nx, ny, (i, j) => ((i * 7 + j * 13) % 5));
    const ch = chunkLayout(nx, ny)[0];
    const hAt = (pos) => (i, j) => pos[(j * nx + i) * 3 + 1];
    for (const st of [1, 2, 4, 8]) expect(levelError(hAt(flat), ch, st)).toBe(0);
    expect(levelError(hAt(bumpy), ch, 2)).toBeGreaterThan(0);
    expect(levelError(hAt(bumpy), ch, 8)).toBeGreaterThanOrEqual(levelError(hAt(bumpy), ch, 2));
  });
  it('an inclined plane is drawn exactly at every step', () => {
    const nx = 65, ny = 65, pos = grid(nx, ny, (i, j) => 3 * i - 2 * j);
    const ch = chunkLayout(nx, ny)[0];
    for (const st of [2, 4, 8]) expect(levelError((i, j) => pos[(j * nx + i) * 3 + 1], ch, st)).toBeLessThan(1e-9);
  });
  it('lines and steps for narrow pieces', () => {
    expect(levelLines(0, 10, 4)).toEqual([0, 4, 8, 10]);
    expect(pieceSteps({ i0: 0, i1: 64, j0: 0, j1: 64 })).toEqual([1, 2, 4, 8]);
    expect(pieceSteps({ i0: 0, i1: 64, j0: 0, j1: 6 })).toEqual([1, 2]);
  });
  it('skirts hang below every edge, face out of the piece, and reach below the worst coarse error', () => {
    const nx = 129, ny = 129, pos = grid(nx, ny, (i, j) => 30 * Math.sin(i / 3) * Math.cos(j / 4)), S = chunkSurface(pos, nx, ny);
    const sk = skirtLayout(nx, ny);
    const ch = S.chunks[0], idx = pieceIndex(ch, 4, nx, sk);
    const cx = (S.pos[(ch.j0 * nx + ch.i0) * 3] + S.pos[(ch.j1 * nx + ch.i1) * 3]) / 2, cz = (S.pos[(ch.j0 * nx + ch.i0) * 3 + 2] + S.pos[(ch.j1 * nx + ch.i1) * 3 + 2]) / 2;
    let skirts = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const v = [idx[t], idx[t + 1], idx[t + 2]];
      if (v.every((q) => q < nx * ny)) continue;
      skirts++;
      const P = v.map((q) => [S.pos[q * 3], S.pos[q * 3 + 1], S.pos[q * 3 + 2]]);
      const u = P[1].map((x, k) => x - P[0][k]), w = P[2].map((x, k) => x - P[0][k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const mx = (P[0][0] + P[1][0] + P[2][0]) / 3 - cx, mz = (P[0][2] + P[1][2] + P[2][2]) / 3 - cz;
      expect(n[0] * mx + n[2] * mz).toBeGreaterThan(0);
    }
    expect(skirts).toBeGreaterThan(0);
    for (let k = 0; k < S.skirtSrc.length; k++) {
      const v = nx * ny + k, src = S.skirtSrc[k];
      expect(S.pos[src * 3 + 1] - S.pos[v * 3 + 1]).toBeGreaterThanOrEqual(4);
    }
    const worst = Math.max(...S.chunks.map((c) => c.errs[c.errs.length - 1]));
    const deepest = Math.max(...S.chunks.map((c) => c.drop));
    expect(deepest).toBeGreaterThanOrEqual(Math.min(150, worst));
  });
  it('left-out cells stay out and keep their piece at full detail', () => {
    const nx = 40, ny = 40, S = chunkSurface(grid(nx, ny, () => 0), nx, ny, { C: 16, skip: (i, j) => i > 10 && i < 20 && j > 10 && j < 20 });
    for (const ch of S.chunks) if (ch.i0 <= 10 && ch.j0 <= 10) expect(ch.steps).toEqual([1]);
    expect(S.chunks.some((ch) => ch.steps.length > 1)).toBe(true);
  });
  it('normals match the area-weighted smooth normals and point up on a plane', () => {
    const nx = 5, ny = 4, N = gridNormals(grid(nx, ny, () => 7), nx, ny);
    for (let v = 0; v < nx * ny; v++) { expect(N[v * 3 + 1]).toBeCloseTo(1); expect(Math.abs(N[v * 3])).toBeLessThan(1e-6); }
  });
  it('picks the coarsest step whose error stays under the pixel limit', () => {
    const errs = [0, 0.5, 2, 9];
    expect(pickLevel(errs, 0.01, 2)).toBe(0);     // 2 cm limit: full detail
    expect(pickLevel(errs, 0.5, 2)).toBe(1);      // 1 m limit
    expect(pickLevel(errs, 5, 2)).toBe(3);        // 10 m limit
  });
});

describe('sharpness while moving', () => {
  it('softer while moving, never below 1x', () => {
    expect(movingPr(2)).toBe(1.25);
    expect(movingPr(1.5)).toBe(1);
    expect(movingPr(1)).toBe(1);
  });
});

describe('the ground of a real map', () => {
  it('Jay Peak: the worker set-up gives the same snow mask, and pieces cover the whole grid', () => {
    const { resort: R, geo } = loadResort('jay-peak'), h = geo.h;
    const p = prepTerrain(prepInput(R, h));
    const { nx, ny } = R.grid;
    expect(p.mask).toHaveLength(nx * ny);
    expect(p.mask).toEqual(snowMask(prepInput(R, h)));
    expect(p.surface.index.length).toBeGreaterThanOrEqual((nx - 1) * (ny - 1) * 6);
    expect(p.fields.field.length).toBe(p.fields.tw * p.fields.th * 4);
    expect(p.mask.some((v) => v === 1)).toBe(true);
  });
});
