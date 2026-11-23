import { describe, it, expect } from 'vitest';
import { RideGroups, liftCapacity, joinGap } from '../src/liftgroups.js';

// a 1000 m lift with chairs 48 m apart (join gap 36 m)
const lift = (cap, extra = {}) => () => ({ len: 1000, cap, spacing: 48, one: false, ...extra });
const at = (id, m, down = false, liftId = 1) => ({ id, lift: { id: liftId, frac: m / 1000, down } });
const sizes = (cars) => cars.map((c) => c.ids.length);

describe('riding together', () => {
  it('two people close together share one chair', () => {
    const cars = new RideGroups().update([at('a', 500), at('b', 508)], lift(4));
    expect(cars).toHaveLength(1);
    expect(cars[0].ids.sort()).toEqual(['a', 'b']);
    expect(cars[0].frac).toBeCloseTo(0.504, 3);
  });

  it('four on a four-seat chair fill it', () => {
    const cars = new RideGroups().update([at('a', 500), at('b', 505), at('c', 512), at('d', 498)], lift(4));
    expect(sizes(cars)).toEqual([4]);
  });

  it('six on a four-seat chair: four in front, the other two together in the chair behind', () => {
    const riders = [at('a', 520), at('b', 515), at('c', 512), at('d', 510), at('e', 505), at('f', 500)];
    const cars = new RideGroups().update(riders, lift(4));
    expect(sizes(cars)).toEqual([4, 2]);
    expect(cars[0].ids).toEqual(['a', 'b', 'c', 'd']);       // the four furthest up the line
    expect(cars[1].ids).toEqual(['e', 'f']);
    // drawn at least one chair spacing behind the full one
    expect((cars[0].frac - cars[1].frac) * 1000).toBeGreaterThanOrEqual(48 - 1e-9);
  });

  it('people far apart, on different lifts or going different ways ride separately', () => {
    const g = new RideGroups();
    expect(sizes(g.update([at('a', 100), at('b', 400)], lift(4)))).toEqual([1, 1]);
    expect(sizes(new RideGroups().update([at('a', 100), at('b', 105, true)], lift(4)))).toEqual([1, 1]);
    expect(sizes(new RideGroups().update([at('a', 100), at('b', 105, false, 2)], lift(4)))).toEqual([1, 1]);
  });

  it('going down, the one lowest on the line is in front', () => {
    const riders = [at('a', 500, true), at('b', 495, true), at('c', 490, true)];
    const cars = new RideGroups().update(riders, lift(2));
    expect(cars.map((c) => c.ids)).toEqual([['c', 'b'], ['a']]);
    expect(cars[1].frac).toBeGreaterThan(cars[0].frac);   // the second chair is behind: higher up
  });

  it('a tram cabin takes everyone going the same way, wherever they report from', () => {
    const cars = new RideGroups().update([at('a', 100), at('b', 700), at('c', 300, true)], lift(80, { one: true }));
    expect(sizes(cars).sort()).toEqual([1, 2]);
  });

  it('stays the same while they ride: GPS wander and moving up the line do not reshuffle anyone', () => {
    const g = new RideGroups();
    const first = g.update([at('a', 100), at('b', 106), at('c', 112), at('d', 118), at('e', 124), at('f', 130)], lift(4));
    const key = (cars) => cars.map((c) => c.key + ':' + [...c.ids].sort().join(''));
    const want = key(first);
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    for (let step = 1; step < 60; step++) {
      // everyone moves up together, each with up to ±15 m of GPS wander, reported in a shuffled order
      const base = 100 + step * 12;
      const riders = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => at(id, base + i * 6 + rnd() * 30));
      riders.sort(() => rnd());
      expect(key(g.update(riders, lift(4)))).toEqual(want);
    }
  });

  it('someone who gets off leaves; someone who drifts far away gets their own carrier', () => {
    const g = new RideGroups();
    const k0 = g.update([at('a', 500), at('b', 505), at('c', 510)], lift(4))[0].key;
    const after = g.update([at('a', 520), at('b', 525)], lift(4));
    expect(after).toHaveLength(1);
    expect(after[0].key).toBe(k0);
    const split = g.update([at('a', 540), at('b', 700)], lift(4));
    expect(sizes(split)).toEqual([1, 1]);
    expect(split.some((c) => c.key === k0)).toBe(true);
  });

  it('a latecomer joins a carrier with room close by, not a full one', () => {
    const g = new RideGroups();
    g.update([at('a', 500), at('b', 502)], lift(2));
    const cars = g.update([at('a', 500), at('b', 502), at('c', 504)], lift(2));
    expect(sizes(cars).sort()).toEqual([1, 2]);
    expect(cars.find((c) => c.ids.length === 2).ids.sort()).toEqual(["a", "b"]);
  });

  it('capacity: OpenStreetMap occupancy where given, else by type', () => {
    expect(liftCapacity({ kind: 'chair', seats: 6 }, 6)).toBe(6);
    expect(liftCapacity({ kind: 'chair', seats: 0 }, 4)).toBe(4);
    expect(liftCapacity({ kind: 'gondola', seats: 10 })).toBe(10);
    expect(liftCapacity({ kind: 'gondola', seats: 0 })).toBe(8);
    expect(liftCapacity({ kind: 'tram', seats: 0 })).toBe(80);
    expect(liftCapacity({ kind: 'tram', seats: 125 })).toBe(125);
    expect(liftCapacity({ kind: 'surface', style: 'tbar' })).toBe(2);
    expect(liftCapacity({ kind: 'surface', style: 'platter' })).toBe(1);
    expect(liftCapacity({ kind: 'carpet' })).toBe(1);
    expect(joinGap(48)).toBe(36);
    expect(joinGap(10)).toBe(15);
    expect(joinGap(150)).toBe(60);
    expect(joinGap(48, true)).toBe(Infinity);
  });
});
