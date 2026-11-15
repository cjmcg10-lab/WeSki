import { describe, it, expect } from 'vitest';
import { loadResort } from './helpers.js';
import { Router, suggestMeetingPoint } from '../src/routing.js';
import { Tracker, ST } from '../src/tracker.js';
import { pointAlong, lineLength } from '../src/geo.js';
import { newRoom, applyMessage, publicState, MAX_MEMBERS } from '../worker/room.js';

const { resort, geo } = loadResort();
const router = new Router(resort);
const poi = (name) => resort.pois.find((p) => p.name === name);
const trail = (name) => resort.trails.find((t) => t.name === name);
const lift = (name) => resort.lifts.find((l) => l.name === name);

describe('geo', () => {
  it('round-trips lat/lon and matches known summit elevation', () => {
    const [x, y] = geo.toLocal(44.9242294, -72.5256931); // Jay Peak summit (OSM), 1177 m
    const [lat, lon] = geo.toLatLon(x, y);
    expect(lat).toBeCloseTo(44.9242294, 6);
    expect(lon).toBeCloseTo(-72.5256931, 6);
    expect(geo.elev(x, y)).toBeGreaterThan(1150);
    expect(geo.elev(x, y)).toBeLessThan(1185);
  });
  it('whole-mountain data is present', () => {
    expect(resort.lifts.length).toBe(9);
    expect(resort.trails.length).toBeGreaterThan(100);
    expect(resort.parks.map((p) => p.name)).toEqual(expect.arrayContaining(['The Rusch', 'Rabbit Park', 'The Rabbit Hole', 'Shakedown', 'The Gully']));
    expect(resort.trails.filter((t) => t.slow).length).toBeGreaterThan(8);
  });
});

describe('routing', () => {
  const all = { maxDiff: 3, closed: new Set() };
  it('routes base to summit by lift', () => {
    const r = router.route({ node: poi('Tramside Base Lodge').n }, { node: poi('Sky Haus Deli').n }, all);
    expect(r.ok).toBe(true);
    expect(r.steps.some((s) => s.kind === 'lift')).toBe(true);
    expect(r.vertUp).toBeGreaterThan(500);
  });
  it('stays within the maximum difficulty when a way exists', () => {
    const from = { node: poi('Aerial Tram (top)').n }, to = { node: poi('Tramside Base Lodge').n };
    for (const maxDiff of [1, 2, 3]) {
      const r = router.route(from, to, { maxDiff, closed: new Set() });
      expect(r.ok).toBe(true);
      expect(r.over).toEqual([]);
      expect(Math.max(...r.steps.filter((s) => s.kind === 'ski').map((s) => s.d))).toBeLessThanOrEqual(maxDiff);
    }
  });
  it('still gives directions from a trail above the limit, leaving it as soon as possible', () => {
    const jfk = trail('JFK'), a = pointAlong(jfk.pts, jfk.len * 0.3);
    const to = { node: poi('Tramside Base Lodge').n };
    const r = router.route({ x: a[0], y: a[1] }, to, { maxDiff: 0, closed: new Set() });
    expect(r.ok).toBe(true);
    expect(r.overNow).toBe(true);
    expect(r.over.length).toBeGreaterThan(0);
    const free = router.route({ x: a[0], y: a[1] }, to, { maxDiff: 3, closed: new Set() });
    const overDist = (x, max) => x.steps.filter((s) => s.kind === 'ski' && s.d > max).reduce((n, s) => n + s.dist, 0);
    expect(overDist(r, 0)).toBeLessThanOrEqual(overDist(free, 0)); // no more hard terrain than the unrestricted route
    expect(r.time).toBeLessThan(3600); // reported time is real time, not the penalised search cost
  });
  it('warns rather than refuses when the only way is above the limit', () => {
    // From the tram summit there is no green way down: the route must exist and flag the harder trails.
    const r = router.route({ node: poi('Aerial Tram (top)').n }, { node: poi('Tramside Base Lodge').n }, { maxDiff: 0, closed: new Set() });
    expect(r.ok).toBe(true);
    expect(r.over.length).toBeGreaterThan(0);
    expect(r.overNow).toBe(false);
  });
  it('avoids confirmed closures and reports when limits block the way', () => {
    const from = { node: poi('Tramside Base Lodge').n }, to = { node: poi('Sky Haus Deli').n };
    const open = router.route(from, to, all);
    const usedLift = open.steps.find((s) => s.kind === 'lift');
    const closed = new Set(['l' + usedLift.ref]);
    const r2 = router.route(from, to, { maxDiff: 3, closed });
    if (r2.ok) expect(r2.steps.some((s) => s.kind === 'lift' && s.ref === usedLift.ref)).toBe(false);
    const allLifts = new Set(resort.lifts.map((l) => 'l' + l.id));
    expect(router.route(from, to, { maxDiff: 3, closed: allLifts })).toEqual({ ok: false, reason: 'no_route_closures' });
  });
  it('never skis uphill or rides a lift down', () => {
    const r = router.route({ node: poi('Stateside Hotel & Base Lodge').n }, { node: poi('Tramside Base Lodge').n }, all);
    expect(r.ok).toBe(true);
    for (const e of resort.graph.edges) if (e.k === 'l') expect(resort.graph.nodes[e.b][2]).toBeGreaterThan(resort.graph.nodes[e.a][2]);
  });
  it('routes between arbitrary points on trails and flags off-network places', () => {
    const v = trail('Vermonter'), u = trail('Interstate');
    const a = pointAlong(v.pts, 200), b = pointAlong(u.pts, 300);
    const r = router.route({ x: a[0] + 8, y: a[1] }, { x: b[0], y: b[1] }, all);
    expect(r.ok).toBe(true);
    expect(r.pts.length).toBeGreaterThan(10);
    expect(Math.hypot(r.pts[0] - a[0], r.pts[1] - a[1])).toBeLessThan(15);
    expect(router.route({ x: 50, y: 50 }, { x: b[0], y: b[1] }, all).reason).toBe('from_off_network');
    expect(router.route({ x: a[0], y: a[1] }, { x: 50, y: 50 }, all).reason).toBe('to_off_network');
  });
  it('suggests a shared meeting point', () => {
    const v = trail('Vermonter'), a = pointAlong(v.pts, 200);
    const m = suggestMeetingPoint(router, { x: a[0], y: a[1] }, null, all);
    expect(m.poi.name).toBeTruthy();
  });
});

