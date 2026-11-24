// MeteoSwiss ensemble ranges for days 6 to 8 (issue #57): reading the files, the scheduled job, serving, the engine's
// ranges and Close call. Recorded data: tests/fixtures/forecast/meteoswiss-*.json (each says in `_label` what it is).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  extract, layoutOf, fetchFrom, pack, unpack, ensembleStep, ensembleRecord, ensembleForResponse, resortRecords, zurichMidnight,
  stampOf, msOfStamp, fileUrl, dataRegion, MS_PARAMS, MAX_AGE_MS, hasEnsemble,
} from '../worker/meteoswiss.js';
import { MS_POINTS, MS_RESORTS } from '../worker/meteoswiss-points.js';
import { weatherResponse } from '../worker/capture.js';
import { scoreForecast, roundHalfUp, ensembleDates, mergeEnsemble, SCORING_VERSION } from '../src/forecast/score/index.js';
import { closeCallIds, topPickId } from '../src/forecast/watchlist.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/forecast/${name}.json`, import.meta.url), 'utf8'));
const run = fixture('meteoswiss-run-2026-11-23T15');
const full = fixture('meteoswiss-ensemble-zermatt-2026-11-23T15').ensemble;
const HOUR = 3600e3;
const RUN = Date.parse(run.run);
const NOW = Date.UTC(2026, 10, 23, 15, 20);
const enc = (s) => new TextEncoder().encode(s);
const POINTS = run.points; // in file order: by id, then type
const at = (id, type) => POINTS.findIndex(([a, b]) => a === id && b === type);
const RESORTS = { zermatt: [at(1103, 3), at(41, 1), ...MS_RESORTS.zermatt.slice(2)], pizol: [at(708, 3), at(22949, 1), ...MS_RESORTS.pizol.slice(2)] };

/** A range-request server over the fixture's files, for run 2026-11-23 15:00 only. */
function fakeServer({ ignoreRanges = false } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, range: init.headers?.range ?? null, method: init.method ?? 'GET', ua: init.headers?.['user-agent'] });
    const param = url.split('.').slice(-2, -1)[0];
    if (!url.includes('vnut12.lssw.202611231500.') || !run.files[param]) return new Response('missing', { status: 404 });
    if (init.method === 'HEAD') return new Response(null, { status: 200 });
    const all = enc(run.files[param]);
    const m = /bytes=(\d*)-(\d*)/.exec(init.headers?.range ?? '');
    if (!m || ignoreRanges) return new Response(all, { status: 200 });
    let a, b;
    if (m[1] === '') { a = Math.max(0, all.length - Number(m[2])); b = all.length - 1; } else { a = Number(m[1]); b = m[2] === '' ? all.length - 1 : Math.min(Number(m[2]), all.length - 1); }
    return new Response(all.slice(a, b + 1), { status: 206, headers: { 'content-range': `bytes ${a}-${b}/${all.length}` } });
  };
  return { fetchFn, calls };
}

class MemoryStorage {
  constructor() { this.map = new Map(); this.writes = 0; }
  async get(key) { return this.map.get(key); }
  async put(k, v) {
    const entries = typeof k === 'object' ? Object.entries(k) : [[k, v]];
    for (const [key, val] of entries) { this.map.set(key, structuredClone(val)); this.writes++; }
  }
}

async function runAll(storage, server, now = NOW) {
  const steps = [];
  for (let i = 0; i < 20; i++) {
    const out = await ensembleStep(storage, server.fetchFn, now + i * 5 * 60e3, { points: POINTS, resorts: RESORTS });
    steps.push(out);
    if (out.action === 'assembled' || out.action === 'none') break;
  }
  return steps;
}

