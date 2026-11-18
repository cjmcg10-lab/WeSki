import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadResort } from './helpers.js';
import { Router } from '../src/routing.js';

const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'));

describe('every built resort', () => {
  it('lists the expected mountains', () => {
    expect(index.map((r) => r.id).sort()).toEqual(['berkshire-east', 'bolton-valley', 'breckenridge', 'brundage', 'burke', 'cannon-mountain', 'catamount', 'copper-mountain', 'geto-kogen', 'heavenly', 'jay-peak', 'keystone', 'killington', 'la-plagne', 'les-arcs', 'les-contamines', 'loon', 'magic-mountain', 'mammoth', 'mount-snow', 'okemo', 'park-city', 'pats-peak', 'pizol', 'ragged', 'saalbach', 'saddleback', 'skiwelt', 'smugglers-notch', 'steamboat', 'stowe', 'stratton', 'sugarbush', 'sugarloaf', 'sunday-river', 'tignes-val-disere', 'vail', 'val-thorens', 'waterville-valley', 'whiteface', 'winter-park', 'zermatt']);
  });
  for (const entry of index) {
    it(`${entry.name}: data is sane and every lift end can be reached from every other`, () => {
      const { resort, geo } = loadResort(entry.id);
      expect(resort.id).toBe(entry.id);
      expect(resort.trails.length).toBeGreaterThan(entry.id === 'geto-kogen' ? 10 : 30);
      expect(resort.lifts.length).toBe(entry.lifts);
      // the index's summit point lands inside this resort's map at about the stated elevation
      const [x, y] = geo.toLocal(entry.lat, entry.lon);
      expect(geo.inBounds(x, y)).toBe(true);
      expect(Math.abs(geo.elev(x, y) - entry.top)).toBeLessThan(40);
      const router = new Router(resort, geo), all = { maxDiff: 3, closed: new Set() };
      // lifts that really do stand alone (a village beginner tow) are listed in the resort data
      const alone = new Set((resort.isolated || []).flatMap((i) => [`${resort.lifts[i].name} (base)`, `${resort.lifts[i].name} (top)`]));
      const ends = resort.pois.filter((p) => (p.kind === 'lift' || p.kind === 'lifttop') && !alone.has(p.name));
      const bad = [];
      // Small resorts: every pair. Big ones (hundreds of lift ends): every end to and from two
      // hubs, which proves the same thing in a fraction of the time.
      if (ends.length <= 40) {
        for (const a of ends) for (const b of ends) if (a !== b && !router.route({ node: a.n }, { node: b.n }, all).ok) bad.push(`${a.name} -> ${b.name}`);
      } else {
        for (const hub of [ends[0], ends[ends.length >> 1]]) for (const e of ends) {
          if (e === hub) continue;
          if (!router.route({ node: hub.n }, { node: e.n }, all).ok) bad.push(`${hub.name} -> ${e.name}`);
          if (!router.route({ node: e.n }, { node: hub.n }, all).ok) bad.push(`${e.name} -> ${hub.name}`);
        }
      }
      expect(bad).toEqual([]);
      // zones: only known kinds, with geometry inside the map
      const kinds = ['slow', 'family', 'race', 'park', 'extreme', 'free'];
      for (const t of resort.trails) if (t.z) expect(kinds).toContain(t.z);
      for (const z of [...(resort.zones || []), ...resort.parks]) {
        if (z.kind) expect(['learn', 'sled', 'race']).toContain(z.kind);
        expect(z.name).toBeTruthy();
        expect(z.pts.length).toBeGreaterThanOrEqual(4);
        expect(geo.inBounds(z.pts[0], z.pts[1])).toBe(true);
      }
      for (const e of resort.graph.edges) if (e.k === 'l' && !e.bi) expect(resort.graph.nodes[e.b][2]).toBeGreaterThan(resort.graph.nodes[e.a][2]);
    });
  }
});
