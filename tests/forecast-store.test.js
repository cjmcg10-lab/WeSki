import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { HistoryStore, forecastRows, mergeRows, toOpenMeteo, ARCHIVE_KEEP_MS, ARCHIVE_MIN_GAP_MS, HISTORY_HOURS } from '../worker/history.js';
import { claimTotals, observationRows, pickStation, siteObservations, STATION_MAX_KM } from '../worker/observations.js';
import { weatherResponse, historyResponse } from '../worker/capture.js';
import { hourGrid, resolutionKm } from '../worker/weather.js';
import { scoreForecast, SCORING_VERSION } from '../src/forecast/score/index.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/forecast/${name}.json`, import.meta.url), 'utf8'));
const stowe = fixture('real-stowe-2026-11-22');
const stations = fixture('nws-stations-stowe');
const kmvl = fixture('nws-obs-kmvl');

const HOUR = 3600e3;
const NOW = Date.UTC(2026, 10, 22, 15, 20);
const TZ = 'America/New_York';
const GRID = hourGrid(TZ, NOW);
const BASE_SITE = { lat: 44.5, lon: -72.78, alt: 399 };
const SUMMIT_SITE = { lat: 44.53, lon: -72.78, alt: 1116 };

class MemoryStorage {
  constructor() { this.map = new Map(); this.writes = 0; }
  async get(key) { return this.map.get(key); }
  async put(entries) { for (const [k, v] of Object.entries(entries)) { this.map.set(k, structuredClone(v)); this.writes++; } }
  async delete(keys) { for (const k of keys) this.map.delete(k); }
  async list({ prefix = '', start, end, limit } = {}) {
    const keys = [...this.map.keys()].filter((k) => k.startsWith(prefix) && (start == null || k >= start) && (end == null || k < end)).sort().slice(0, limit);
    return new Map(keys.map((k) => [k, this.map.get(k)]));
  }
}

const row = (ms, over = {}) => ({ ms, t: -3, feels: -6, snow: 0, wind: 3, gust: 5, vis: 9000, code: 0, acc: 1, issued: ms, src: 'nws', model: 'nws_ndfd', ...over });
const points = (block) => block.hourly.time.map((_, i) => ({ t: block.hourly.temperature_2m[i], feels: block.hourly.apparent_temperature[i], snow: block.hourly.snowfall[i], wind: block.hourly.wind_speed_10m[i], gust: block.hourly.wind_gusts_10m[i], vis: block.hourly.visibility[i], code: block.hourly.weather_code[i], acc: 6 }));

function result(issuedMs = NOW - 40 * 60e3, extra = {}) {
  return {
    source: 'nws', model: 'nws_ndfd', issuedAt: new Date(issuedMs).toISOString(), fetchedAt: new Date(NOW).toISOString(), ageHours: Math.round((NOW - issuedMs) / 360e3) / 10,
    stale: false, resolutionKm: 2.5, gridElevation: { summit: 800, base: 450 }, summit: stowe.summit, base: stowe.base,
    hours: { grid: GRID, summit: points(stowe.summit), base: points(stowe.base) }, ...extra,
  };
}
const URL_STOWE = (extra = '') => new URL(`https://skiwithme.test/api/weather?lat=44.53&lon=-72.78&blat=44.5&blon=-72.78&top=1116&base=399&tz=${TZ}${extra}`);

function fakeEnv(storage = new MemoryStorage()) {
  const store = new HistoryStore(storage);
  const stub = { record: (s, now) => store.record(s, now), history: (now) => store.history(now), lastGood: (now) => store.lastGood(now), archive: (s, l) => store.archive(s, l) };
  return { storage, store, env: { FORECASTHIST: { idFromName: (n) => n, get: () => stub } } };
}
const context = () => { const pending = []; return { pending, waitUntil: (p) => pending.push(p) }; };
const body = async (res) => JSON.parse(await res.text());

