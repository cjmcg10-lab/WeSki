import { describe, it, expect } from 'vitest';
import { loadResort } from './helpers.js';
import { Router, TOLERANCE } from '../src/routing.js';
import { Guide, phrase } from '../src/voice.js';
import { pointAlong, lineLength } from '../src/geo.js';

const { resort, geo } = loadResort();
const router = new Router(resort, geo);
const all = { maxDiff: 3, closed: new Set() };
const trail = (name) => resort.trails.filter((t) => t.name === name).sort((a, b) => b.len - a.len)[0];
/** Stand part-way down a trail and ask for a spot `back` metres behind you. */
const backUp = (name, frac, back) => {
  const t = trail(name), at = lineLength(t.pts) * frac;
  const a = pointAlong(t.pts, at), b = pointAlong(t.pts, at - back);
  return { from: { x: a[0], y: a[1] }, to: { x: b[0], y: b[1] }, rise: geo.elev(b[0], b[1]) - geo.elev(a[0], a[1]) };
};

describe('uphill tolerance', () => {
  it('climbs a short way back instead of lapping the lift', () => {
    const c = backUp("Lower Ullr's Dream", 0.5, 80);
    expect(c.rise).toBeGreaterThan(3);
    expect(c.rise).toBeLessThan(15);
    const old = router.route(c.from, c.to, { ...all, tol: 'none' });
    const now = router.route(c.from, c.to, { ...all, tol: 'normal' });
    expect(old.steps.some((s) => s.kind === 'lift')).toBe(true);          // the old behaviour: all the way down and back up
    expect(now.steps.some((s) => s.kind === 'lift')).toBe(false);
    expect(now.steps[0].kind).toBe('up');
    expect(now.climb).toBeGreaterThan(2);
    expect(now.time).toBeLessThan(old.time / 2);
    expect(now.dist).toBeLessThan(120);
  });
  it('never suggests a real hike: a long way back up still goes round by lift', () => {
    const c = backUp('Upper Northway', 0.8, 600);
    expect(c.rise).toBeGreaterThan(50);
    for (const tol of ['low', 'normal', 'high']) {
      const r = router.route(c.from, c.to, { ...all, tol });
      expect(r.ok).toBe(true);
      expect(r.steps.some((s) => s.kind === 'lift')).toBe(true);
      expect(r.climb).toBeLessThanOrEqual(TOLERANCE[tol].cap + 0.01);
    }
  });
  it('keeps every route within the climb cap, and each level allows at least what the one below does', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const named = resort.trails.filter((t) => t.name && !t.hide && !t.unof && t.len > 250);
    const pick = () => { const t = named[Math.floor(rnd() * named.length)]; const p = pointAlong(t.pts, rnd() * lineLength(t.pts)); return { x: p[0], y: p[1] }; };
    for (let i = 0; i < 40; i++) {
      const a = pick(), b = pick(), cost = {};
      for (const tol of ['none', 'low', 'normal', 'high']) {
        const r = router.route(a, b, { ...all, tol });
        expect(r.ok).toBe(true);
        expect(r.climb).toBeLessThanOrEqual(TOLERANCE[tol].cap + 0.01);
        if (tol === 'none') expect(r.steps.every((s) => s.climb < 0.5)).toBe(true);
        cost[tol] = r.time;
      }
      // more tolerance never makes the trip meaningfully slower in real time than taking no uphill at all would
      expect(cost.low).toBeLessThanOrEqual(cost.none * 1.6 + 120);
    }
  });
  it('cuts across to a neighbouring trail only over gentle ground', () => {
    const cross = router.edges.filter((e) => e.k === 'v');
    expect(cross.length).toBeGreaterThan(100);
    for (const e of cross) {
      expect(e.len).toBeLessThanOrEqual(70.5);
      expect(e.prof.side).toBeLessThanOrEqual(TOLERANCE.high.side);
      expect(e.prof.rough).toBeLessThanOrEqual(5);
    }
    // the low setting accepts fewer of them than the high one
    const usable = (tol) => cross.filter((e) => router.leg(e, false, e.len, { tol }) || router.leg(e, true, e.len, { tol })).length;
    expect(usable('low')).toBeLessThan(usable('high'));
  });
  it('describes climbs so nobody is surprised', () => {
    const c = backUp("Lower Ullr's Dream", 0.5, 80);
    const s = router.route(c.from, c.to, { ...all, tol: 'normal' }).steps[0];
    expect(s.name).toBe("Lower Ullr's Dream");
    expect(s.grade).toBeGreaterThanOrEqual(0);
    expect(s.climb).toBeGreaterThan(2);
  });
});

