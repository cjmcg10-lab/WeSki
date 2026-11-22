import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import EN from '../src/i18n/en.js';
import { toResort, searchResorts, sameName, loadCatalog, resortFor, canForecast } from '../src/forecast/resorts.js';
import { catalogFromIndex, forecastPoints } from '../src/forecast/catalog.js';
import { add, remove, move, insertAt, has, cleanList, syncList, loadList, saveList, sortRows, topPickId, LIST_KEY } from '../src/forecast/watchlist.js';
import { loadForecast, loadStatusSaved, withHistory, sourceAgeHours, rescored, scoreResort, ageHoursOf, isStale, columnDates, bandOf, windowSummary, timeBlocks, localToday } from '../src/forecast/data.js';
import { loadHistory, savedHistory } from '../src/weather.js';
import { ageText, CODE_TEXT, codeText } from '../src/forecast/text.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/forecast/${name}.json`, import.meta.url), 'utf8'));
const catalog = catalogFromIndex(JSON.parse(readFileSync(new URL('../public/forecast/catalog-index.json', import.meta.url), 'utf8')));
const byId = (id) => resortFor(catalog, id);

const memoryPrefs = (seed = {}) => {
  const store = { ...seed };
  return { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); }, store };
};

describe('resort adapter', () => {
  const indexJson = JSON.parse(readFileSync(new URL('../public/forecast/catalog-index.json', import.meta.url), 'utf8'));
  const worldwide = catalogFromIndex(indexJson);

  it('returns the fields Forecast needs, keeping null heights and the missing list', () => {
    const r = toResort({ id: 'x', name: 'X', region: 'Valais', country: 'Switzerland', tz: 'Europe/Zurich', lat: 1, lon: 2, baseLat: 3, baseLon: 4, top: 3800, base: null, missing: ['base'], hasMap: false });
    expect(r).toEqual({ id: 'x', name: 'X', region: 'Valais', country: 'Switzerland', tz: 'Europe/Zurich', lat: 1, lon: 2, baseLat: 3, baseLon: 4, top: 3800, base: null, missing: ['base'] });
  });

  it('falls back to the summit point when the base point is missing', () => {
    const r = toResort({ id: 'x', name: 'X', region: 'Vermont', country: 'USA', tz: 'America/New_York', lat: 1, lon: 2, top: 10, base: 5 });
    expect([r.baseLat, r.baseLon]).toEqual([1, 2]);
  });

  it('keeps the 60 built resorts under their ids with a usable time zone', () => {
    for (const id of ['jay-peak', 'burke', 'cannon-mountain', 'stowe', 'zermatt']) {
      const r = resortFor(worldwide, id);
      expect(r, id).toBeTruthy();
      expect(canForecast(r), id).toBe(true);
      expect(() => localToday(r.tz), id).not.toThrow();
    }
  });

  it('finds Jay Peak, Zermatt and Mt Buller, and shows the alias when the name did not match', () => {
    expect(searchResorts(worldwide, 'jay')[0].id).toBe('jay-peak');
    expect(searchResorts(worldwide, 'Zermatt').some((r) => /zermatt/i.test(r.name))).toBe(true);
    expect(searchResorts(worldwide, 'Mt Buller').some((r) => /buller/i.test(r.name))).toBe(true);
    expect(searchResorts(worldwide, 'zzzzqq')).toEqual([]);
    expect(searchResorts(worldwide, '  ')).toEqual([]);
  });

  it('does not ask for a forecast without height or time zone data', () => {
    expect(canForecast({ top: null, base: null, tz: 'Europe/Zurich' })).toBe(false);
    expect(canForecast({ top: 2000, base: null, tz: null })).toBe(false);
    expect(canForecast({ top: 2000, base: null, tz: 'Europe/Zurich' })).toBe(true);
    expect(forecastPoints({ top: null, base: 900 })).toMatchObject({ top: 900, base: 900 });
    expect(forecastPoints({ top: null, base: null })).toBeNull();
  });

  it('refuses to load a forecast for a mountain with no height data', async () => {
    await expect(loadForecast({ id: 'osd-x', tz: 'Europe/Zurich', lat: 1, lon: 2, top: null, base: null }, false, () => Promise.reject(new Error('should not fetch')))).rejects.toThrow(/height/);
  });

  it('caches the catalog and retries after a failure', async () => {
    let calls = 0;
    const bad = () => { calls += 1; return Promise.resolve({ ok: false, status: 503 }); };
    await expect(loadCatalog({ fetchImpl: bad })).rejects.toThrow();
    const ok = () => { calls += 1; return Promise.resolve({ ok: true, json: () => Promise.resolve(indexJson) }); };
    const first = await loadCatalog({ fetchImpl: ok });
    await loadCatalog({ fetchImpl: ok });
    expect(first.size).toBeGreaterThan(4000);
    expect(calls).toBe(2);
  });

  it('spots two resorts that share a name', () => {
    const a = { id: 'a', name: 'Ragged' }, b = { id: 'b', name: 'ragged' };
    expect(sameName([a], b)).toBe(true);
    expect(sameName([a], a)).toBe(false);
  });
});