describe('overlapping forecasts and snowfall totals', () => {
  it('a later forecast replaces an earlier one for the same hour and never adds to it', () => {
    const h = NOW - 5 * HOUR;
    const first = [row(h, { snow: 1.5, issued: 100, acc: 6 }), row(h + HOUR, { snow: 1.5, issued: 100, acc: 6 })];
    const second = [row(h + HOUR, { snow: 0.5, issued: 200, acc: 1 }), row(h + 2 * HOUR, { snow: 0.5, issued: 200, acc: 1 })];
    const merged = mergeRows(mergeRows([], first, NOW), second, NOW);
    expect(merged.map((r) => r.snow)).toEqual([1.5, 0.5, 0.5]);
    expect(merged.reduce((sum, r) => sum + r.snow, 0)).toBeCloseTo(2.5, 9);
    expect(merged[1]).toMatchObject({ issued: 200, acc: 1, src: 'nws', model: 'nws_ndfd' });
    expect(mergeRows(merged, first, NOW)[1].issued).toBe(200);
  });

  it('spreads a 6 hour NWS block evenly over its hours and records the interval', () => {
    const block = { ...result().hours.base[0], snow: 0.5, acc: 6 };
    const rows = forecastRows(Array(6).fill(block), GRID.slice(0, 6), { issuedMs: NOW, source: 'nws', model: 'nws_ndfd', now: NOW });
    expect(rows.reduce((s, r) => s + r.snow, 0)).toBeCloseTo(3, 9);
    expect(rows.every((r) => r.acc === 6)).toBe(true);
  });

  it('does not double count observation totals that cover the same hours', () => {
    const end = Date.UTC(2026, 10, 22, 13);
    const claimed = claimTotals([{ hours: 1, end, mm: 2 }, { hours: 3, end, mm: 5 }, { hours: 6, end, mm: 6 }]);
    expect(claimed.get(end - HOUR)).toBe(2);
    expect(claimed.get(end - 2 * HOUR)).toBeCloseTo(1.5, 9);
    expect(claimed.get(end - 3 * HOUR)).toBeCloseTo(1.5, 9);
    expect(claimed.get(end - 4 * HOUR)).toBeCloseTo(1 / 3, 9);
    expect([...claimed.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(6, 9);
    expect(claimTotals([{ hours: 1, end, mm: 2 }, { hours: 3, end, mm: 1 }]).get(end - 2 * HOUR)).toBe(0);
  });

  it('keeps a measured hour when a forecast arrives later, and fills a missing precipitation total from the forecast', () => {
    const h = NOW - 3 * HOUR;
    const observed = row(h, { src: 'nws-obs', model: 'obs:KMVL', snow: null, t: -1 });
    const merged = mergeRows([row(h, { snow: 0.8, issued: 50 })], [observed], NOW);
    expect(merged[0]).toMatchObject({ src: 'nws-obs', t: -1, snow: 0.8, snowEstimated: true });
    const later = mergeRows(merged, [row(h, { snow: 1.1, issued: 300, t: 5 })], NOW);
    expect(later[0]).toMatchObject({ src: 'nws-obs', t: -1, snow: 1.1, snowEstimated: false });
    expect(mergeRows(later, [row(h, { snow: 9, issued: 400 })], NOW)[0].snow).toBe(1.1);
    const measured = mergeRows([], [row(h, { src: 'nws-obs', snow: 0.4 })], NOW);
    expect(mergeRows(measured, [row(h, { src: 'nws-obs', snow: null })], NOW)[0].snow).toBe(0.4);
    expect(mergeRows([], [row(h, { src: 'nws-obs', snow: null })], NOW)[0]).toMatchObject({ snow: 0, snowEstimated: true });
  });

  it('keeps 72 hours and drops older rows', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(Math.floor(NOW / HOUR) * HOUR - (i + 1) * HOUR));
    const merged = mergeRows([], rows, NOW);
    expect(merged.length).toBe(HISTORY_HOURS);
    expect(merged[0].ms).toBe(Math.floor(NOW / HOUR) * HOUR - HISTORY_HOURS * HOUR);
  });
});