describe('tracker', () => {
  // Simulate: ride the Flyer up, ski Ullr's Dream-ish trail down, with a GPS spike thrown in.
  function run() {
    const tr = new Tracker(geo, resort.lifts);
    let t = 1_700_000_000_000;
    const feed = (pts, speed, spikeAt = -1) => {
      const L = lineLength(pts);
      for (let d = 0; d < L; d += speed, t += 1000) {
        const [x, y] = pointAlong(pts, d);
        let [lat, lon] = geo.toLatLon(x, y);
        if (Math.round(d / speed) === spikeAt) lat += 0.01; // ~1.1 km jump
        tr.add({ lat, lon, acc: 8, t });
      }
    };
    const flyer = lift('Flyer Express Quad');
    feed(flyer.pts, 5);
    for (let i = 0; i < 20; i++, t += 1000) { const [lat, lon] = geo.toLatLon(flyer.pts.at(-2), flyer.pts.at(-1)); tr.add({ lat, lon, acc: 8, t }); }
    const down = trail('Vermonter');
    feed(down.pts.slice(0, 2).concat(down.pts.slice(0, 2)), 9); // (teleport to the trail start: test shortcut)
    for (let i = 0; i < 5; i++, t += 1000) { const [lat, lon] = geo.toLatLon(down.pts[0], down.pts[1]); tr.add({ lat, lon, acc: 8, t }); }
    const before = tr.rejected;
    feed(down.pts, 9, 30);
    return { tr, down, flyer, spikes: tr.rejected - before };
  }
  it('separates lift rides from skiing and filters spikes', () => {
    const { tr, down, flyer, spikes } = run();
    const s = tr.stats;
    expect(spikes).toBe(1);
    expect(s.liftCount).toBe(1);
    expect(s.runCount).toBe(1);
    expect(s.liftVert).toBeGreaterThan((flyer.top - flyer.bot) * 0.8);
    expect(s.skiDist).toBeGreaterThan(down.len * 0.8);
    expect(s.skiDist).toBeLessThan(down.len * 1.1);
    expect(s.vert).toBeGreaterThan((down.top - down.bot) * 0.8);
    expect(s.vert).toBeLessThan((down.top - down.bot) * 1.3);
    expect(s.topSpeed).toBeGreaterThan(8);
    expect(s.topSpeed).toBeLessThan(12); // the 1 km spike must not leak into top speed
    expect(s.avgSpeed).toBeGreaterThan(7);
    expect(s.avgSpeed).toBeLessThan(10);
    expect(tr.state).toBe(ST.SKI);
  });
  it('rejects inaccurate fixes', () => {
    const tr = new Tracker(geo, []);
    expect(tr.add({ lat: 44.93, lon: -72.51, acc: 500, t: 1 }).ok).toBe(false);
  });
});