describe('list of mountains', () => {
  const jay = byId('jay-peak'), burke = byId('burke'), cannon = byId('cannon-mountain');

  it('starts empty and adds without duplicates', () => {
    const list = add(add([], jay), burke);
    expect(list.map((r) => r.id)).toEqual(['jay-peak', 'burke']);
    expect(add(list, jay)).toBe(list);
  });

  it('removes and reorders without mutating', () => {
    const list = [jay, burke, cannon];
    expect(move(list, cannon.id, -1).map((r) => r.id)).toEqual(['jay-peak', cannon.id, 'burke']);
    expect(move(list, 'jay-peak', -1)).toBe(list);
    expect(move(list, cannon.id, 1)).toBe(list);
    expect(remove(list, 'burke').map((r) => r.id)).toEqual(['jay-peak', cannon.id]);
    expect(list).toHaveLength(3);
  });

  it('puts a removed mountain back in its old place', () => {
    const list = [jay, burke, cannon];
    expect(insertAt(remove(list, 'burke'), burke, 1).map((r) => r.id)).toEqual(list.map((r) => r.id));
    expect(insertAt(list, burke, 0)).toBe(list);
  });

  it('drops damaged saved entries and duplicates when loading', () => {
    const prefs = memoryPrefs({ [LIST_KEY]: [jay, { id: 'broken' }, jay, null, burke] });
    expect(loadList(prefs).map((r) => r.id)).toEqual(['jay-peak', 'burke']);
    expect(cleanList([{ id: 'osd-1', name: 'N', lat: 1, lon: 2, tz: null, top: null, base: null }])).toHaveLength(1);
    expect(cleanList('nonsense')).toEqual([]);
    expect(has(loadList(prefs), 'burke')).toBe(true);
  });

  it('saves and reports a failed save', () => {
    const prefs = memoryPrefs();
    expect(saveList(prefs, [jay])).toBe(true);
    expect(loadList(prefs)).toEqual([jay]);
    const broken = { get: () => null, set: () => {} };
    expect(saveList(broken, [jay])).toBe(false);
  });
});

