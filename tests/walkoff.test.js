import { describe, it, expect } from 'vitest';
import { loadResort } from './helpers.js';
import { Router } from '../src/routing.js';
import { phrase } from '../src/voice.js';

const { resort, geo } = loadResort();
const router = new Router(resort, geo);
const all = { maxDiff: 3, closed: new Set() };

/** A spot 300 to 600 m from every trail, lift and walkway: a cabin in the woods, a friend who wandered off. */
function offTrailSpot() {
  const p = resort.lifts[0].pts, x0 = p.at(-2), y0 = p.at(-1);
  for (let r = 300; r <= 1500; r += 100)
    for (let a = 0; a < 360; a += 15) {
      const x = x0 + r * Math.cos((a * Math.PI) / 180), y = y0 + r * Math.sin((a * Math.PI) / 180);
      const s = router._snaps(x, y, 0, 1000)[0];
      if (s && s.d > 300 && s.d < 600) return { x, y, d: s.d };
    }
  return null;
}

describe('walking off the trails', () => {
  const spot = offTrailSpot();
  const base = { x: resort.lifts[0].pts[0], y: resort.lifts[0].pts[1] };

  it('finds a test spot away from the network', () => expect(spot).not.toBeNull());

  it('routes to a place off the trails with a final walking leg', () => {
    const r = router.route({ x: base.x, y: base.y }, { x: spot.x, y: spot.y }, all);
    expect(r.ok).toBe(true);
    const last = r.steps.at(-1);
    expect(last.kind).toBe('offwalk');
    expect(last.dist).toBeGreaterThan(spot.d - 5);
    expect(r.walk.length).toBeGreaterThan(0);
    const w = r.walk.at(-1);
    expect(Math.hypot(w.at(-2) - spot.x, w.at(-1) - spot.y)).toBeLessThan(1);
    expect(phrase(last, (m) => `${Math.round(m)} m`)).toMatch(/off the trail/);
  });

  it('starts with a walking leg when you stand off the trails', () => {
    const r = router.route({ x: spot.x, y: spot.y }, { x: base.x, y: base.y }, all);
    expect(r.ok).toBe(true);
    expect(r.steps[0].kind).toBe('offwalk');
    expect(r.steps[0].to).toBeTruthy();
  });

  it('a short GPS wobble next to a trail is not a walk', () => {
    const t = resort.trails.find((t) => t.pts.length > 8), x = t.pts[4], y = t.pts[5];
    const r = router.route({ x: x + 8, y }, { x: base.x, y: base.y }, all);
    if (r.ok) expect(r.steps[0].kind).not.toBe('offwalk');
  });
});
