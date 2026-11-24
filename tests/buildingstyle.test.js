import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { classifyBuilding, buildingStyle, buildingSeed, styleContext, footprint, STYLES, LOOK, pick } from '../src/buildingstyle.js';

const FIXTURE = 'tests/fixtures/building_styles.json';
const { cases } = JSON.parse(readFileSync(FIXTURE, 'utf8'));

describe('building styles', () => {
  it('the app gives every shared case its expected style', () => {
    const bad = cases.filter((c) => classifyBuilding(c.in) !== c.st).map((c) => `${c.why}: ${classifyBuilding(c.in)} not ${c.st}`);
    expect(bad).toEqual([]);
  });

  it('the build tool agrees on the same cases', () => {
    const out = execFileSync('python3', ['tools/building_style.py', '--fixture', FIXTURE], { encoding: 'utf8' });
    expect(out).toContain(`${cases.length} of ${cases.length} cases match`);
  });

  it('every style has a look', () => {
    for (const s of STYLES) expect(LOOK[s]?.walls?.length).toBeGreaterThan(0);
  });

  it('uses the stored style, or works one out for older maps', () => {
    const lifts = [{ kind: 'chair', pts: [0, 0, 800, 0] }];
    const sq = (x, y, r) => [x - r, y - r, x + r, y - r, x + r, y + r, x - r, y + r];
    expect(buildingStyle({ st: 'chapel', pts: sq(0, 0, 5), h: 6.5 }, lifts, [])).toBe('chapel');
    expect(buildingStyle({ name: null, pts: sq(800, 10, 10), h: 6.5 }, lifts, [])).toBe('rest');
    expect(buildingStyle({ name: null, pts: sq(10, 10, 20), h: 11 }, lifts, [])).toBe('lodge');
    expect(buildingStyle({ name: 'Grand Hotel', kind: 'hotel', pts: sq(3000, 0, 20), h: 15 }, lifts, [])).toBe('hotel');
    expect(buildingStyle({ st: 'nonsense', name: 'Kapelle', pts: sq(3000, 0, 4), h: 6.5 }, lifts, [])).toBe('chapel');
  });

  it('context: lift ends of big lifts and summits only', () => {
    const lifts = [{ kind: 'chair', pts: [0, 0, 1000, 0] }, { kind: 'carpet', pts: [500, 500, 560, 500] }];
    const pois = [{ kind: 'peak', x: 2000, y: 0 }];
    expect(styleContext(30, 30, lifts, pois)).toEqual([true, false]);
    expect(styleContext(1040, 0, lifts, pois)).toEqual([false, true]);
    expect(styleContext(2100, 0, lifts, pois)).toEqual([false, true]);
    expect(styleContext(560, 500, lifts, pois)).toEqual([false, false]);
    expect(footprint([0, 0, 10, 0, 10, 20, 0, 20])).toEqual([200, 5, 10]);
  });

  it('the seed is stable and spreads neighbours', () => {
    const a = buildingSeed({ pts: [100.1, 200.2, 1, 2, 3, 4] });
    expect(buildingSeed({ pts: [100.1, 200.2, 1, 2, 3, 4] })).toBe(a);
    const seeds = new Set();
    for (let i = 0; i < 50; i++) seeds.add(pick(['a', 'b', 'c', 'd'], buildingSeed({ pts: [i * 13.7, i * 7.1, 0, 0, 0, 0] })));
    expect(seeds.size).toBe(4);
    for (let i = 0; i < 50; i++) { const s = buildingSeed({ pts: [i, -i, 0, 0] }); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(1); }
  });
});