describe('daylight-saving days', () => {
  const rowsBetween = (from, to) => Array.from({ length: (to - from) / HOUR }, (_, i) => row(from + i * HOUR));

  it('labels a spring-forward day with 23 hours and no 02:00', () => {
    const from = Date.UTC(2026, 2, 8, 5), to = Date.UTC(2026, 2, 9, 4);
    const times = toOpenMeteo(rowsBetween(from, to), TZ).hourly.time;
    expect(times).toHaveLength(23);
    expect(times).not.toContain('2026-03-08T02:00');
    expect(times[0]).toBe('2026-03-08T00:00');
    expect(times.at(-1)).toBe('2026-03-08T23:00');
  });

  it('labels a fall-back day with 25 hours, the 01:00 label twice, in time order', () => {
    const from = Date.UTC(2026, 10, 1, 4), to = Date.UTC(2026, 10, 2, 5);
    const times = toOpenMeteo(rowsBetween(from, to), TZ).hourly.time;
    expect(times).toHaveLength(25);
    expect(times.filter((t) => t === '2026-11-01T01:00')).toHaveLength(2);
    expect(times.indexOf('2026-11-01T01:00') + 1).toBe(times.lastIndexOf('2026-11-01T01:00'));
    expect(new Set(times).size).toBe(24);
  });

  it('stores each hour once across the change and feeds all of them to the engine before the next day', () => {
    const from = Date.UTC(2026, 10, 1, 4), to = Date.UTC(2026, 10, 2, 5);
    const merged = mergeRows([], rowsBetween(from, to), to + HOUR);
    expect(merged).toHaveLength(25);
    const history = { summit: toOpenMeteo(merged, TZ), base: toOpenMeteo(merged, TZ) };
    const out = scoreForecast({ id: 'x', top: 1116, base: 399 }, { summit: { hourly: { ...stowe.summit.hourly, time: stowe.summit.hourly.time.map((t) => `2026-11-02${t.slice(10)}`) } }, base: { hourly: { ...stowe.base.hourly, time: stowe.base.hourly.time.map((t) => `2026-11-02${t.slice(10)}`) } } }, { history });
    expect(out.inputs.historyHours).toBe(25);
  });
});

describe('NWS observations', () => {
  it('picks the nearest station within 25 km and 300 m of the site height, and none for the summit', () => {
    expect(STATION_MAX_KM).toBe(25);
    expect(pickStation(stations, BASE_SITE)).toMatchObject({ id: 'KMVL' });
    expect(pickStation(stations, SUMMIT_SITE)).toBeNull();
    expect(pickStation(stations, { ...BASE_SITE, alt: 700 })).toBeNull();
    expect(pickStation(stations, { lat: 40, lon: -100, alt: 200 })).toBeNull();
    expect(pickStation({ features: [{ geometry: { coordinates: [-72.78, 44.5] }, properties: { stationIdentifier: 'X', elevation: { value: null } } }] }, BASE_SITE)).toBeNull();
    expect(pickStation(undefined, BASE_SITE)).toBeNull();
  });

  it('turns recorded observations into hourly rows in metres a second, one per hour, with unknown snow left null', () => {
    const rows = observationRows(kmvl.features, 'KMVL');
    expect(rows.length).toBeGreaterThan(30);
    expect(new Set(rows.map((r) => r.ms)).size).toBe(rows.length);
    expect(rows.every((r) => r.src === 'nws-obs' && r.model === 'obs:KMVL' && r.gust >= r.wind && r.wind < 40)).toBe(true);
    const newest = rows.at(-1);
    expect(newest.ms).toBe(Date.UTC(2026, 10, 22, 17));
    expect(newest.t).toBe(13);
    expect(newest.wind).toBeCloseTo(7.416 / 3.6, 6);
    expect(rows.every((r) => r.snow === null)).toBe(true);
  });

  it('reads precipitation totals, rain and snow and weather types', () => {
    const at = (iso, extra) => ({ properties: { timestamp: iso, temperature: { value: -4 }, windSpeed: { unitCode: 'wmoUnit:km_h-1', value: 18 }, visibility: { value: 3000 }, presentWeather: [], ...extra } });
    const rows = observationRows([
      at('2026-11-22T12:53:00+00:00', { precipitationLastHour: { value: 1.2 }, presentWeather: [{ weather: 'snow' }] }),
      at('2026-11-22T13:53:00+00:00', { temperature: { value: 3 }, precipitationLastHour: { value: 4 }, presentWeather: [{ weather: 'rain' }] }),
    ], 'KMVL');
    expect(rows.map((r) => r.snow)).toEqual([1.2, 0]);
    expect(rows[0].wind).toBe(5);
    expect(rows[0].code).toBe(73);
    expect(rows[1].code).toBe(63);
  });

  it('asks the stations and observations endpoints as weski-build, with a start rounded to the hour, and returns no rows without a close station', async () => {
    const calls = [];
    const fetchJson = async (url, ttl, headers) => {
      calls.push({ url, ttl, headers });
      if (url.includes('/points/')) return { properties: { observationStations: 'https://api.weather.gov/gridpoints/BTV/102,61/stations' } };
      if (url.endsWith('/stations')) return stations;
      return kmvl;
    };
    const base = await siteObservations(BASE_SITE, NOW, fetchJson);
    expect(base.station.id).toBe('KMVL');
    expect(base.rows.length).toBeGreaterThan(30);
    expect(base.rows.every((r) => r.ms <= NOW)).toBe(true);
    expect(calls.every((c) => c.headers['user-agent'] === 'weski-build')).toBe(true);
    const obsCall = calls.find((c) => c.url.includes('/observations'));
    expect(obsCall.url).toContain('/stations/KMVL/observations?start=2026-11-19T15:00:00.000Z&limit=500');
    expect(obsCall.ttl).toBe(900);
    expect(await siteObservations(SUMMIT_SITE, NOW, fetchJson)).toEqual({ station: null, rows: [] });
  });
});

