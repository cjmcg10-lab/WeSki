import { describe, it, expect } from 'vitest';
import { clearance, nextSeen, fade, stale, HIDE_DEPTH, SHOW_CLEAR } from '../src/sightline.js';

// A ridge 300 m high running north-south at x = 1000 (gaussian, ~100 m wide), flat ground at 0 elsewhere.
const ridge = (x) => 300 * Math.exp(-(((x - 1000) / 100) ** 2));
const ground = (x) => ridge(x);
const vis = (o, t, opts) => nextSeen(null, clearance(ground, o, t, opts));

describe('label sight line', () => {
  it('a label on the far side of a ridge is hidden from a low camera', () => {
    const cam = { x: 0, y: 0, h: 150 }, label = { x: 2000, y: 0, h: 14 };
    expect(clearance(ground, cam, label)).toBeLessThan(-100);
    expect(vis(cam, label)).toBe(false);
  });
  it('the same label is seen from high above the ridge', () => {
    const cam = { x: 0, y: 0, h: 3000 }, label = { x: 2000, y: 0, h: 14 };
    expect(clearance(ground, cam, label)).toBeGreaterThan(0);
    expect(vis(cam, label)).toBe(true);
  });
  it('a label on the near side is seen', () => {
    expect(vis({ x: 0, y: 0, h: 150 }, { x: 600, y: 0, h: 14 })).toBe(true);
  });
  it('a label on the ridge top facing the camera is not hidden by the ground it stands on', () => {
    // the label sits 14 m above the crest; the first 30 m around it are not checked
    expect(vis({ x: 0, y: 0, h: 200 }, { x: 1000, y: 0, h: 314 })).toBe(true);
  });
  it('ground with no data never blocks', () => {
    const none = () => -Infinity;
    expect(clearance(none, { x: 0, y: 0, h: 10 }, { x: 5000, y: 0, h: 0 })).toBeGreaterThan(0);
  });
  it('a thin ridge is not stepped over on a long line', () => {
    // 12 km line, a ridge only ~200 m wide in the middle: samples are at most L / maxSamples apart (100 m)
    const thin = (x) => (Math.abs(x - 6000) < 100 ? 500 : 0);
    expect(clearance(thin, { x: 0, y: 0, h: 100 }, { x: 12000, y: 0, h: 14 })).toBeLessThan(-300);
  });
  it('stops once the line is above every mountain', () => {
    let calls = 0;
    const g = (x) => { calls++; return ridge(x); };
    clearance(g, { x: 0, y: 0, h: 5000 }, { x: 2000, y: 0, h: 14 }, { top: 302 });
    const all = calls; calls = 0;
    clearance(g, { x: 0, y: 0, h: 5000 }, { x: 2000, y: 0, h: 14 });
    expect(all).toBeLessThan(calls);
  });
  it('a camera right next to the label skips the check', () => {
    expect(clearance(ground, { x: 0, y: 0, h: 10 }, { x: 10, y: 0, h: 10 })).toBe(Infinity);
  });
});

describe('ridgeline hysteresis and fade', () => {
  it('a shown label stays shown while the line only grazes the ground', () => {
    expect(nextSeen(true, -HIDE_DEPTH + 0.5)).toBe(true);
    expect(nextSeen(true, -HIDE_DEPTH - 0.5)).toBe(false);
  });
  it('a hidden label needs clear air to come back', () => {
    expect(nextSeen(false, 0)).toBe(false);
    expect(nextSeen(false, SHOW_CLEAR + 0.5)).toBe(true);
  });
  it('fades in and out over a quarter second', () => {
    expect(fade(0, true, 0.125)).toBeCloseTo(0.5);
    expect(fade(0.5, true, 1)).toBe(1);
    expect(fade(1, false, 0.125)).toBeCloseTo(0.5);
    expect(fade(0.1, false, 0.5)).toBe(0);
  });
  it('rechecks once the camera has moved enough for the distance', () => {
    const at = { x: 0, y: 0, h: 0 };
    expect(stale(null, at, 1000)).toBe(true);
    expect(stale(at, { x: 3, y: 0, h: 0 }, 1000)).toBe(false);
    expect(stale(at, { x: 6, y: 0, h: 0 }, 1000)).toBe(true);
  });
});