describe('MeteoSwiss files', () => {
  it('reads the layout from the rows: temperature files hour-first, precipitation and wind point-first', () => {
    expect(layoutOf(enc(run.files.tre200h0))).toBe('time');
    expect(layoutOf(enc(run.files.treq90h0))).toBe('time');
    expect(layoutOf(enc(run.files.rre150h0))).toBe('point');
    expect(layoutOf(enc(run.files.fu3q90h1))).toBe('point');
  });

  it('finds every row of the wanted points, the same as reading each line', () => {
    const ms0 = zurichMidnight(RUN, 6);
    expect(new Date(ms0).toISOString()).toBe('2026-11-28T23:00:00.000Z'); // local midnight of 29 November
    for (const param of MS_PARAMS) {
      const { values, found } = extract(enc(run.files[param]), POINTS, ms0, 96);
      const want = new Map(run.files[param].trim().split('\n').slice(1).map((l) => l.split(';')).map(([p, t, d, v]) => [`${p}:${t}:${d}`, Number(v)]));
      let checked = 0;
      POINTS.forEach(([p, t], k) => values[k].forEach((x, h) => {
        const w = want.get(`${p}:${t}:${stampOf(ms0 + (h + 1) * HOUR)}`);
        expect(x, `${param} ${p}/${t} hour ${h}`).toBe(w ?? null);
        if (w != null) checked++;
      }));
      expect(found, param).toBe(checked);
      expect(found, param).toBe(POINTS.length * 73); // 29 Nov 00:00 to 2 Dec 00:00, local
    }
  });

  it('copes with a slice that starts and ends mid-line, and skips points the file does not have', () => {
    const text = run.files.tre200h0;
    const cut = enc(text).slice(text.length / 3 | 0, text.length - 7);
    const ms0 = zurichMidnight(RUN, 6);
    const { values } = extract(cut, [...POINTS, [999999, 2]], ms0, 96);
    expect(values[POINTS.length].every((x) => x === null)).toBe(true);
    expect(values[0].slice(40, 50).every((x) => typeof x === 'number')).toBe(true);
    expect(dataRegion(enc('no newline')).end).toBe(0);
  });

  it('turns the file Date (UTC, end of the hour) into hour starts', () => {
    expect(stampOf(Date.UTC(2026, 10, 29, 0))).toBe(202611290000);
    expect(msOfStamp(202611290000)).toBe(Date.UTC(2026, 10, 29, 0));
    expect(fileUrl(RUN, 'tre200h0')).toBe('https://data.geo.admin.ch/ch.meteoschweiz.ogd-local-forecasting/20261123-ch/vnut12.lssw.202611231500.tre200h0.csv');
    // across the spring change (29 March 2026) local midnight is 23:00 UTC before it and 22:00 UTC after
    expect(new Date(zurichMidnight(Date.UTC(2026, 2, 24, 12), 4)).toISOString()).toBe('2026-03-27T23:00:00.000Z');
    expect(new Date(zurichMidnight(Date.UTC(2026, 2, 24, 12), 6)).toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });

  it('packs values as tenths and keeps missing hours missing', () => {
    const values = [[1.2, null, -18.4], [0, 3276.7, null]];
    expect(unpack(pack(values), 2)).toEqual(values);
  });
});

describe('fetching a file', () => {
  it('reads an hour-first file by range from before day 6, and a point-first file whole', async () => {
    const server = fakeServer();
    const from = stampOf(zurichMidnight(RUN, 6));
    const t = await fetchFrom(server.fetchFn, fileUrl(RUN, 'tre200h0'), from);
    expect(server.calls.map((c) => c.range)).toEqual(['bytes=0-4095', 'bytes=-4096', 'bytes=0-']); // the small fixture fits in the margin
    expect(server.calls.every((c) => c.ua === 'weski-build')).toBe(true);
    expect(new TextDecoder().decode(t)).toBe(run.files.tre200h0);
    server.calls.length = 0;
    await fetchFrom(server.fetchFn, fileUrl(RUN, 'rre150h0'), from);
    expect(server.calls.map((c) => c.range)).toEqual(['bytes=0-4095', 'bytes=0-']);
  });

  it('works with a server that ignores ranges, and fails clearly on a missing file', async () => {
    const server = fakeServer({ ignoreRanges: true });
    const bytes = await fetchFrom(server.fetchFn, fileUrl(RUN, 'treq10h0'), 202611290000);
    expect(bytes.length).toBe(enc(run.files.treq10h0).length);
    await expect(fetchFrom(server.fetchFn, fileUrl(RUN - HOUR, 'treq10h0'), 202611290000)).rejects.toThrow(/404/);
  });
});

describe('the scheduled job', () => {
  it('reads one parameter per step, then cuts the run into resort records', async () => {
    const storage = new MemoryStorage();
    const server = fakeServer();
    const steps = await runAll(storage, server);
    expect(steps.map((s) => s.action)).toEqual([...MS_PARAMS.map(() => 'param'), 'assembled']);
    expect(steps.slice(0, 12).map((s) => s.param)).toEqual(MS_PARAMS);
    expect(steps[12]).toMatchObject({ resorts: 2, run: RUN });
    // about 3 requests per file, never more than 6 in one step (the free plan allows 50)
    expect(server.calls.length).toBeLessThanOrEqual(13 * 6);
    // rows written: 12 parameters, 2 resorts, the state after each step and the latest pointer
    expect(storage.writes).toBeLessThan(40);
    const again = await ensembleStep(storage, server.fetchFn, NOW + 70 * 60e3, { points: POINTS, resorts: RESORTS });
    expect(again).toMatchObject({ action: 'none', reason: 'up to date' });
  });

  it('serves the same Zermatt series as the run read in full from MeteoSwiss', async () => {
    const storage = new MemoryStorage();
    await runAll(storage, fakeServer());
    const record = await ensembleRecord(storage, 'zermatt', NOW + HOUR);
    expect(ensembleForResponse(record, 'Europe/Zurich')).toEqual(full);
    expect(full.time.length).toBe(73);
    // summit 48 m above the lodge's point: 0.3 °C colder; wind in m/s
    const raw = Number(run.files.tre200h0.split('\n').find((l) => l.startsWith('1103;3;202611291000;')).split(';')[3]);
    expect(full.summit.t[10]).toBeCloseTo(raw - 0.0065 * 48, 1);
    for (const site of [full.summit, full.base]) {
      site.t.forEach((x, i) => expect(site.t10[i] <= x + 0.05 && x <= site.t90[i] + 0.05, `t ${i}`).toBe(true));
      site.g.forEach((x, i) => expect(site.g10[i] <= x + 0.05 && x <= site.g90[i] + 0.05, `g ${i}`).toBe(true));
    }
  });

  it('stops serving a run older than 18 hours, and starts a newer run after 12 hours', async () => {
    const storage = new MemoryStorage();
    await runAll(storage, fakeServer());
    expect(await ensembleRecord(storage, 'zermatt', RUN + MAX_AGE_MS - 1)).not.toBeNull();
    expect(await ensembleRecord(storage, 'zermatt', RUN + MAX_AGE_MS + 1)).toBeNull();
    expect(await ensembleRecord(storage, 'nowhere', NOW)).toBeNull();
    // 12 hours on, the fixture server has no newer run: nothing is restarted and the old records stay
    const later = await ensembleStep(storage, fakeServer().fetchFn, RUN + 12 * HOUR + 15 * 60e3, { points: POINTS, resorts: RESORTS });
    expect(later).toMatchObject({ action: 'none', reason: 'no run published' });
  });

  it('keeps its state when a file fails, so the next step tries again', async () => {
    const storage = new MemoryStorage();
    const server = fakeServer();
    await ensembleStep(storage, server.fetchFn, NOW, { points: POINTS, resorts: RESORTS });
    const broken = async (url, init) => (url.includes('treq10h0') && init.method !== 'HEAD' ? new Response('busy', { status: 503 }) : server.fetchFn(url, init));
    await expect(ensembleStep(storage, broken, NOW + 300e3, { points: POINTS, resorts: RESORTS })).rejects.toThrow(/503/);
    expect((await storage.get('ms:state')).done).toEqual({ tre200h0: true });
    expect(await ensembleStep(storage, server.fetchFn, NOW + 600e3, { points: POINTS, resorts: RESORTS })).toMatchObject({ action: 'param', param: 'treq10h0' });
  });

  it('covers the Swiss resorts of the catalog, Zermatt and Pizol among them', () => {
    expect(Object.keys(MS_RESORTS).length).toBeGreaterThan(250);
    expect(hasEnsemble('zermatt') && hasEnsemble('pizol')).toBe(true);
    expect(hasEnsemble('stowe')).toBe(false);
    for (const [id, [s, b]] of Object.entries(MS_RESORTS)) expect(s < MS_POINTS.length && b < MS_POINTS.length, id).toBe(true);
    // points are in file order (id, then type), which the hour-first search relies on
    MS_POINTS.slice(1).forEach(([id, t], i) => expect(id * 10 + t > MS_POINTS[i][0] * 10 + MS_POINTS[i][1]).toBe(true));
  });

  it('drops hours past the end of the file from the records', () => {
    const params = Object.fromEntries(MS_PARAMS.map((p) => [p, [[1, 2, null, null], [3, 4, null, null]]]));
    const out = resortRecords(params, RUN, 0, 4, [[1, 1], [2, 1]], { x: [0, 1, 0, 0] });
    expect(out.x.n).toBe(2);
    expect(out.x.summit.t).toEqual([1, 2]);
  });
});

describe('/api/weather', () => {
  const ZERMATT = { lat: 45.9243, lon: 7.7338, top: 3874, base: 1558, blat: 45.8882, blon: 7.624, tz: 'Europe/Zurich' };
  const url = (id = 'zermatt', lat = ZERMATT.lat) => new URL(`https://skiwithme.test/api/weather?lat=${lat}&lon=${ZERMATT.lon}&blat=${ZERMATT.blat}&blon=${ZERMATT.blon}&top=${ZERMATT.top}&base=${ZERMATT.base}&tz=Europe%2FZurich&id=${id}`);
  const resolve = async (_env, id) => (['zermatt', 'stowe'].includes(id) ? { id, place: ZERMATT } : null);
  const forecastFn = async () => ({ source: 'met', summit: { hourly: { time: [] } }, base: { hourly: { time: [] } }, hours: {} });
  const ctx = { waitUntil: () => {} };

  async function envWithRun() {
    const storage = new MemoryStorage();
    await runAll(storage, fakeServer());
    const names = [];
    const stub = { ensembleFor: (id, now) => ensembleRecord(storage, id, now), due: async () => false };
    return { names, env: { FORECASTHIST: { idFromName: (n) => { names.push(n); return n; }, get: () => stub } } };
  }

  it('adds the ensemble for a listed Swiss resort asked for its own place', async () => {
    const { env, names } = await envWithRun();
    const res = await weatherResponse(url(), env, ctx, { forecastFn, resolve, now: NOW + HOUR, observe: async () => ({ rows: [] }) });
    const out = await res.json();
    expect(out.ensemble).toEqual(full);
    expect(names).toContain('_meteoswiss');
  });

  it('adds nothing for another place under the same id, a resort outside Switzerland or no id', async () => {
    const { env } = await envWithRun();
    const opts = { forecastFn, resolve, now: NOW + HOUR, observe: async () => ({ rows: [] }) };
    expect((await (await weatherResponse(url('zermatt', 45.95), env, ctx, opts)).json()).ensemble).toBeUndefined();
    expect((await (await weatherResponse(url('stowe'), env, ctx, opts)).json()).ensemble).toBeUndefined();
    const plain = new URL(url().toString().replace('&id=zermatt', ''));
    expect((await (await weatherResponse(plain, env, ctx, opts)).json()).ensemble).toBeUndefined();
  });

  it('still answers when the ensemble store fails', async () => {
    const env = { FORECASTHIST: { idFromName: (n) => n, get: () => ({ ensembleFor: async () => { throw new Error('down'); }, due: async () => false }) } };
    const res = await weatherResponse(url(), env, ctx, { forecastFn, resolve, now: NOW, observe: async () => ({ rows: [] }) });
    expect(res.status).toBe(200);
    expect((await res.json()).ensemble).toBeUndefined();
  });
});

// ---------- engine
const RESORT = { id: 'zermatt', top: 3874, base: 1558 };
const TODAY = '2026-11-23';

/** A plain main forecast for 23 to 29 November (days 0 to 6), every hour the same mild winter weather. Made up for the test. */
function mainWeather(days = 7) {
  const time = [];
  for (let d = 0; d < days; d++) for (let h = 0; h < 24; h++) time.push(`2026-11-${String(23 + d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`);
  const site = (t, wind) => ({ hourly: { time, temperature_2m: time.map(() => t), apparent_temperature: time.map(() => t - 3), snowfall: time.map(() => 0), wind_speed_10m: time.map(() => wind), wind_gusts_10m: time.map(() => wind * 2), visibility: time.map(() => 20000), weather_code: time.map(() => 1) } });
  return { summit: site(-8, 6), base: site(-2, 3), ageHours: 2, resolutionKm: 9 };
}

describe('engine ranges (1.8.0)', () => {
  const weather = { ...mainWeather(), ensemble: full };
  const out = scoreForecast(RESORT, weather, { today: TODAY });

  it('uses the ensemble for days 6, 7 and 8 and adds two days to the forecast', () => {
    expect(SCORING_VERSION).toBe('1.8.0');
    expect(ensembleDates(weather, TODAY)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
    expect(out.days.map((d) => d.date).slice(-3)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
    expect(out.ensemble).toEqual({ source: 'meteoswiss', model: 'meteoswiss_local', run: '2026-11-23T15:00:00.000Z', dates: ['2026-11-29', '2026-11-30', '2026-12-01'] });
    const merged = mergeEnsemble(weather, TODAY).weather;
    const i = merged.summit.hourly.time.indexOf('2026-11-29T10:00');
    expect(merged.summit.hourly.temperature_2m[i]).toBe(full.summit.t[10]);
    expect(merged.summit.hourly.time.filter((x) => x.startsWith('2026-11-29')).length).toBe(24); // the main source's day 6 is replaced, not doubled
  });

  it('gives each ensemble day a range around its score and an uncertainty of half the range', () => {
    for (const d of out.days.filter((x) => x.daysAhead >= 6)) {
      expect(d.status).toBe('ok');
      expect(d.detail).toBe('range');
      expect(d.range.low).toBeLessThanOrEqual(d.score + 1e-9);
      expect(d.range.high).toBeGreaterThanOrEqual(d.score - 1e-9);
      expect(d.uncertainty).toBeCloseTo((d.range.high - d.range.low) / 2, 9);
      expect(d.confidence.level).toBe('Low');
    }
    expect(out.days.some((d) => d.range && d.range.high - d.range.low >= 1)).toBe(true);
  });

  it('leaves days 0 to 5 exactly as without the ensemble', () => {
    const plain = scoreForecast(RESORT, mainWeather(), { today: TODAY });
    for (const d of plain.days.slice(0, 6)) {
      const e = out.days.find((x) => x.date === d.date);
      expect(e.score).toBe(d.score);
      expect(e.range).toBeNull();
      expect(e.uncertainty).toBeNull();
    }
    expect(plain.days.every((d) => d.range === null && d.uncertainty === null)).toBe(true);
    expect(plain.ensemble).toBeUndefined();
  });

  it('starts later or not at all when the ensemble does not join the main forecast or misses hours', () => {
    expect(ensembleDates({ ...mainWeather(5), ensemble: full }, TODAY)).toEqual([]); // main ends on day 4: a gap
    expect(ensembleDates({ ...mainWeather(), ensemble: full }, '2026-11-24')).toEqual(['2026-11-30', '2026-12-01']); // day 8 is past the run
    const holey = structuredClone(full);
    holey.base.t[30] = null; // 30 November 06:00 at the base
    expect(ensembleDates({ ...mainWeather(), ensemble: holey }, TODAY)).toEqual(['2026-11-29']);
    const noEns = scoreForecast(RESORT, { ...mainWeather(5), ensemble: full }, { today: TODAY });
    expect(noEns.days.length).toBe(5);
  });

  it('a cold quantile and a windy quantile move the score as expected', () => {
    const calm = structuredClone(full);
    for (const s of [calm.summit, calm.base]) { s.w90 = s.w90.map((x) => (x == null ? null : x + 15)); s.g90 = s.g90.map((x) => (x == null ? null : x + 20)); }
    const windy = scoreForecast(RESORT, { ...mainWeather(), ensemble: calm }, { today: TODAY });
    const d = windy.days.find((x) => x.date === '2026-11-30');
    expect(d.range.low).toBeLessThan(out.days.find((x) => x.date === '2026-11-30').range.low);
  });
});

describe('Close call', () => {
  const row = (id, score, uncertainty = null, status = 'ok') => ({ resort: { id }, forecast: { scored: { days: [{ date: 'D', status, score, uncertainty, confidence: { level: 'Low' } }] } } });

  it('tags the first two when they are within the larger uncertainty', () => {
    expect(closeCallIds([row('a', 60, 4), row('b', 64, null)], 'D')).toEqual(['b', 'a']);
    expect(closeCallIds([row('a', 60, 5), row('b', 64.9, 2)], 'D')).toEqual(['b', 'a']);
  });

  it('never shows without an uncertainty, when they are further apart, or when one is not scored', () => {
    expect(closeCallIds([row('a', 60), row('b', 60.5)], 'D')).toBeNull();
    expect(closeCallIds([row('a', 60, 3), row('b', 64)], 'D')).toBeNull();
    expect(closeCallIds([row('a', 60, 9), row('b', 64, 9, 'insufficient')], 'D')).toBeNull();
    expect(closeCallIds([row('a', 60, 9)], 'D')).toBeNull();
    expect(topPickId([row('a', 60), row('b', 64)], 'D')).toBe('b');
  });

  it('can appear for two Swiss mountains on an ensemble day', () => {
    const out = scoreForecast(RESORT, { ...mainWeather(), ensemble: full }, { today: TODAY });
    const d = out.days.find((x) => x.date === '2026-11-30');
    const near = { ...d, score: d.score - Math.min(d.uncertainty, 1) };
    const rows = [{ resort: { id: 'zermatt' }, forecast: { scored: { days: [d] } } }, { resort: { id: 'twin' }, forecast: { scored: { days: [near] } } }];
    expect(closeCallIds(rows, d.date)).toEqual(['zermatt', 'twin']);
    expect(roundHalfUp(d.range.low)).toBeLessThanOrEqual(roundHalfUp(d.score));
  });
});