describe('group room', () => {
  const hello = (i) => ({ t: 'hello', id: 'member-' + String(i).padStart(4, '0'), name: 'P' + i, avatar: 'girl-board', color: '#00aaff' });
  it('caps at 20 members, lets existing members rejoin', () => {
    const room = newRoom('ABCDEF', 0);
    for (let i = 0; i < MAX_MEMBERS; i++) expect(applyMessage(room, null, hello(i), 1).join).toBeTruthy();
    expect(applyMessage(room, null, hello(99), 1).error).toBe('full');
    expect(applyMessage(room, null, hello(3), 1).join).toBe('member-0003');
  });
  it('only stores positions after opt-in and keeps last update time when paused', () => {
    const room = newRoom('ABCDEF', 0);
    const id = applyMessage(room, null, hello(1), 1).join;
    applyMessage(room, id, { t: 'pos', lat: 44.93, lon: -72.51 }, 2);
    expect(room.members[id].pos).toBe(null);
    applyMessage(room, id, { t: 'share', on: true }, 3);
    applyMessage(room, id, { t: 'pos', lat: 44.93, lon: -72.51, acc: 5 }, 1000);
    applyMessage(room, id, { t: 'share', on: false }, 2000);
    applyMessage(room, id, { t: 'pos', lat: 45, lon: -72 }, 3000);
    const st = publicState(room, new Set([id]), 4000);
    expect(st.members[0]).toMatchObject({ sharing: false, online: true, pos: { lat: 44.93, at: 1000 } });
    applyMessage(room, id, { t: 'share', on: false, clear: true }, 5000);
    expect(room.members[id].pos).toBe(null);
  });
  it('only the creator can close; leaving hands over ownership', () => {
    const room = newRoom('ABCDEF', 0);
    const a = applyMessage(room, null, hello(1), 1).join, b = applyMessage(room, null, hello(2), 1).join;
    expect(applyMessage(room, b, { t: 'close' }, 2).error).toBe('not_owner');
    expect(applyMessage(room, a, { t: 'leave' }, 3).left).toBe(true);
    expect(applyMessage(room, b, { t: 'close' }, 4).closed).toBe(true);
  });
  it('sanitises names and rejects junk', () => {
    const room = newRoom('ABCDEF', 0);
    expect(applyMessage(room, null, { t: 'hello', id: 'x', name: 'a' }, 1).error).toBe('bad_id');
    const id = applyMessage(room, null, { ...hello(1), name: '<b>Zed</b>' + 'x'.repeat(50) }, 1).join;
    expect(room.members[id].name.length).toBeLessThanOrEqual(20);
    expect(room.members[id].name).not.toMatch(/[<>]/);
    expect(applyMessage(room, id, { t: 'pos', lat: 999, lon: 0 }, 2).changed).toBe(false);
  });
});

import { matchTrails, exploredIds, trailChecklist } from '../src/explored.js';
describe('explored trails', () => {
  it('marks only trails that were actually skied', () => {
    const v = trail('Vermonter'), P = [];
    let t = 0;
    for (let d = 0; d < v.len; d += 9, t += 1000) { const [x, y] = pointAlong(v.pts, d); P.push([t, x + 4, y, 0, ST.SKI, 0]); }
    const flyer = lift('Flyer Express Quad'); // a lift ride over other trails must not count
    for (let d = 0; d < flyer.len; d += 5, t += 1000) { const [x, y] = pointAlong(flyer.pts, d); P.push([t, x, y, 0, ST.LIFT, 0]); }
    const ids = exploredIds(resort, matchTrails(resort, P));
    const done = trailChecklist(resort, ids).filter((x) => x.done).map((x) => x.name);
    expect(done).toContain('Vermonter');
    expect(done.length).toBeLessThanOrEqual(3); // Vermonter plus at most a junction neighbour
    expect(trailChecklist(resort, new Set()).every((x) => !x.done)).toBe(true);
  });
});