describe('history store', () => {
  const place = { lat: 44.53, lon: -72.78, top: 1116, base: 399, blat: 44.5, blon: -72.78, tz: TZ };
  const snap = (issuedMs, over = {}) => {
    const r = result(issuedMs);
    const tag = { issuedMs, source: 'nws', model: 'nws_ndfd', now: NOW };
    const weather = { ...r };
    delete weather.hours;
    return { id: 'stowe', place, source: 'nws', model: 'nws_ndfd', issuedAt: issuedMs, fetchedAt: NOW, ms0: GRID[0], forecast: { summit: forecastRows(r.hours.summit, GRID, tag), base: forecastRows(r.hours.base, GRID, tag) }, observed: { summit: [], base: [] }, weather, ...over };
  };

  it('records the completed hours of a forecast with issue time, interval, source and model, and returns them in the weather shape', async () => {
    const storage = new MemoryStorage();
    const store = new HistoryStore(storage);
    expect(await store.history(NOW)).toBeNull();
    expect((await store.record(snap(NOW - 40 * 60e3), NOW)).recorded).toBe(true);
    const h = await store.history(NOW);
    expect(h.base.hourly.time).toHaveLength(10);
    expect(h.base.hourly.time[0]).toBe('2026-11-22T00:00');
    expect(h.base.hourly.observed.every((o) => o === false)).toBe(true);
    expect(h.sources).toEqual(['nws']);
    expect(h.ageHours).toBe(0.7);
    expect(h.tz).toBe(TZ);
    expect(h.coverage.base).toEqual({ hours: 10, observedHours: 0 });
    const stored = (await storage.get('hist')).base[0];
    expect(stored).toMatchObject({ ms: GRID[0], issued: NOW - 40 * 60e3, acc: 6, src: 'nws', model: 'nws_ndfd' });
  });

  it('writes nothing when the same forecast is recorded again, and adds observations as measured hours', async () => {
    const storage = new MemoryStorage();
    const store = new HistoryStore(storage);
    await store.record(snap(NOW - 40 * 60e3), NOW);
    const writes = storage.writes;
    expect((await store.record(snap(NOW - 40 * 60e3), NOW)).wrote).toEqual([]);
    expect(storage.writes).toBe(writes);
    const observed = observationRows(kmvl.features, 'KMVL').filter((r) => r.ms > NOW - 72 * HOUR && r.ms <= NOW);
    await store.record(snap(NOW - 40 * 60e3, { observed: { summit: [], base: observed } }), NOW);
    const h = await store.history(NOW);
    expect(h.coverage.base.observedHours).toBeGreaterThan(20);
    expect(h.sources).toEqual(expect.arrayContaining(['nws', 'nws-obs']));
    expect(h.coverage.summit.observedHours).toBe(0);
  });

  it('feeds the engine: measured history lifts a day to High', async () => {
    const storage = new MemoryStorage();
    const store = new HistoryStore(storage);
    const observed = observationRows(kmvl.features, 'KMVL').filter((r) => r.ms <= NOW);
    const early = NOW - 60 * HOUR;
    const backfill = Array.from({ length: 60 }, (_, i) => row(Math.floor(early / HOUR) * HOUR + i * HOUR, { src: 'nws-obs', model: 'obs:KMVL', snow: 0 }));
    await store.record(snap(NOW - HOUR, { observed: { summit: backfill, base: [...backfill, ...observed] }, forecast: { summit: backfill.map((r) => ({ ...r, src: 'nws' })), base: [] } }), NOW);
    const history = await store.history(NOW);
    const out = scoreForecast({ id: 'stowe', top: 1116, base: 399 }, result(), { history });
    expect(out.inputs.historyHours).toBeGreaterThanOrEqual(48);
    expect(out.inputs.observedHours).toBeGreaterThanOrEqual(24);
  });

  it('refuses a snapshot from a different place for the same resort id', async () => {
    const store = new HistoryStore(new MemoryStorage());
    await store.record(snap(NOW - 40 * 60e3), NOW);
    const elsewhere = snap(NOW - 10 * 60e3, { place: { ...place, lat: 46.5, lon: -72.78 } });
    expect(await store.record(elsewhere, NOW)).toEqual({ recorded: false, reason: 'place_mismatch' });
    expect((await store.history(NOW)).ageHours).toBe(0.7);
  });

  it('serves the last good forecast labelled with its age, and nothing once it is older than 48 hours', async () => {
    const store = new HistoryStore(new MemoryStorage());
    expect(await store.lastGood(NOW)).toBeNull();
    await store.record(snap(NOW - 2 * HOUR), NOW);
    const stale = await store.lastGood(NOW + 3 * HOUR);
    expect(stale).toMatchObject({ stale: true, ageHours: 5, source: 'nws', model: 'nws_ndfd', resolutionKm: 2.5 });
    expect(stale.summit.hourly.time).toHaveLength(168);
    expect(stale.hours).toBeUndefined();
    expect(await store.lastGood(NOW - 2 * HOUR + 48 * HOUR + 1)).toBeNull();
    expect(await store.lastGood(NOW - 2 * HOUR + 48 * HOUR)).not.toBeNull();
  });

  it('keeps the newest forecast as the last good one even when an older issue arrives later', async () => {
    const store = new HistoryStore(new MemoryStorage());
    await store.record(snap(NOW - HOUR), NOW);
    await store.record(snap(NOW - 5 * HOUR), NOW);
    expect((await store.lastGood(NOW)).ageHours).toBe(1);
  });

  it('archives each forecast as issued with the scoring version and day scores, one every 6 hours, and prunes after 28 days', async () => {
    const storage = new MemoryStorage();
    const store = new HistoryStore(storage);
    const t0 = NOW - 40 * 60e3;
    await store.record(snap(t0), NOW);
    await store.record(snap(t0 + HOUR), NOW);
    await store.record(snap(t0 + ARCHIVE_MIN_GAP_MS - 1), NOW);
    expect(await store.archive()).toHaveLength(1);
    await store.record(snap(t0 + ARCHIVE_MIN_GAP_MS), NOW);
    const [first, second] = await store.archive();
    expect(second.issued - first.issued).toBe(ARCHIVE_MIN_GAP_MS);
    expect(first).toMatchObject({ v: SCORING_VERSION, issued: t0, source: 'nws', model: 'nws_ndfd', ms0: GRID[0], resolutionKm: 2.5, hoursAssumed: true });
    expect(first.days).toHaveLength(7);
    expect(first.days[0]).toMatchObject({ date: '2026-11-22', status: 'ok', detail: 'hourly', conf: ['Medium', 'CR_SNOW_HISTORY_LIMITED'] });
    expect(first.days[0].score).toBeGreaterThan(0);
    expect(first.summit.t).toHaveLength(168);
    expect(JSON.stringify(first).length).toBeLessThan(16000);
    await store.record(snap(t0 + ARCHIVE_KEEP_MS + 2 * ARCHIVE_MIN_GAP_MS), t0 + ARCHIVE_KEEP_MS + 2 * ARCHIVE_MIN_GAP_MS);
    const kept = await store.archive();
    expect(kept.every((a) => a.issued > t0 + ARCHIVE_MIN_GAP_MS)).toBe(true);
    expect(kept.length).toBe(1);
    expect(await store.archive(kept[0].issued + 1)).toEqual([]);
  });
});

