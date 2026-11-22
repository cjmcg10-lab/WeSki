import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { makePin, draftFrom, draftProblem, zoneFor, newPinId, validId, parseCoordinate, parseHeight, fetchElevation, MATCH_KM } from '../src/forecast/pin.js';
import { catalogFromIndex, forecastPoints } from '../src/forecast/catalog.js';
import { canForecast } from '../src/forecast/resorts.js';
import { cleanList, add } from '../src/forecast/watchlist.js';
import { scoreForecast } from '../src/forecast/score/index.js';
import { weatherResponse, historyResponse } from '../worker/capture.js';

const readJson = (url) => JSON.parse(readFileSync(new URL(url, import.meta.url), 'utf8'));
const stowe = readJson('./fixtures/forecast/real-stowe-2026-11-22.json');
const TZ = 'America/New_York';
const BASE = { lat: 44.5, lon: -72.78, elev: 399 };
const TOP = { lat: 44.53, lon: -72.78, elev: 1116 };
const onePin = () => makePin({ id: 'pin-abc123', name: ' Home Hill ', base: BASE, tz: TZ });
const twoPin = () => makePin({ id: 'pin-abc124', name: 'Home Hill 2', base: BASE, top: TOP, tz: TZ });

describe('pin entries', () => {
  it('make a list entry the Forecast can read, with one point meaning no top', () => {
    const pin = onePin();
    expect(pin).toMatchObject({ pin: true, name: 'Home Hill', top: null, base: 399, baseLat: 44.5, lat: 44.5, tz: TZ });
    expect(canForecast(pin)).toBe(true);
    expect(forecastPoints(pin)).toMatchObject({ top: 399, base: 399 });
    expect(cleanList([pin, pin])).toHaveLength(1);
    expect(add([], pin)).toEqual([pin]);
  });

  it('keep both heights and the top position for two points', () => {
    expect(twoPin()).toMatchObject({ top: 1116, base: 399, lat: 44.53, baseLat: 44.5 });
  });

  it('round-trip into an edit draft', () => {
    expect(draftFrom(twoPin())).toMatchObject({ mode: 'edit', id: 'pin-abc124', base: BASE, top: TOP });
    expect(draftFrom(onePin()).top).toBeNull();
  });

  it('make ids the server accepts, never twice', () => {
    const id = newPinId([], () => [0, 35, 10, 255, 36, 71]);
    expect(id).toBe('pin-0za30z');
    expect(validId(id)).toBe(true);
    let n = 0;
    const second = newPinId([id], () => (n++ === 0 ? [0, 35, 10, 255, 36, 71] : [1, 2, 3, 4, 5, 6]));
    expect(second).not.toBe(id);
    expect(validId('Pin-ABC')).toBe(false);
    expect(validId('pin-' + 'a'.repeat(40))).toBe(false);
  });
});

describe('scoring a pin', () => {
  const weather = { summit: stowe.summit, base: stowe.base, ageHours: 1 };
  const today = stowe.base.hourly.time[0].slice(0, 10);
  const first = (pin) => scoreForecast(forecastPoints(pin), weather, { today });

  it('gives one point a single estimate with low confidence and the one-estimate reason', () => {
    const out = first(onePin());
    expect(out.siteMode).toBe('single');
    expect(out.days[0].confidence).toEqual({ level: 'Low', reason: { code: 'CR_ONE_ESTIMATE', params: [] } });
  });

  it('never gives one point a separate summit value', () => {
    const out = first(onePin());
    expect(out.inputs.top).toBe(out.inputs.base);
  });

  it('scores two points as a mountain with a real vertical', () => {
    expect(first(twoPin()).siteMode).not.toBe('single');
  });
});

describe('draft checks', () => {
  const draft = (over = {}) => ({ id: 'pin-new', name: 'Hill', base: { ...BASE }, top: null, ...over });

  it('needs a name, not one already on the list, a base and heights', () => {
    expect(draftProblem(draft({ name: '  ' }), [])).toMatchObject({ key: 'name' });
    expect(draftProblem(draft({ name: 'home hill' }), [onePin()])).toMatchObject({ key: 'duplicate', name: 'Home Hill' });
    expect(draftProblem(draft({ base: null }), [])).toMatchObject({ key: 'nobase' });
    expect(draftProblem(draft({ base: { ...BASE, elev: null } }), [])).toMatchObject({ key: 'baseheight', field: 'hbase' });
    expect(draftProblem(draft({ top: { ...TOP, elev: null } }), [])).toMatchObject({ key: 'topheight' });
    expect(draftProblem(draft({ top: { ...TOP, elev: 399 } }), [])).toMatchObject({ key: 'toplow' });
    expect(draftProblem(draft({ top: { ...TOP } }), [])).toBeNull();
  });

  it('lets a pin keep its own name when edited', () => {
    expect(draftProblem(draft({ id: 'pin-abc123', name: 'Home Hill' }), [onePin()])).toBeNull();
  });
});

