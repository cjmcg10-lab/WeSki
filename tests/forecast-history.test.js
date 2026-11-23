import { describe, it, expect } from 'vitest';
import { scoreForecast, ALL_CODES, SCORING_VERSION, detailLevel, elevationMismatch } from '../src/forecast/score/index.js';
import { replayHistory } from '../src/forecast/score/hour.js';
import { broadWindow } from '../src/forecast/score/day.js';

const RESORT = { id: 'test', top: 1116, base: 399 };
const pad = (n) => String(n).padStart(2, '0');
const calm = { t: -6, feels: -10, snow: 0, wind: 4, gust: 7, vis: 16000, code: 0 };

function site(times, at, observed = () => false) {
  const rows = times.map((time, i) => ({ ...calm, ...at(i, time) }));
  const col = (k) => rows.map((r) => r[k]);
  return { hourly: { time: times, temperature_2m: col('t'), apparent_temperature: col('feels'), snowfall: col('snow'), wind_speed_10m: col('wind'), wind_gusts_10m: col('gust'), visibility: col('vis'), weather_code: col('code'), observed: times.map((_, i) => observed(i)) } };
}
const dayTimes = (date) => Array.from({ length: 24 }, (_, h) => `${date}T${pad(h)}:00`);
const dateAfter = (date, n) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n)).toISOString().slice(0, 10);

function forecastOf(days, extra = {}) {
  const dates = Array.from({ length: days }, (_, i) => dateAfter('2026-01-10', i));
  const times = dates.flatMap(dayTimes);
  return { summit: site(times, () => ({ wind: 5, gust: 8 })), base: site(times, () => ({ t: -4 })), ...extra };
}

function historyOf(hours, at = () => ({}), observed = () => false) {
  const times = Array.from({ length: hours }, (_, i) => {
    const ms = Date.UTC(2026, 0, 10, 0) - (hours - i) * 3600e3;
    const d = new Date(ms).toISOString();
    return `${d.slice(0, 10)}T${d.slice(11, 13)}:00`;
  });
  return { summit: site(times, at, observed), base: site(times, at, observed) };
}

const firstHour = (out) => out.days[0].hours[0].base;
const NOON = (out) => out.days[0].hours.find((h) => h.hour === 12);

describe('snow history carried into the surface state', () => {
  const rainThenFreeze = historyOf(36, (i) => (i < 12 ? { t: 2, feels: 0, snow: 0, code: 63 } : { t: -6 }));

  it('rain followed by a refreeze in the history starts the forecast on an icy surface', () => {
    const without = scoreForecast(RESORT, forecastOf(1));
    const withHistory = scoreForecast(RESORT, forecastOf(1), { history: rainThenFreeze });
    expect(firstHour(without).surface.code).toBe('surf.firm_groomed');
    expect(firstHour(withHistory).surface.code).toBe('surf.icy');
    expect(NOON(withHistory).components.surface).toBeLessThan(NOON(without).components.surface - 20);
    expect(withHistory.days[0].score).toBeLessThan(without.days[0].score);
  });

  it('fresh snow over a firm base in the history starts the forecast on fresh snow', () => {
    const snowed = historyOf(36, (i) => (i >= 24 ? { snow: 2, code: 73, vis: 3000 } : {}));
    const without = scoreForecast(RESORT, forecastOf(1));
    const withHistory = scoreForecast(RESORT, forecastOf(1), { history: snowed });
    expect(['surf.fresh_firm', 'surf.deep_fresh']).toContain(firstHour(withHistory).surface.code);
    expect(firstHour(withHistory).components.surface).toBeGreaterThan(firstHour(without).components.surface + 10);
    expect(withHistory.days[0].score).toBeGreaterThan(without.days[0].score);
  });

  it('wet snow from a warm spell in the history is still wet when the forecast starts just below freezing', () => {
    const warm = historyOf(24, () => ({ t: 5, feels: 4 }));
    const cool = forecastOf(1, { base: site(dayTimes('2026-01-10'), () => ({ t: -0.5 })) });
    expect(firstHour(scoreForecast(RESORT, cool, { history: warm })).surface.code).toBe('surf.wet_snow');
    expect(firstHour(scoreForecast(RESORT, cool)).surface.code).toBe('surf.firm_groomed');
  });

  it('ignores history hours at or after the first forecast hour and uses only the last 72 valid hours', () => {
    const times = ['2026-01-09T22:00', '2026-01-09T23:00', '2026-01-10T00:00', '2026-01-10T01:00'];
    const block = site(times, (i) => (i >= 2 ? { snow: 9, t: -6 } : {}), (i) => i === 0);
    expect(replayHistory(block, '2026-01-10T00:00')).toMatchObject({ hours: 2, observed: 1 });
    expect(replayHistory(historyOf(100).base, '2026-01-10T00:00').hours).toBe(72);
  });

  it('skips history hours that lack temperature, wind or snowfall', () => {
    const block = site(['2026-01-09T22:00', '2026-01-09T23:00'], (i) => (i === 0 ? { t: null } : {}));
    expect(replayHistory(block, '2026-01-10T00:00').hours).toBe(1);
  });
});

