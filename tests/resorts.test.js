import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadResort } from './helpers.js';
import { Router } from '../src/routing.js';

const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'));

describe('every built resort', () => {
  it('lists the expected mountains', () => {
    expect(index.map((r) => r.id).sort()).toEqual(['jay-peak', 'smugglers-notch', 'stowe', 'sugarbush']);
  });
  for (const entry of index) {
    it(`${entry.name}: data is sane and every lift end can be reached from every other`, () => {
      const { resort, geo } = loadResort(entry.id);
      expect(resort.id).toBe(entry.id);
      expect(resort.trails.length).toBeGreaterThan(80);
      expect(resort.lifts.length).toBe(entry.lifts);
      // the index's summit point lands inside this resort's map at about the stated elevation
      const [x, y] = geo.toLocal(entry.lat, entry.lon);
      expect(geo.inBounds(x, y)).toBe(true);
      expect(Math.abs(geo.elev(x, y) - entry.top)).toBeLessThan(40);
      const router = new Router(resort), all = { maxDiff: 3, closed: new Set() };
      const ends = resort.pois.filter((p) => p.kind === 'lift' || p.kind === 'lifttop');
      const bad = [];
      for (const a of ends) for (const b of ends) if (a !== b && !router.route({ node: a.n }, { node: b.n }, all).ok) bad.push(`${a.name} -> ${b.name}`);
      expect(bad).toEqual([]);
      for (const e of resort.graph.edges) if (e.k === 'l' && !e.bi) expect(resort.graph.nodes[e.b][2]).toBeGreaterThan(resort.graph.nodes[e.a][2]);
    });
  }
});