describe('scoring a watched mountain', () => {
  const weather = fixture('real-stowe-2026-11-22');
  const stowe = { id: 'stowe', lat: 44.5, lon: -72.8, baseLat: 44.45, baseLon: -72.7, top: 1116, base: 399, tz: 'America/New_York' };
  const now = Date.parse('2026-11-22T17:00:00Z');

  it('scores from the saved weather, starting at the mountain’s own today', () => {
    const out = scoreResort(stowe, weather, { now, at: now });
    expect(out.days[0].date).toBe('2026-11-22');
    expect(out.days.length).toBeGreaterThanOrEqual(6);
  });

  it('computes age and lowers confidence when the copy is old', () => {
    expect(ageHoursOf(now - 3 * 3600e3, now)).toBeCloseTo(3);
    expect(ageHoursOf(now + 5000, now)).toBe(0);
    expect(isStale(5.9)).toBe(false);
    expect(isStale(6)).toBe(true);
    const fresh = scoreResort(stowe, weather, { now, at: now }).days[0];
    const old = scoreResort(stowe, weather, { now, at: now - 8 * 3600e3 }).days[0];
    expect(fresh.confidence.reason.code).not.toBe('CR_STALE');
    expect(old.confidence.reason.code).toBe('CR_STALE');
  });

  it('uses published hours, a confirmed closure and the out-of-season note from the resort status', () => {
    const status = { id: 'stowe', fetchedAt: new Date(now).toISOString(), hours: { from: 8, to: 15 }, closures: { '2026-11-23': { code: 'EX_COLD', params: [] } }, liftHolds: [{ lift: 'Gondola', status: 'delayed', date: '2026-11-22' }], season: { open: null, close: null, state: 'closed_for_season' }, grooming: [], assumed: false };
    const days = scoreResort(stowe, weather, { now, at: now, status }).days;
    expect(days[0].skiHours.assumed).toBe(false);
    expect([days[0].skiHours.from, days[0].skiHours.to]).toEqual([8, 15]);
    expect(days.find((d) => d.date === '2026-11-23').status).toBe('closed');
    expect(days[0].notes.map((n) => n.code)).toEqual(expect.arrayContaining(['EX_LIFT_HOLD_CONFIRMED', 'NT_OUT_OF_SEASON']));
    expect(scoreResort(stowe, weather, { now, at: now }).days[0].skiHours.assumed).toBe(true);
  });

  it('keeps the last real status when a refresh falls back to assumed', async () => {
    const real = { id: 'stowe', fetchedAt: new Date(now).toISOString(), hours: { from: 9, to: 16 }, closures: {}, liftHolds: [], grooming: [], season: null, assumed: false };
    const loadWx = () => Promise.resolve({ at: now, source: 'nws', summit: weather.summit, base: weather.base });
    const first = await loadForecast(stowe, false, loadWx, () => Promise.resolve(real), now);
    expect(first.status).toBe(real);
    expect(first.scored.days[0].skiHours.assumed).toBe(false);
  });

  describe('status fallback and caching', () => {
    const real = (fetchedAt) => ({ id: 'stowe', fetchedAt, hours: { from: 9, to: 16 }, closures: { '2026-11-23': { code: 'EX_COLD', params: [] } }, liftHolds: [{ lift: 'Gondola', status: 'delayed', date: '2026-11-22' }], grooming: [], season: null, assumed: false });
    const assumed = { id: 'stowe', fetchedAt: null, hours: null, closures: {}, liftHolds: [], grooming: [], season: null, assumed: true };
    const loadWx = (at) => () => Promise.resolve({ at, source: 'nws', summit: weather.summit, base: weather.base });
    let mem;
    beforeEach(() => { mem = new Map(); globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }; });
    afterEach(() => { delete globalThis.localStorage; });

    it('saves the fetch time with a real status and reuses it for 20 minutes', async () => {
      const calls = [];
      const loader = (r) => { calls.push(r.id); return Promise.resolve(real(new Date(now).toISOString())); };
      const first = await loadStatusSaved(stowe, loader, now);
      expect(first.fetchedAt).toBe(new Date(now).toISOString());
      await loadStatusSaved(stowe, loader, now + 10 * 60e3);
      expect(calls).toHaveLength(1);
      await loadStatusSaved(stowe, loader, now + 21 * 60e3);
      expect(calls).toHaveLength(2);
    });

    it('keeps a recent saved status when the fetch fails', async () => {
      await loadStatusSaved(stowe, () => Promise.resolve(real(new Date(now - 2 * 3600e3).toISOString())), now - 25 * 60e3);
      const out = await loadForecast(stowe, false, loadWx(now), (r) => loadStatusSaved(r, () => Promise.resolve(assumed), now), now);
      expect(out.status.closures['2026-11-23']).toBeTruthy();
      expect(out.scored.days.find((d) => d.date === '2026-11-23').status).toBe('closed');
    });

    it('treats a saved status older than 6 hours as assumed hours with no closures or holds', async () => {
      await loadStatusSaved(stowe, () => Promise.resolve(real(new Date(now - 9 * 3600e3).toISOString())), now - 25 * 60e3);
      const out = await loadForecast(stowe, false, loadWx(now), (r) => loadStatusSaved(r, () => Promise.resolve(assumed), now), now);
      const days = out.scored.days;
      expect(days[0].skiHours.assumed).toBe(true);
      expect([days[0].skiHours.from, days[0].skiHours.to]).toEqual([9, 16]);
      expect(days.find((d) => d.date === '2026-11-23').status).not.toBe('closed');
      expect(days[0].notes.map((n) => n.code)).not.toContain('EX_LIFT_HOLD_CONFIRMED');
      expect(days[0].confidence.reason.code).not.toBe('CR_STALE');
    });
  });

  it('scores again when the mountain’s date or the age band changed', () => {
    const forecast = { resort: stowe, weather, at: now, status: undefined, scored: scoreResort(stowe, weather, { now, at: now }) };
    expect(rescored(forecast, now + 60e3)).toBe(forecast);
    const nextDay = rescored(forecast, Date.parse('2026-11-23T17:00:00Z'));
    expect(nextDay).not.toBe(forecast);
    expect(nextDay.scored.days[0].date).toBe('2026-11-23');
    const aged = rescored(forecast, now + 7 * 3600e3);
    expect(aged.scored.days[0].confidence.reason.code).toBe('CR_STALE');
  });

  it('does not mark days Low for a model issued 11.5 hours ago when the copy was just fetched', async () => {
    const live = { at: now, source: 'nws', summit: weather.summit, base: weather.base, ageHours: 11.5, stale: false, resolutionKm: 2.5 };
    const out = await loadForecast(stowe, false, () => Promise.resolve(live), () => Promise.resolve({ id: 'stowe', assumed: true, closures: {}, liftHolds: [], grooming: [] }), now);
    const near = out.scored.days.filter((d) => d.detail === 'hourly' && d.status === 'ok');
    expect(near.length).toBeGreaterThan(0);
    for (const d of near) {
      expect(d.confidence.reason.code).not.toBe('CR_STALE');
      expect(d.windowConfidence.reason.code).not.toBe('WR_STALE');
    }
    expect(out.serverStale).toBe(false);
  });

  it('marks a forecast the server served from its backup, and ignores the phone’s own offline fallback', async () => {
    const served = { at: now, source: 'nws', summit: weather.summit, base: weather.base, ageHours: 14, stale: true };
    const a = await loadForecast(stowe, false, () => Promise.resolve(served), () => Promise.resolve({ id: 'stowe', assumed: true, closures: {}, liftHolds: [], grooming: [] }), now);
    expect(a.serverStale).toBe(true);
    expect(a.scored.days[0].confidence.reason.code).toBe('CR_STALE');
    const offline = await loadForecast(stowe, false, () => Promise.resolve({ ...served, stale: true, error: 'offline', ageHours: 1 }), () => Promise.resolve({ id: 'stowe', assumed: true, closures: {}, liftHolds: [], grooming: [] }), now);
    expect(offline.serverStale).toBe(false);
    expect(offline.scored.days[0].confidence.reason.code).not.toBe('CR_STALE');
  });

  it('asks the weather service for the backup copy only from Forecast', async () => {
    const seen = [];
    await loadForecast(stowe, false, (place, force, options) => { seen.push(options); return Promise.resolve({ at: now, summit: weather.summit, base: weather.base }); }, () => Promise.resolve({ id: 'stowe', assumed: true, closures: {}, liftHolds: [], grooming: [] }), now);
    expect(seen).toEqual([{ allowStale: true }]);
  });

  it('never shows a day before today', () => {
    const later = Date.parse('2026-11-24T17:00:00Z');
    expect(scoreResort(stowe, weather, { now: later, at: later }).days[0].date).toBe('2026-11-24');
  });

  describe('server history', () => {
    const hourly = (n) => ({ hourly: { time: Array.from({ length: n }, (_, i) => new Date(Date.parse(`${weather.base.hourly.time[0]}:00Z`) - (n - i) * 3600e3).toISOString().slice(0, 16)), temperature_2m: Array(n).fill(-4), apparent_temperature: Array(n).fill(-7), snowfall: Array(n).fill(0), wind_speed_10m: Array(n).fill(3), wind_gusts_10m: Array(n).fill(5), visibility: Array(n).fill(9000), weather_code: Array(n).fill(0), observed: Array(n).fill(true) } });
    const long = { summit: hourly(72), base: hourly(72) };
    const live = () => Promise.resolve({ at: now, source: 'nws', summit: weather.summit, base: weather.base, ageHours: 1, stale: false, resolutionKm: 2.5 });
    const assumed = () => Promise.resolve({ id: 'stowe', assumed: true, closures: {}, liftHolds: [], grooming: [] });
    let mem;
    beforeEach(() => { mem = new Map(); globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }; });
    afterEach(() => { delete globalThis.localStorage; vi.unstubAllGlobals(); });

    it('fetches /api/history/<id> once for 20 minutes, treats 404 as none yet, and skips pins and offline', async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'stowe', ...long })));
      vi.stubGlobal('fetch', fetchMock);
      expect((await loadHistory(stowe, false, now)).base.hourly.time).toHaveLength(72);
      await loadHistory(stowe, false, now + 19 * 60e3);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/history/stowe');
      expect(savedHistory(stowe, now + 19 * 60e3).data).toBeTruthy();
      await loadHistory(stowe, false, now + 21 * 60e3);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await loadHistory(stowe, true, now + 22 * 60e3);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(await loadHistory({ ...stowe, id: 'pin-abc' }, false, now)).toBeNull();
      vi.stubGlobal('navigator', { onLine: false });
      expect(await loadHistory({ ...stowe, id: 'other' }, false, now)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      vi.stubGlobal('navigator', { onLine: true });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
      expect(await loadHistory({ ...stowe, id: 'fresh' }, false, now)).toBeNull();
      expect(savedHistory({ ...stowe, id: 'fresh' }, now).data).toBeNull();
      expect(savedHistory({ ...stowe, id: 'fresh' }, now + 3 * 60e3)).toBeNull();
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ summit: {}, base: { hourly: { time: [] } } }))));
      expect(await loadHistory({ ...stowe, id: 'malformed' }, false, now)).toBeNull();
      expect(savedHistory({ ...stowe, id: 'malformed' }, now)).toBeNull();
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
      expect(await loadHistory({ ...stowe, id: 'broken' }, false, now)).toBeNull();
    });

    it('draws without waiting for history, and rescoring with it makes High confidence reachable', async () => {
      const first = await loadForecast(stowe, false, live, assumed, now);
      expect(first.history).toBeUndefined();
      expect(first.scored.inputs.historyHours).toBe(0);
      const better = withHistory(first, long, now);
      expect(better.scored.inputs.historyHours).toBe(72);
      expect(better.scored.days.some((d) => d.confidence.level === 'High')).toBe(true);
      expect(rescored(better, now + 60e3)).toBe(better);
      expect(withHistory(first, null, now)).toBe(first);
      mem.set('weski:history1:stowe', JSON.stringify({ at: now, data: long }));
      const cached = await loadForecast(stowe, false, live, assumed, now);
      expect(cached.scored.inputs.historyHours).toBe(72);
    });

    it('keeps the history when a forecast is scored again for a new band', async () => {
      const first = withHistory(await loadForecast(stowe, false, live, assumed, now), long, now);
      expect(rescored(first, now + 7 * 3600e3).scored.inputs.historyHours).toBe(72);
    });

    it('counts the age of a served forecast from when it was issued, up to the moment it is drawn', () => {
      const w = { ageHours: 14 };
      expect(sourceAgeHours(w, now, now + 3 * 3600e3)).toBeCloseTo(17, 5);
      expect(sourceAgeHours({}, now, now)).toBeNull();
    });
  });

  it('writes age text in steps', () => {
    expect(ageText(0.1)).toBe('Updated just now');
    expect(ageText(0.5)).toBe('Updated 30 min ago');
    expect(ageText(3.2)).toBe('Updated 3 h ago');
    expect(ageText(50)).toBe('Updated 2 d ago');
  });

  it('maps scores to the five labels and keeps the 40 boundary in Fair', () => {
    expect(['Epic', 'Great', 'Good', 'Fair', 'Poor']).toEqual([84.5, 69.5, 54.5, 39.5, 0].map((s, i) => bandOf(s + (i < 4 ? 0.01 : 0)).label));
    expect(bandOf(39.49).label).toBe('Poor');
    expect(bandOf(39.5).label).toBe('Fair');
    expect(bandOf(100).shown).toBe(100);
  });

  it('uses broad time blocks for far days and exact hours near', () => {
    const days = scoreResort(stowe, weather, { now, at: now }).days;
    const near = windowSummary({ ...days[0], detail: 'hourly', windowConfidence: { level: 'Medium' } });
    const far = windowSummary({ ...days[0], detail: 'windows' });
    expect(windowSummary({ ...days[0], detail: 'range' }).kind).toBe('hidden');
    if (days[0].window) {
      expect(near.kind).toBe('exact');
      expect(far.kind).toBe('broad');
    }
    expect(windowSummary({ window: null }).kind).toBe('none');
    expect(timeBlocks(days[0]).every((b) => b.score >= 0 && b.score <= 100)).toBe(true);
  });
});

