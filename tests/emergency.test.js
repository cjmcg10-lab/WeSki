import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import DATA from '../src/emergency.json';
import { emergencyFor, mainNumber, telHref, fmtCoords, nearestLift, nearestRun, sourceHost } from '../src/emergency.js';

const INDEX = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8'));
// A tel value: E.164 (+ then 8 to 15 digits) with an optional ",extension", or a short emergency code.
const TEL = /^(\+[1-9]\d{7,14}(,\d{1,6})?|\d{3,4})$/;
const DIGITS = (s) => s.replace(/ext\..*$/, '').replace(/\D/g, '');

describe('emergency numbers data', () => {
  it('has an entry for every built mountain, and none for mountains that do not exist', () => {
    expect(Object.keys(DATA.resorts).sort()).toEqual(INDEX.map((r) => r.id).sort());
  });
  it('gives every country in use its general numbers, each dialable', () => {
    for (const r of Object.values(DATA.resorts)) expect(DATA.general[r.country], r.country).toBeTruthy();
    for (const [cc, nums] of Object.entries(DATA.general)) {
      expect(nums.length, cc).toBeGreaterThan(0);
      for (const n of nums) { expect(n.tel, cc).toMatch(TEL); expect(n.label).toBeTruthy(); expect(n.phone).toBe(n.tel); }
    }
    expect(DATA.general.US[0].tel).toBe('911');
    expect(DATA.general.JP[0].tel).toBe('119');
    expect(DATA.general.AT.map((n) => n.tel)).toEqual(expect.arrayContaining(['140', '112']));
  });
  it('only lists a patrol number with its label, source and check date, and the dial string matches the printed number', () => {
    for (const [id, r] of Object.entries(DATA.resorts)) {
      expect(r.checked, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (!r.phone) { expect(r.tel, id).toBeUndefined(); expect(r.source, id).toBeUndefined(); continue; }
      expect(r.tel, id).toMatch(TEL);
      expect(r.label, id).toBeTruthy();
      expect(r.source, id).toMatch(/^https:\/\/[^/]+\.[a-z]+/);
      expect(r.tel.replace(/,.*/, '').endsWith(DIGITS(r.phone)), `${id}: ${r.tel} vs ${r.phone}`).toBe(true);
      if (r.country === 'US' && r.tel.length > 4) expect(r.tel, id).toMatch(/^\+1\d{10}(,\d+)?$/);
      if (r.country === 'FR') expect(r.tel, id).toMatch(/^\+33\d{9}$/);
      for (const m of r.more || []) { expect(m.tel, id).toMatch(TEL); expect(m.label).toBeTruthy(); }
    }
  });
});

describe('emergency helpers', () => {
  it('turns a stored number into a tel: link', () => {
    expect(telHref('+18022533620')).toBe('tel:+18022533620');
    expect(telHref('+12078645671,214')).toBe('tel:+12078645671,214');
    expect(telHref('911')).toBe('tel:911');
    expect(telHref('+1 (802) 253-3620')).toBe('tel:+18022533620');
  });
  it('picks the number to call when unsure', () => {
    expect(mainNumber(emergencyFor('stowe').general).tel).toBe('911');
    expect(mainNumber(emergencyFor('zermatt').general).tel).toBe('112');
    expect(mainNumber(emergencyFor('saalbach').general).tel).toBe('112');
    expect(mainNumber(emergencyFor('geto-kogen').general).tel).toBe('119');
  });
  it('gives the patrol line when there is one, and none when no source was found', () => {
    expect(emergencyFor('jay-peak').patrol.tel).toBe('+18023272187');
    expect(emergencyFor('geto-kogen').patrol).toBe(null);
    expect(emergencyFor('no-such-mountain').general[0].tel).toBe('911');
  });
  it('formats coordinates for reading out', () => {
    expect(fmtCoords(44.93681, -72.50489)).toEqual({ human: '44.93681° N, 72.50489° W', plain: '44.93681, -72.50489' });
    expect(fmtCoords(-36.1, 146.4).human).toBe('36.10000° S, 146.40000° E');
  });
  it('finds the nearest named lift and run, leaving out hidden ones', () => {
    const resort = {
      lifts: [{ name: 'Far', pts: [0, 1000, 100, 1000] }, { name: 'Near', pts: [0, 50, 100, 50] }, { name: 'Hidden', hide: 'x', pts: [0, 1, 100, 1] }],
      trails: [{ name: 'Run A', pts: [0, 30, 100, 30] }, { name: '', pts: [0, 2, 100, 2] }],
    };
    expect(nearestLift(resort, 50, 0).name).toBe('Near');
    expect(nearestRun(resort, 50, 0).name).toBe('Run A');
    expect(nearestLift(resort, 5000, 5000)).toBe(null);
  });
  it('shows a source by its host', () => {
    expect(sourceHost('https://www.stowe.com/x')).toBe('stowe.com');
    expect(sourceHost('nonsense')).toBe('');
  });
});
