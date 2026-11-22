import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import EN from '../src/i18n/en.js';
import { toResort, searchResorts, sameName, loadCatalog } from '../src/forecast/resorts.js';
import { add, remove, move, insertAt, has, cleanList, loadList, saveList, sortRows, topPickId, LIST_KEY } from '../src/forecast/watchlist.js';
import { loadForecast, scoreResort, ageHoursOf, isStale, columnDates, bandOf, windowSummary, timeBlocks, localToday } from '../src/forecast/data.js';
import { ageText, CODE_TEXT } from '../src/forecast/text.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/forecast/${name}.json`, import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8')).map(toResort);
const byId = (id) => catalog.find((r) => r.id === id);

const memoryPrefs = (seed = {}) => {
  const store = { ...seed };
  return { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); }, store };
};

describe('resort adapter', () => {
  it('returns the fields Forecast needs and splits region from country', () => {
    const r = toResort({ id: 'x', name: 'X', region: 'Valais, Switzerland / Aosta Valley, Italy', tz: 'Europe/Zurich', lat: 1, lon: 2, baseLat: 3, baseLon: 4, top: 3800, base: 1500, trails: 5 });
    expect(r).toEqual({ id: 'x', name: 'X', region: 'Valais, Switzerland / Aosta Valley', country: 'Italy', tz: 'Europe/Zurich', lat: 1, lon: 2, baseLat: 3, baseLon: 4, top: 3800, base: 1500 });
  });

  it('falls back to the summit point when the base point is missing', () => {
    const r = toResort({ id: 'x', name: 'X', region: 'Vermont, USA', tz: 'America/New_York', lat: 1, lon: 2, top: 10, base: 5 });
    expect([r.baseLat, r.baseLon]).toEqual([1, 2]);
  });

  it('maps all 60 built resorts with a usable time zone', () => {
    expect(catalog).toHaveLength(60);
    for (const r of catalog) {
      expect(r.country, r.id).toBeTruthy();
      expect(() => localToday(r.tz), r.id).not.toThrow();
    }
  });

  it('finds Jay Peak, Burke and Cannon by name, ignoring case and accents', () => {
    expect(searchResorts(catalog, 'jay')[0].id).toBe('jay-peak');
    expect(searchResorts(catalog, 'BURKE').map((r) => r.id)).toContain('burke');
    expect(searchResorts(catalog, 'cannon').length).toBeGreaterThan(0);
    expect(searchResorts(catalog, 'zzzz')).toEqual([]);
  });

  it('searches the region and country as well as the name', () => {
    const vt = searchResorts(catalog, 'vermont', 100);
    expect(vt.length).toBeGreaterThan(3);
    expect(vt.every((r) => /vermont/i.test(`${r.region}${r.country}`))).toBe(true);
  });

  it('caches the catalog and retries after a failure', async () => {
    let calls = 0;
    await expect(loadCatalog(() => { calls += 1; return Promise.resolve({ ok: false }); })).rejects.toThrow();
    const ok = () => { calls += 1; return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'a', name: 'A', region: 'Utah, USA' }]) }); };
    const first = await loadCatalog(ok);
    await loadCatalog(ok);
    expect(first[0].country).toBe('USA');
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
    const status = { id: 'stowe', hours: { from: 8, to: 15 }, closures: { '2026-11-23': { code: 'EX_COLD', params: [] } }, liftHolds: [{ lift: 'Gondola', status: 'delayed', date: '2026-11-22' }], season: { open: null, close: null, state: 'closed_for_season' }, grooming: [], assumed: false };
    const days = scoreResort(stowe, weather, { now, at: now, status }).days;
    expect(days[0].skiHours.assumed).toBe(false);
    expect([days[0].skiHours.from, days[0].skiHours.to]).toEqual([8, 15]);
    expect(days.find((d) => d.date === '2026-11-23').status).toBe('closed');
    expect(days[0].notes.map((n) => n.code)).toEqual(expect.arrayContaining(['EX_LIFT_HOLD_CONFIRMED', 'NT_OUT_OF_SEASON']));
    expect(scoreResort(stowe, weather, { now, at: now }).days[0].skiHours.assumed).toBe(true);
  });

  it('keeps the last real status when a refresh falls back to assumed', async () => {
    const real = { id: 'stowe', hours: { from: 9, to: 16 }, closures: {}, liftHolds: [], grooming: [], season: null, assumed: false };
    const loadWx = () => Promise.resolve({ at: now, source: 'nws', summit: weather.summit, base: weather.base });
    const first = await loadForecast(stowe, false, loadWx, () => Promise.resolve(real));
    expect(first.status).toBe(real);
    expect(first.scored.days[0].skiHours.assumed).toBe(false);
  });

  it('never shows a day before today', () => {
    const later = Date.parse('2026-11-24T17:00:00Z');
    expect(scoreResort(stowe, weather, { now: later, at: later }).days[0].date).toBe('2026-11-24');
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
    const near = windowSummary({ ...days[0], daysAhead: 0, windowConfidence: { level: 'Medium' } });
    const far = windowSummary({ ...days[0], daysAhead: 4 });
    if (days[0].window) {
      expect(near.kind).toBe('exact');
      expect(far.kind).toBe('broad');
    }
    expect(windowSummary({ window: null }).kind).toBe('none');
    expect(timeBlocks(days[0]).every((b) => b.score >= 0 && b.score <= 100)).toBe(true);
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
    for (const m of src.matchAll(/\b(?:t|tag|confWord)\(/g)) {
      let depth = 1, j = m.index + m[0].length;
      const from = j;
      while (j < src.length && depth > 0) { const c = src[j]; if (c === '(' || c === '[') depth += 1; else if (c === ')' || c === ']') depth -= 1; j += 1; }
      for (const x of src.slice(from, j - 1).matchAll(/'((?:[^'\\]|\\.)*)'/g)) literals.add(x[1].replace(/\\'/g, "'"));
    }
  }
  const known = new Set(Object.values(EN));

  it('has an English entry for every t() literal', () => {
    const missing = [...literals].filter((s) => /[A-Za-z]/.test(s) && s !== 'prev' && s !== 'up' && !known.has(s));
    expect(missing).toEqual([]);
  });

  it('has an English entry for every engine code and band label', () => {
    expect(Object.values(CODE_TEXT).filter((s) => !known.has(s))).toEqual([]);
    for (const word of ['Epic', 'Great', 'Good', 'Fair', 'Poor', 'Morning', 'Midday', 'Afternoon', 'High', 'Medium', 'Low', 'Med']) expect(known.has(word), word).toBe(true);
  });

  it('covers every code the scoring engine can return', async () => {
    const { ALL_CODES } = await import('../src/forecast/score/codes.js');
    expect(ALL_CODES.filter((c) => !(c in CODE_TEXT))).toEqual([]);
  });
});