describe('saved list follows the catalog', () => {
  const saved = (over = {}) => ({ id: 'stowe', name: 'Stowe', region: 'Vermont', country: 'USA', tz: 'America/New_York', lat: 44.5, lon: -72.8, baseLat: 44.45, baseLon: -72.7, top: 1116, base: 399, ...over });
  const fresh = saved({ lat: 44.53, top: 1120 });
  const find = (id) => (id === 'stowe' || id === 'old-stowe' ? fresh : null);

  it('replaces a saved entry with the catalog values, and leaves unknown ids alone', () => {
    const pin = { id: 'pin-1', name: 'Pin', lat: 1, lon: 2, top: 10, base: 5, tz: 'UTC' };
    const { list, changed } = syncList([saved(), pin], find);
    expect(changed).toBe(true);
    expect(list[0]).toMatchObject({ lat: 44.53, top: 1120 });
    expect(list[1]).toBe(pin);
  });

  it('turns a merged id into the new id, drops a duplicate, and reports no change when nothing differs', () => {
    expect(syncList([saved({ id: 'old-stowe' })], find).list[0].id).toBe('stowe');
    expect(syncList([saved(), saved({ id: 'old-stowe' })], find).list).toHaveLength(1);
    const same = [fresh];
    const out = syncList(same, find);
    expect(out.changed).toBe(false);
    expect(out.list).toBe(same);
  });
});

