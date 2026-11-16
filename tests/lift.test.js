import { describe, it, expect } from 'vitest';
import { loadResort } from './helpers.js';
import { Router } from '../src/routing.js';
import { LiftSense, Tracker, ST } from '../src/tracker.js';
import { pointAlong, lineLength } from '../src/geo.js';

const { resort, geo } = loadResort();
const lift = (name) => resort.lifts.find((l) => l.name === name);
const trail = (name) => resort.trails.filter((t) => t.name === name).sort((a, b) => b.len - a.len)[0];
/** Positions once a second along a line, from distance d0 to d1 at `speed` m/s (jitter in metres). */
const ride = (pts, d0, d1, speed, t0 = 0, jitter = 0) => {
  const out = [], dir = Math.sign(d1 - d0);
  for (let d = d0, k = 0; dir * (d1 - d) >= 0; d += dir * speed, k++) {
    const p = pointAlong(pts, d);
    out.push([p[0] + Math.sin(k * 1.7) * jitter, p[1] + Math.cos(k * 2.3) * jitter, t0 + k * 1000]);
  }
  return out;
};

describe('lift detection', () => {
  const jet = lift('Jet Triple Chair'), L = lineLength(jet.pts);
  it('notices a lift ride within about ten seconds, with GPS wobble, and knows which lift', () => {
    const s = new LiftSense(resort.lifts, geo);
    let first = -1, on = null;
    ride(jet.pts, 5, L * 0.5, 2.4, 0, 6).forEach(([x, y, t], k) => { on = s.update(x, y, t); if (on && first < 0) first = k; });
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(10);
    expect(on.id).toBe(jet.id);
    expect(on.frac).toBeGreaterThan(0.4);
    expect(on.frac).toBeLessThan(0.6);
  });
  it('stays on the lift while it is stopped, and gets off at the top', () => {
    const s = new LiftSense(resort.lifts, geo);
    let t = 0, on = null;
    for (const [x, y, tt] of ride(jet.pts, 5, L * 0.4, 2.4)) { on = s.update(x, y, tt); t = tt; }
    expect(on).toBeTruthy();
    const stop = pointAlong(jet.pts, L * 0.4);
    for (let k = 1; k <= 90; k++) on = s.update(stop[0] + Math.sin(k) * 3, stop[1] + Math.cos(k) * 3, t + k * 1000);   // 90 s stoppage
    expect(on && on.id).toBe(jet.id);
    for (const [x, y, tt] of ride(jet.pts, L * 0.4, L, 2.4, t + 91000)) on = s.update(x, y, tt);
    expect(on).toBe(null);
  });
  it('does not mistake skiing down under a lift, or standing in the lift line, for riding', () => {
    const s = new LiftSense(resort.lifts, geo);
    let any = false;
    for (const [x, y, t] of ride(jet.pts, L * 0.9, L * 0.1, 9)) any = any || !!s.update(x, y, t);
    expect(any).toBe(false);
    const base = pointAlong(jet.pts, 3);
    for (let k = 0; k < 120; k++) any = any || !!s.update(base[0] + Math.sin(k) * 4, base[1] + Math.cos(k) * 4, 500000 + k * 1000);
    expect(any).toBe(false);
    const t = trail('Upper Northway');
    for (const [x, y, tt] of ride(t.pts, 0, lineLength(t.pts), 10, 900000)) any = any || !!s.update(x, y, tt);
    expect(any).toBe(false);
  });
  it('the stats tracker counts a ride with a stoppage as one lift ride', () => {
    const tr = new Tracker(geo, resort.lifts);
    const feed = (x, y, t) => { const [lat, lon] = geo.toLatLon(x, y); tr.add({ lat, lon, acc: 5, t }); };
    let t = 0;
    for (const [x, y, tt] of ride(jet.pts, 5, L * 0.5, 2.4)) { feed(x, y, tt); t = tt; }
    const stop = pointAlong(jet.pts, L * 0.5);
    for (let k = 1; k <= 60; k++) feed(stop[0], stop[1], t + k * 1000);
    expect(tr.state).toBe(ST.LIFT);
    for (const [x, y, tt] of ride(jet.pts, L * 0.5, L - 2, 2.4, t + 61000)) feed(x, y, tt);
    expect(tr.stats.liftCount).toBe(1);
  });
});

describe('directions while riding a lift', () => {
  const router = new Router(resort, geo), all = { maxDiff: 3, closed: new Set() };
  const base = resort.pois.find((p) => p.name === 'Tramside Base Lodge');
  it('start from the top of the lift you are on, with only the rest of the ride counted', () => {
    const jet = lift('Jet Triple Chair'), mid = pointAlong(jet.pts, lineLength(jet.pts) / 2);
    const r = router.route({ lift: jet.id, frac: 0.5, x: mid[0], y: mid[1] }, { node: base.n }, all);
    expect(r.ok).toBe(true);
    expect(r.steps[0].kind).toBe('lift');
    expect(r.steps[0].name).toBe('Jet Triple Chair');
    expect(r.steps[0].time).toBeGreaterThan(jet.dur * 0.4);
    expect(r.steps[0].time).toBeLessThan(jet.dur * 0.6);        // half the ride, no queue
    expect(r.steps[1].kind).toBe('ski');
    // without knowing about the lift, the same spot is treated as standing on the trail below it
    const naive = router.route({ x: mid[0], y: mid[1] }, { node: base.n }, all);
    expect(naive.steps[0].kind).not.toBe('lift');
  });
});