describe('spoken directions', () => {
  const fmt = (m) => `${Math.round(m / 10) * 10} metres`;
  const steps = (left) => [
    { kind: 'ski', name: 'Upper Northway', dist: left, turn: 0 },
    { kind: 'ski', name: 'Taxi', dist: 300, turn: -70 },
    { kind: 'lift', name: 'Jet Triple', dist: 900, turn: 10 },
  ];
  const nav = (left, extra = {}) => ({ name: 'Sky Haus', route: { time: 600, steps: steps(left) }, ...extra });

  it('opens with the first two steps and the time', () => {
    const g = new Guide(fmt);
    expect(g.update(nav(800, { fresh: true }), 8)).toEqual(['Ski Upper Northway, then turn left onto Taxi. 10 minutes to Sky Haus.']);
  });
  it('gives a heads-up, then the turn itself early enough for the speed, each only once', () => {
    const g = new Guide(fmt);
    g.update(nav(800, { fresh: true }), 10);
    expect(g.update(nav(600), 10)).toEqual([]);
    expect(g.update(nav(240), 10)).toEqual(['In 240 metres, turn left onto Taxi.']);
    expect(g.update(nav(200), 10)).toEqual([]);
    // at 10 m/s the turn is called 9 s + GPS slack ahead: 105 m
    expect(g.update(nav(110), 10)).toEqual([]);
    expect(g.update(nav(100), 10)).toEqual(['Turn left onto Taxi.']);
    expect(g.update(nav(60), 10)).toEqual([]);
  });
  it('calls the turn later for a slow skier and earlier for a fast one', () => {
    const slow = new Guide(fmt), fast = new Guide(fmt);
    slow.update(nav(800, { fresh: true }), 3); fast.update(nav(800, { fresh: true }), 15);
    expect(slow.update(nav(100), 3).join()).not.toContain('Turn left');
    expect(slow.update(nav(40), 3)).toEqual(['Turn left onto Taxi.']);
    expect(fast.update(nav(145), 15)).toEqual(['Turn left onto Taxi.']);
  });
  it('announces the next step as the list shortens, a reroute, and arrival', () => {
    const g = new Guide(fmt);
    g.update(nav(800, { fresh: true }), 8);
    g.update(nav(50), 8);
    const two = { name: 'Sky Haus', route: { time: 400, steps: steps(0).slice(1) } };
    two.route.steps[0].dist = 60;
    expect(g.update(two, 8)).toEqual(['Ride the Jet Triple.']);
    const re = { name: 'Sky Haus', fresh: true, rerouted: true, route: { time: 300, steps: [{ kind: 'ski', name: 'Goat Run', dist: 500, turn: 0 }] } };
    expect(g.update(re, 8)).toEqual(['Rerouting. Ski Goat Run. 5 minutes to Sky Haus.']);
    expect(g.update({ ...re, fresh: false, arrived: true }, 0)).toEqual(['You have arrived at Sky Haus.']);
    expect(g.update({ ...re, fresh: false, arrived: true }, 0)).toEqual([]);
  });
  it('words climbs and cut-acrosses plainly', () => {
    expect(phrase({ kind: 'up', name: 'Taxi', dist: 40, grade: 2 }, fmt)).toBe('sidestep back up 40 metres on Taxi');
    expect(phrase({ kind: 'up', name: 'Taxi', dist: 90, grade: 0 }, fmt)).toBe('skate back 90 metres along Taxi');
    expect(phrase({ kind: 'cross', to: 'Kangaroo Trail', dist: 50, turn: 80 }, fmt, true)).toBe('cut across to the right 50 metres to Kangaroo Trail');
  });
});