describe('sorting by a date', () => {
  const day = (date, score, level = 'Medium', status = 'ok') => ({ date, score, status, confidence: { level } });
  const row = (id, days) => ({ resort: { id }, forecast: days ? { scored: { days } } : undefined });
  const rows = [
    row('a', [day('d1', 60.4)]),
    row('b', [day('d1', 80.2)]),
    row('c', [day('d1', 80.2, 'Low')]),
    row('d', [day('d1', 0, 'Medium', 'closed')]),
    row('e'),
    row('f', [day('d2', 99)]),
  ];

  it('orders best first, then by confidence, then by the saved order', () => {
    expect(sortRows(rows, 'd1').map((r) => r.resort.id)).toEqual(['b', 'c', 'a', 'd', 'e', 'f']);
  });

  it('compares unrounded scores', () => {
    const close = [row('x', [day('d1', 70.4)]), row('y', [day('d1', 70.49)])];
    expect(sortRows(close, 'd1').map((r) => r.resort.id)).toEqual(['y', 'x']);
  });

  it('keeps the user’s order with no date and does not change the input', () => {
    expect(sortRows(rows, null)).toBe(rows);
    const copy = rows.map((r) => r.resort.id);
    sortRows(rows, 'd1');
    expect(rows.map((r) => r.resort.id)).toEqual(copy);
  });

  it('marks a top pick only when the first row has a real score', () => {
    expect(topPickId(rows, 'd1')).toBe('b');
    expect(topPickId([row('d', [day('d1', 0, 'Medium', 'closed')])], 'd1')).toBeNull();
  });

  it('builds the date columns from every watched mountain', () => {
    const dates = columnDates([{ scored: { days: [{ date: '2026-11-23' }, { date: '2026-11-22' }] } }, { scored: { days: [{ date: '2026-11-24' }] } }, undefined]);
    expect(dates).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
  });
});

