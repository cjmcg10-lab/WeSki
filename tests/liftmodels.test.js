import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as M from '../src/models.js';

const bounds = (g) => { g.computeBoundingBox(); return g.boundingBox; };
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

describe('lift models', () => {
  it('chair: seat surface stays where riders sit (y = -3.33), wider with more seats, hangs below the cable', () => {
    for (const n of [2, 4, 6]) {
      const g = M.chairGeometry(n), b = bounds(g);
      expect(b.max.y).toBeLessThan(0.5);
      expect(b.min.y).toBeLessThan(-3.7);
      const pos = g.attributes.position;
      let seatTop = -Infinity;
      // the top face of the seat cushion: the highest vertex below the armrests in the seat's depth
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), z = pos.getZ(i); if (y < -3.2 && y > -3.45 && z > 0.3) seatTop = Math.max(seatTop, y); }
      expect(seatTop).toBeCloseTo(-3.33, 2);
    }
    expect(bounds(M.chairGeometry(6)).max.x).toBeGreaterThan(bounds(M.chairGeometry(2)).max.x);
  });

  it('far versions are much lighter than the near ones', () => {
    expect(tris(M.chairFarGeometry(4))).toBeLessThan(tris(M.chairGeometry(4)) / 3);
    expect(tris(M.gondolaFarGeometry())).toBeLessThan(tris(M.gondolaGeometry()) / 4);
    expect(tris(M.chairGeometry(6, true))).toBeLessThan(400);
    expect(tris(M.gondolaGeometry())).toBeLessThan(400);
  });

  it('bubble: a shell over the seat, raised behind the chair by turning it about its pivot', () => {
    const g = M.bubbleGeometry(4), b = bounds(g);
    expect(b.max.z).toBeGreaterThan(0.7);              // lowered: reaches out in front of the seat
    const [x, y, z] = M.BUBBLE_PIVOT;
    const up = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(-1.9)).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
    const r = bounds(g.clone().applyMatrix4(up));
    expect(r.max.z).toBeLessThan(0.6);                 // raised: nothing left in front
  });

  it('towers: a one-metre pole and a head for each kind of lift', () => {
    for (const k of ['chair', 'gondola', 'tram', 'surface']) {
      const p = bounds(M.towerPoleGeometry(k));
      expect(p.min.y).toBeCloseTo(0, 6);
      expect(p.max.y).toBeCloseTo(1, 6);
      const h = bounds(M.towerHeadGeometry(k, 2.4));
      expect(h.max.y).toBeLessThanOrEqual(0.2);         // the cable rests on top of the sheaves
      expect(h.min.y).toBeGreaterThanOrEqual(-M.TOWER_HEAD[k] - 0.45);
    }
  });

  it('stations: every kind builds, both ends; the detachable housing is longer', () => {
    for (const k of ['chair', 'gondola', 'tram', 'surface']) for (const end of [0, 1]) {
      const g = M.stationGeometry(k, 0x8b2f2f, 7.5, 2.4, { end, drive: !end, detach: k === 'chair' });
      expect(g.attributes.position.count).toBeGreaterThan(0);
      expect(g.attributes.color).toBeTruthy();
    }
    const len = (o) => { const b = bounds(M.stationGeometry('chair', 0x8b2f2f, 7.5, 2.4, o)); return b.max.z - b.min.z; };
    expect(len({ detach: true })).toBeGreaterThan(len({ detach: false }) + 8);
  });

  it('magic-carpet belt follows its points', () => {
    const g = M.beltGeometry([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2, 20), new THREE.Vector3(3, 4, 40)]), b = bounds(g);
    expect(b.max.z).toBeGreaterThan(39);
    expect(b.min.z).toBeLessThan(1);
    expect(M.beltGeometry([new THREE.Vector3()])).toBe(null);
  });
});

describe('buildings', () => {
  const square = [[0, 0], [12, 0], [12, 10], [0, 10]];
  const build = (shape, o) => { const out = { pos: [], col: [], win: [] }; M.addBuilding(out, square, 100, 7, new THREE.Color(1, 1, 1), new THREE.Color(0.5, 0.5, 0.5), shape, o); return out; };

  it('one colour and one window record per vertex', () => {
    for (const shape of ['flat', 'hipped', 'gabled']) {
      const out = build(shape, { storey: 3.5, chimney: true });
      const n = out.pos.length / 3;
      expect(out.col.length).toBe(n * 3);
      expect(out.win.length).toBe(n * 4);
    }
  });

  it('pitched roofs overhang the walls; flat ones do not', () => {
    const xs = (out) => out.pos.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs(build('hipped')))).toBeLessThan(-0.3);
    expect(Math.max(...xs(build('gabled')))).toBeGreaterThan(12.3);
    expect(Math.min(...xs(build('flat')))).toBeCloseTo(0, 6);
  });

  it('a chimney adds a little, and rises above the ridge', () => {
    const a = build('gabled'), b = build('gabled', { chimney: true });
    expect(b.pos.length - a.pos.length).toBe(10 * 9);
    const ys = (out) => out.pos.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys(b))).toBeGreaterThan(Math.max(...ys(a)) + 0.5);
  });

  it('walls carry window coordinates, roofs do not', () => {
    const out = build('hipped', { storey: 3.5 }), w = out.win;
    let walls = 0, roofs = 0;
    for (let i = 0; i < w.length; i += 4) { if (w[i + 3] > 0) { walls++; expect(w[i + 2]).toBe(3.5); } else roofs++; }
    expect(walls).toBe(4 * 6);
    expect(roofs).toBeGreaterThan(0);
    // a shed gets no windows
    const shed = { pos: [], col: [], win: [] };
    M.addBuilding(shed, [[0, 0], [3, 0], [3, 3], [0, 3]], 0, 2.4, new THREE.Color(), new THREE.Color(), 'gabled');
    expect(shed.win.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });

  it('windows are dark by day and lit at night', () => {
    expect(M.windowGlow(12)).toBe(0);
    expect(M.windowGlow(15.5)).toBe(0);
    expect(M.windowGlow(22)).toBe(1);
    expect(M.windowGlow(3)).toBe(1);
    expect(M.windowGlow(16.75)).toBeGreaterThan(0.2);
    expect(M.windowGlow(16.75)).toBeLessThan(0.8);
    expect(M.windowGlow(9)).toBe(0);
    expect(M.windowGlow(-2)).toBe(1);
    expect(M.windowGlow(26)).toBe(1);
  });
});