describe('typed values', () => {
  it('reads coordinates and heights, refusing nonsense', () => {
    expect(parseCoordinate('44,5', 85)).toBe(44.5);
    expect(parseCoordinate(' -72.78123456 ', 180)).toBe(-72.78123);
    expect(parseCoordinate('86', 85)).toBeNull();
    expect(parseCoordinate('', 85)).toBeNull();
    expect(parseCoordinate('north', 85)).toBeNull();
    expect(parseHeight('1200')).toBe(1200);
    expect(parseHeight('1,200')).toBe(1200);
    expect(parseHeight('99999')).toBeNull();
    expect(parseHeight('')).toBeNull();
  });
});

describe('time zone for a pin', () => {
  it('takes the nearest resort within 300 km, else guesses from longitude and says so', () => {
    expect(zoneFor(44, -72, [{ tz: TZ, km: 20 }])).toEqual({ tz: TZ, guessed: false });
    expect(zoneFor(44, -72, [{ tz: TZ, km: 450 }])).toEqual({ tz: 'Etc/GMT+5', guessed: true });
    expect(zoneFor(46, 8, [])).toEqual({ tz: 'Etc/GMT-1', guessed: true });
    expect(zoneFor(0, 2, [])).toEqual({ tz: 'Etc/GMT', guessed: true });
  });
});

describe('finding a catalog resort near a pin', () => {
  const FIELDS = ['id', 'name', 'aliases', 'towns', 'region', 'cc', 'lat', 'lon', 'baseLat', 'baseLon', 'top', 'base', 'tz', 'flags'];
  const row = (id, name, lat, lon) => [id, name, [], [], 'VT', 'US', lat, lon, lat, lon, 1100, 400, 0, 0];
  const catalog = catalogFromIndex({ v: 1, fields: FIELDS, countries: { US: 'United States' }, tz: [TZ], rows: [row('near', 'Near Hill', 44.5, -72.78), row('close', 'Close Hill', 44.51, -72.78), row('far', 'Far Hill', 44.9, -72.78)] });

  it('lists resorts within the distance, nearest first, and none beyond it', () => {
    const hits = catalog.nearby(44.5, -72.78, { maxKm: MATCH_KM });
    expect(hits.map((h) => h.id)).toEqual(['near', 'close']);
    expect(catalog.nearby(44.5, -72.78, { maxKm: MATCH_KM, limit: 1 })).toHaveLength(1);
    expect(catalog.nearby(10, 10)).toEqual([]);
  });
});

describe('elevation lookup from the app', () => {
  const ok = (body) => vi.fn(async () => ({ ok: true, json: async () => body }));

  it('returns the height, or null on any failure so the person can type it', async () => {
    expect(await fetchElevation(44.5, -72.78, ok({ elevation: 399 }))).toBe(399);
    expect(await fetchElevation(44.5, -72.78, ok({ elevation: null }))).toBeNull();
    expect(await fetchElevation(44.5, -72.78, vi.fn(async () => ({ ok: false, json: async () => ({}) })))).toBeNull();
    expect(await fetchElevation(44.5, -72.78, vi.fn(async () => { throw new Error('offline'); }))).toBeNull();
  });

  it('asks our own endpoint', async () => {
    const fetchImpl = ok({ elevation: 1 });
    await fetchElevation(44.5, -72.78, fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/elevation?lat=44.5&lon=-72.78');
  });
});

describe('the server and a pin id it has never heard of', () => {
  const none = async () => null;
  const record = { record: vi.fn(), history: vi.fn(async () => null), lastGood: vi.fn(async () => null), archive: vi.fn(async () => []) };
  const env = { FORECASTHIST: { idFromName: (n) => n, get: () => record } };
  const url = 'https://skiwithme.test/api/weather?lat=44.5&lon=-72.78&blat=44.5&blon=-72.78&top=399&base=399&tz=America/New_York&id=pin-abc123';
  const forecastFn = async () => ({
    source: 'nws', model: 'nws_ndfd', issuedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), ageHours: 1, stale: false, resolutionKm: 2.5,
    gridElevation: { summit: 400, base: 400 }, summit: stowe.summit, base: stowe.base, hours: { grid: [], summit: [], base: [] },
  });

  it('answers the forecast and stores no history for it', async () => {
    const pending = [];
    const res = await weatherResponse(new URL(url), env, { waitUntil: (p) => pending.push(p) }, { forecastFn, resolve: none });
    await Promise.all(pending);
    expect(res.status).toBe(200);
    expect(record.record).not.toHaveBeenCalled();
  });

  it('answers a history request with nothing rather than an error', async () => {
    const res = await historyResponse('pin-abc123', env, Date.now(), none);
    expect(res.status).toBeLessThan(500);
    expect(record.history).not.toHaveBeenCalled();
  });
});
