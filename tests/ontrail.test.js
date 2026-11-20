import { describe, it, expect } from 'vitest';
import { trailAt, halfWidth } from '../src/ontrail.js';

// two parallel runs 60 m apart, running north to south
const A = { id: 0, name: 'A', pts: [0, 500, 0, 0] };
const B = { id: 1, name: 'B', pts: [60, 500, 60, 0] };
const resort = { trails: [A, B], areas: [] };

describe('which run someone is on', () => {
  it('counts the whole width of a run, not just its centre line', () => {
    expect(trailAt(resort, 25, 250, { acc: 5 })?.t.name).toBe('A');
    expect(trailAt(resort, 40, 250, { acc: 5 })?.t.name).toBe('B');
  });
  it('is off every run well beyond the edge', () => {
    expect(trailAt(resort, -80, 250, { acc: 5 })).toBe(null);
  });
  it('keeps the run you were on while you ski its edge', () => {
    const prev = trailAt(resort, 5, 260, { acc: 5 }).t;
    expect(trailAt(resort, 33, 250, { acc: 5, prev })?.t.name).toBe('A');
  });
  it('inside a run outline counts as on that run', () => {
    const r = { trails: [A, B], areas: [{ name: 'B', pts: [-90, 300, 90, 300, 90, 200, -90, 200] }] };
    expect(trailAt(r, -45, 250, { acc: 5 })?.t.name).toBe('B');
  });
  it('uses a measured width when the build has one', () => {
    expect(halfWidth({ w: 80 })).toBe(40);
    expect(halfWidth({ glade: true })).toBeLessThan(halfWidth({}));
  });
});