describe('the weather endpoint with history and the stale fallback', () => {
  it('records only when a resort id is given, and never changes the response body', async () => {
    const { env, store } = fakeEnv();
    const ctx = context();
    const observe = vi.fn(async (site) => (site.alt === 399 ? { station: { id: 'KMVL' }, rows: observationRows(kmvl.features, 'KMVL') } : { station: null, rows: [] }));
    const plain = await weatherResponse(URL_STOWE(), env, ctx, { forecastFn: async () => result(), observe, now: NOW });
    expect(ctx.pending).toHaveLength(0);
    expect(await store.history(NOW)).toBeNull();
    const res = await weatherResponse(URL_STOWE('&id=stowe'), env, ctx, { forecastFn: async () => result(), observe, now: NOW });
    await Promise.all(ctx.pending);
    const payload = await body(res);
    expect(payload).toEqual(await body(plain));
    expect(res.headers.get('cache-control')).toBe('public, max-age=900');
    expect(payload.hours).toBeUndefined();
    expect(payload).toMatchObject({ source: 'nws', model: 'nws_ndfd', stale: false, resolutionKm: 2.5, gridElevation: { summit: 800, base: 450 } });
    expect(observe).toHaveBeenCalledTimes(2);
    expect((await store.history(NOW)).coverage.base.observedHours).toBeGreaterThan(20);
  });

  it('does not ask for observations outside the USA', async () => {
    const { env, store } = fakeEnv();
    const ctx = context();
    const observe = vi.fn();
    await weatherResponse(URL_STOWE('&id=alps'), env, ctx, { forecastFn: async () => result(NOW - HOUR, { source: 'met', model: 'met_locationforecast', resolutionKm: 9 }), observe, now: NOW });
    await Promise.all(ctx.pending);
    expect(observe).not.toHaveBeenCalled();
    expect((await store.history(NOW)).sources).toEqual(['met']);
  });

  it('serves the last good forecast labelled stale when no source answers, and the engine lowers confidence', async () => {
    const { env } = fakeEnv();
    const ctx = context();
    const observe = async () => ({ station: null, rows: [] });
    await weatherResponse(URL_STOWE('&id=stowe'), env, ctx, { forecastFn: async () => result(NOW - 40 * 60e3), observe, now: NOW });
    await Promise.all(ctx.pending);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const later = NOW + 7 * HOUR;
    const res = await weatherResponse(URL_STOWE('&id=stowe'), env, ctx, { forecastFn: async () => { throw new Error('weather source 503'); }, now: later });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    const served = await body(res);
    expect(served).toMatchObject({ stale: true, source: 'nws' });
    expect(served.ageHours).toBeCloseTo(7.7, 1);
    const out = scoreForecast({ id: 'stowe', top: 1116, base: 399 }, served);
    expect(out.days[0].confidence).toEqual({ level: 'Low', reason: { code: 'CR_STALE', params: [8] } });
    expect(out.days[0].flags).toContain('stale_source');
    vi.restoreAllMocks();
  });

  it('answers 502 when no source answers and there is no usable last good copy', async () => {
    const { env } = fakeEnv();
    const ctx = context();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = async () => { throw new Error('weather source 503'); };
    expect((await weatherResponse(URL_STOWE('&id=stowe'), env, ctx, { forecastFn: down, now: NOW })).status).toBe(502);
    expect((await weatherResponse(URL_STOWE(), env, ctx, { forecastFn: down, now: NOW })).status).toBe(502);
    const brokenEnv = { FORECASTHIST: { idFromName: () => 'x', get: () => ({ lastGood: async () => { throw new Error('storage down'); } }) } };
    expect((await weatherResponse(URL_STOWE('&id=stowe'), brokenEnv, ctx, { forecastFn: down, now: NOW })).status).toBe(502);
    vi.restoreAllMocks();
  });

  it('reports a bad place as a 400 and ignores a malformed id', async () => {
    const { env } = fakeEnv();
    const ctx = context();
    const bad = await weatherResponse(new URL('https://x/api/weather?lat=1'), env, ctx, { now: NOW });
    expect(bad.status).toBe(400);
    await weatherResponse(URL_STOWE('&id=Bad%20Id!'), env, ctx, { forecastFn: async () => result(), now: NOW });
    expect(ctx.pending).toHaveLength(0);
  });

  it('keeps answering when the history store fails', async () => {
    const ctx = context();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { FORECASTHIST: { idFromName: () => 'x', get: () => ({ record: async () => { throw new Error('storage down'); } }) } };
    const res = await weatherResponse(URL_STOWE('&id=stowe'), env, ctx, { forecastFn: async () => result(), observe: async () => ({ station: null, rows: [] }), now: NOW });
    await Promise.all(ctx.pending);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('history capture failed', expect.objectContaining({ id: 'stowe', message: 'storage down' }));
    vi.restoreAllMocks();
  });

  it('keeps recording when observations fail', async () => {
    const { env, store } = fakeEnv();
    const ctx = context();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await weatherResponse(URL_STOWE('&id=stowe'), env, ctx, { forecastFn: async () => result(), observe: async () => { throw new Error('observations 500'); }, now: NOW });
    await Promise.all(ctx.pending);
    expect(spy).toHaveBeenCalledWith('observations failed', { message: 'observations 500' });
    expect((await store.history(NOW)).coverage.base.hours).toBe(10);
    vi.restoreAllMocks();
  });

  it('GET /api/history/<id> gives 404 before anything is recorded and the weather shape after', async () => {
    const { env } = fakeEnv();
    const ctx = context();
    expect((await historyResponse('stowe', env, NOW)).status).toBe(404);
    await weatherResponse(URL_STOWE('&id=stowe'), env, ctx, { forecastFn: async () => result(), observe: async () => ({ station: null, rows: [] }), now: NOW });
    await Promise.all(ctx.pending);
    const res = await historyResponse('stowe', env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const h = await body(res);
    expect(h).toMatchObject({ id: 'stowe', tz: TZ, sources: ['nws'] });
    expect(Object.keys(h.base.hourly)).toEqual(['time', 'temperature_2m', 'apparent_temperature', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m', 'visibility', 'weather_code', 'observed']);
    const failing = { FORECASTHIST: { idFromName: () => 'x', get: () => ({ history: async () => { throw new Error('storage down'); } }) } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await historyResponse('stowe', failing, NOW)).status).toBe(502);
    vi.restoreAllMocks();
  });
});

describe('model resolution', () => {
  it('is fine for the US grid and MET in the Nordics, coarse for MET elsewhere', () => {
    expect(resolutionKm('nws', 44.5, -72.8)).toBe(2.5);
    expect(resolutionKm('met', 61.2, 8.4)).toBe(2.5);
    expect(resolutionKm('met', 46.0, 7.7)).toBe(9);
    expect(resolutionKm('met', -41.1, 175.5)).toBe(9);
  });
});
