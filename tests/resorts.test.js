import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { loadResort } from './helpers.js';
import { Router } from '../src/routing.js';

const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'));

describe('every built resort', () => {
  it('lists the expected mountains', () => {
    expect(index.map((r) => r.id).sort()).toEqual(['alta', 'berkshire-east', 'big-sky', 'bolton-valley', 'breckenridge', 'bretton-woods', 'brundage', 'burke', 'cannon-mountain', 'catamount', 'copper-mountain', 'crystal-mountain', 'deer-valley', 'geto-kogen', 'heavenly', 'hunter-mountain', 'jackson-hole', 'jay-peak', 'keystone', 'killington', 'la-plagne', 'les-arcs', 'les-contamines', 'loon', 'magic-mountain', 'mammoth', 'mohawk-mountain', 'mount-snow', 'mount-southington', 'okemo', 'palisades-tahoe', 'park-city', 'pats-peak', 'pizol', 'powder-ridge', 'ragged', 'saalbach', 'saddleback', 'ski-sundown', 'skiwelt', 'smugglers-notch', 'snowbird', 'snowshoe', 'solitude', 'steamboat', 'stowe', 'stratton', 'sugarbush', 'sugarloaf', 'sunday-river', 'telluride', 'tignes-val-disere', 'vail', 'val-thorens', 'wachusett', 'waterville-valley', 'whiteface', 'windham-mountain', 'winter-park', 'zermatt']);
  });
  // resorts kept in R2 are only checked where they have been downloaded (node tools/maps_r2.mjs pull --all)
  for (const entry of index.filter((e) => existsSync(`public/data/${e.id}/resort.json`))) {
    it(`${entry.name}: data is sane and every lift end can be reached from every other`, () => {
      const { resort, geo } = loadResort(entry.id);
      expect(resort.id).toBe(entry.id);
      expect(resort.trails.length).toBeGreaterThan(entry.trails < 30 ? 7 : 30);
      expect(resort.lifts.length).toBe(entry.lifts);
      // the index's summit point lands inside this resort's map at about the stated elevation
      const [x, y] = geo.toLocal(entry.lat, entry.lon);
      expect(geo.inBounds(x, y)).toBe(true);
      expect(Math.abs(geo.elev(x, y) - entry.top)).toBeLessThan(40);
      const router = new Router(resort, geo), all = { maxDiff: 3, closed: new Set() };
      // lifts that really do stand alone (a village beginner tow) are listed in the resort data
      const lone = [...(resort.isolated || []), ...resort.lifts.flatMap((l, i) => (l.hide ? [i] : []))]; // hidden lifts are not shown or routed to
      const alone = new Set(lone.flatMap((i) => [`${resort.lifts[i].name} (base)`, `${resort.lifts[i].name} (top)`]));
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
      // every run confirmed against the resort's own list can be reached: its top is on the lift network
      {
        const { nodes, edges } = resort.graph, adj = new Map();
        const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
        for (const e of edges) { link(e.a, e.b); if (e.bi) link(e.b, e.a); }
        const seen = new Set(edges.filter((e) => e.k === 'l').flatMap((e) => (e.bi ? [e.a, e.b] : [e.b])));
        const stack = [...seen];
        while (stack.length) for (const v of adj.get(stack.pop()) || []) if (!seen.has(v)) { seen.add(v); stack.push(v); }
        const top = new Map();
        for (const e of edges) if (e.k === 'p' && (!top.has(e.r) || nodes[e.a][2] > nodes[top.get(e.r)][2])) top.set(e.r, e.a);
        const cut = resort.trails.filter((t) => t.ok && top.has(t.id) && !seen.has(top.get(t.id))).map((t) => t.name);
        expect(cut).toEqual([]);
      }
      // existence check (tools/verify_exists.py): every run shown is on the resort's list, confirmed by hand,
      // or a linking piece; anything hidden says why
      expect(resort.sources.checked).toBeTruthy();
      for (const t of resort.trails) if (t.hide) expect(typeof t.hide).toBe('string');
      for (const l of resort.lifts) if (l.hide) expect(typeof l.hide).toBe('string');
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

describe('existence check', () => {
  // like the other map tests, it needs the map downloaded from R2 (node tools/maps_r2.mjs pull --all)
  it.skipIf(!existsSync('public/data/sunday-river/resort.json'))('Sunday River: the Merrill Hill II chair and the runs not on the resort map are hidden', () => {
    const { resort } = loadResort('sunday-river');
    expect(resort.lifts.find((l) => l.name === 'Merrill Hill II').hide).toBeTruthy();
    expect(resort.lifts.find((l) => l.name === 'Merrill Hill Triple').hide).toBeFalsy();
    expect(resort.trails.find((t) => t.name === 'Brilliant').hide).toBeTruthy();
    expect(resort.trails.find((t) => t.osm === 1259470011).hide).toBeTruthy();
    for (const n of ['Spectra', 'Prism', 'Double Refraction']) expect(resort.trails.find((t) => t.name === n).hide).toBeFalsy();
    const router = new Router(resort);
    const hidden = new Set(resort.trails.flatMap((t, i) => (t.hide ? [i] : [])));
    expect(router.edges.some((e) => e.k === 'p' && hidden.has(e.r))).toBe(false);
  });
});