describe('forecast text is translated', () => {
  const sources = ['ui.js', 'text.js', 'data.js'].map((f) => readFileSync(new URL(`../src/forecast/${f}`, import.meta.url), 'utf8'));
  const literals = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/\b(?:t|tag|confWord|codeText)\(/g)) {
      let depth = 1, j = m.index + m[0].length;
      const from = j;
      while (j < src.length && depth > 0) { const c = src[j]; if (c === '(' || c === '[') depth += 1; else if (c === ')' || c === ']') depth -= 1; j += 1; }
      for (const x of src.slice(from, j - 1).matchAll(/'((?:[^'\\]|\\.)*)'/g)) literals.add(x[1].replace(/\\'/g, "'"));
    }
  }
  for (const src of sources) for (const m of src.matchAll(/fallback = '((?:[^'\\]|\\.)*)'/g)) literals.add(m[1]);
  const known = new Set(Object.values(EN));

  it('has an English entry for every t() literal', () => {
    const missing = [...literals].filter((s) => /[A-Za-z]/.test(s) && s !== 'prev' && s !== 'up' && !known.has(s));
    expect(missing).toEqual([]);
  });

  it('has an English entry for every engine code and band label', () => {
    expect(Object.values(CODE_TEXT).filter((s) => !known.has(s))).toEqual([]);
    for (const word of ['Epic', 'Great', 'Good', 'Fair', 'Poor', 'Morning', 'Midday', 'Afternoon', 'High', 'Medium', 'Low', 'Med']) expect(known.has(word), word).toBe(true);
  });

  it('translates the fallback text and the Tomorrow label', () => {
    expect(literals.has('No explanation is available for this day.')).toBe(true);
    expect(codeText(undefined)).toBe('No explanation is available for this day.');
    expect(codeText({ code: 'NT_WEATHER_ALERT', params: [null] })).toBe('Weather alert: .');
    expect(known.has('Tomorrow')).toBe(true);
  });

  it('covers every code the scoring engine can return', async () => {
    const { ALL_CODES } = await import('../src/forecast/score/codes.js');
    expect(ALL_CODES.filter((c) => !(c in CODE_TEXT))).toEqual([]);
  });
});