describe('confidence with history', () => {
  const FULL = historyOf(72, () => ({}), (i) => i >= 24);
  const weather = (extra = {}) => ({ ...forecastOf(7), ageHours: 1, resolutionKm: 2.5, gridElevation: { summit: 900, base: 399 }, ...extra });
  const level = (day) => [day.confidence.level, day.confidence.reason.code];

  it('is High on the first days when 48 or more history hours exist and a station measured at least 24 of them', () => {
    const out = scoreForecast(RESORT, weather(), { history: FULL });
    expect(out.inputs).toMatchObject({ historyHours: 72, observedHours: 48, elevationMismatchM: 216 });
    expect(out.days.slice(0, 3).map(level)).toEqual([['High', 'CR_HISTORY_COVERED'], ['High', 'CR_HISTORY_COVERED'], ['High', 'CR_HISTORY_COVERED']]);
    expect(out.days[0].flags).not.toContain('snow_history_limited');
  });

  it('drops the snow-history reason at 48 hours and keeps it below', () => {
    expect(level(scoreForecast(RESORT, weather(), { history: historyOf(47, () => ({}), () => true) }).days[0])).toEqual(['Medium', 'CR_SNOW_HISTORY_LIMITED']);
    expect(scoreForecast(RESORT, weather(), { history: historyOf(47) }).days[0].flags).toContain('snow_history_limited');
    expect(level(scoreForecast(RESORT, weather(), { history: historyOf(48, () => ({}), () => true) }).days[0])).toEqual(['High', 'CR_HISTORY_COVERED']);
    expect(level(scoreForecast(RESORT, weather()).days[0])).toEqual(['Medium', 'CR_SNOW_HISTORY_LIMITED']);
  });

  it('stays Medium when the history is model hours only', () => {
    expect(level(scoreForecast(RESORT, weather(), { history: historyOf(72) }).days[0])).toEqual(['Medium', 'CR_NO_OBSERVATIONS']);
  });

  it('lowers with lead time: Medium for days 3 to 5, Low from day 6', () => {
    const out = scoreForecast(RESORT, weather(), { history: FULL });
    expect(out.days.map((d) => d.daysAhead)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(out.days.slice(3, 6).map(level)).toEqual([['Medium', 'CR_FAR_AHEAD'], ['Medium', 'CR_FAR_AHEAD'], ['Medium', 'CR_FAR_AHEAD']]);
    expect(level(out.days[6])).toEqual(['Low', 'CR_FAR_AHEAD']);
    expect(out.days[3].confidence.reason.params).toEqual([3]);
  });

  it('is Medium on a coarse grid and names the grid size', () => {
    const out = scoreForecast(RESORT, weather({ resolutionKm: 9 }), { history: FULL });
    expect(out.days[0].confidence).toEqual({ level: 'Medium', reason: { code: 'CR_COARSE_GRID', params: [9] } });
  });

  it('is Medium when the model ground is 500 m or more from the resort and Low from 1,000 m, and ignores an unknown height', () => {
    const medium = scoreForecast(RESORT, weather({ gridElevation: { summit: 500, base: 399 } }), { history: FULL }).days[0];
    expect(medium.confidence).toEqual({ level: 'Medium', reason: { code: 'CR_ELEVATION_MISMATCH', params: [616] } });
    const low = scoreForecast(RESORT, weather({ gridElevation: { summit: 100, base: 399 } }), { history: FULL }).days[0];
    expect(level(low)).toEqual(['Low', 'CR_ELEVATION_MISMATCH']);
    expect(level(scoreForecast(RESORT, weather({ gridElevation: { summit: null, base: null } }), { history: FULL }).days[0])).toEqual(['High', 'CR_HISTORY_COVERED']);
    expect(elevationMismatch(RESORT, undefined)).toBeNull();
  });

  it('is Low with the age when the phone copy is old or the source was served from the last good copy', () => {
    expect(scoreForecast(RESORT, weather(), { history: FULL, fetchAgeHours: 9 }).days[0].confidence).toEqual({ level: 'Low', reason: { code: 'CR_STALE', params: [9] } });
    const served = scoreForecast(RESORT, weather({ ageHours: 30, stale: true }), { history: FULL });
    expect(served.days[0].confidence.reason).toEqual({ code: 'CR_STALE', params: [30] });
    expect(served.days[0].flags).toContain('stale_source');
    expect(served.days[0].windowConfidence).toEqual({ level: 'Low', reason: { code: 'WR_STALE', params: [30] } });
    expect(scoreForecast(RESORT, weather({ ageHours: 1 }), { history: FULL, ageHours: 12 }).inputs.ageHours).toBe(12);
  });

  it('treats the model issue age as a loose signal: 11.5 h is fine, 18 h is Medium, 30 h is Low', () => {
    const live = (ageHours, opts = {}) => scoreForecast(RESORT, weather({ ageHours, stale: false }), { history: FULL, fetchAgeHours: 0, ...opts }).days;
    for (const d of live(11.5).filter((x) => x.daysAhead <= 1 && x.status === 'ok')) {
      expect(d.confidence.reason.code).not.toBe('CR_STALE');
      expect(d.windowConfidence.reason.code).not.toBe('WR_STALE');
      expect(d.confidence.level).toBe('High');
    }
    expect(live(18)[0].confidence).toEqual({ level: 'Medium', reason: { code: 'CR_STALE', params: [18] } });
    expect(live(30)[0].confidence).toEqual({ level: 'Low', reason: { code: 'CR_STALE', params: [30] } });
    expect(scoreForecast(RESORT, weather({ ageHours: 1 }), { history: FULL }).inputs.fetchAgeHours).toBeNull();
  });

  it('rates the best window separately from the day', () => {
    const fresh = scoreForecast(RESORT, weather(), { history: FULL, hours: { from: 9, to: 16 } });
    expect(fresh.days[0].windowConfidence).toEqual({ level: 'High', reason: { code: 'WR_STABLE', params: [] } });
    expect(fresh.days[2].confidence.level).toBe('High');
    expect(fresh.days[2].windowConfidence).toEqual({ level: 'Medium', reason: { code: 'WR_STABLE', params: [] } });
    expect(fresh.days[3].windowConfidence.reason.code).toBe('WR_TOO_FAR_AHEAD');
    const assumed = scoreForecast(RESORT, weather(), { history: FULL });
    expect(assumed.days[0].confidence.level).toBe('High');
    expect(assumed.days[0].windowConfidence).toEqual({ level: 'Medium', reason: { code: 'WR_HOURS_ASSUMED', params: [] } });
  });

  it('a single estimate or one-site hours stay Low even with full history', () => {
    const summitMissing = { ...weather(), summit: {} };
    expect(level(scoreForecast(RESORT, summitMissing, { history: FULL }).days[0])).toEqual(['Low', 'CR_ONE_ESTIMATE']);
  });

  it('emits only codes that are published', () => {
    const emitted = new Set();
    const collect = (day) => { emitted.add(day.confidence.reason.code); emitted.add(day.windowConfidence.reason.code); };
    for (const history of [FULL, historyOf(10), historyOf(72)]) for (const w of [weather(), weather({ resolutionKm: 9 }), weather({ ageHours: 9 }), weather({ gridElevation: { summit: 100, base: 399 } })]) scoreForecast(RESORT, w, { history }).days.forEach(collect);
    for (const code of emitted) expect(ALL_CODES).toContain(code);
    expect(emitted.size).toBeGreaterThanOrEqual(8);
  });
});

describe('detail levels', () => {
  it('maps days ahead to the finest detail the screens may show', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 14, 15, 40].map(detailLevel)).toEqual(['hourly', 'hourly', 'windows', 'windows', 'windows', 'range', 'range', 'trend', 'trend', 'none', 'none']);
    expect(detailLevel(-1)).toBe('hourly');
  });

  it('puts the level on every day and a broad window only on the days that allow broad windows', () => {
    const out = scoreForecast(RESORT, forecastOf(7), { history: historyOf(72) });
    expect(out.days.map((d) => d.detail)).toEqual(['hourly', 'hourly', 'windows', 'windows', 'windows', 'windows', 'range']);
    expect(out.days.map((d) => d.broadWindow === null)).toEqual([true, true, false, false, false, false, true]);
    expect(['morning', 'midday', 'afternoon']).toContain(out.days[3].broadWindow.part);
    expect(out.days[3].broadWindow.end - out.days[3].broadWindow.start).toBeGreaterThanOrEqual(2);
  });

  it('picks the best third of the ski hours, earliest on a tie, and needs at least half the hours', () => {
    const scores = new Map([[9, 50], [10, 50], [11, 80], [12, 80], [13, 80], [14, 60], [15, 60]]);
    expect(broadWindow(scores, 9, 16)).toMatchObject({ part: 'midday', start: 11, end: 14 });
    const flat = new Map([[9, 70], [10, 70], [11, 70], [12, 70], [13, 70], [14, 70], [15, 70]]);
    expect(broadWindow(flat, 9, 16).part).toBe('morning');
    expect(broadWindow(new Map([[11, 90]]), 9, 16)).toBeNull();
    expect(broadWindow(new Map(), 9, 11)).toBeNull();
  });
});

describe('version', () => {
  it('is 1.8.0', () => {
    expect(SCORING_VERSION).toBe('1.8.0');
  });
});
