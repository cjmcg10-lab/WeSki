import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hourGrid, shape } from '../worker/weather.js';
import { scoreForecast, roundHalfUp, SCORING_VERSION, ALL_CODES, WEIGHTS } from '../src/forecast/score/index.js';
import { scoreDay, bestWindow, ASSUMED_HOURS } from '../src/forecast/score/day.js';
import { factorCode } from '../src/forecast/score/explain.js';
import { initialSurface, stepSurface, surfaceScore, visibilityScore, windScore, comfortScore, normalizeHour, holdRisk, scoreSite } from '../src/forecast/score/components.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/forecast/${name}.json`, import.meta.url), 'utf8'));
const RESORT = { id: 'test', lat: 44.5, lon: -72.8, baseLat: 44.45, baseLon: -72.7, top: 1116, base: 399, tz: 'America/New_York' };
const pad = (h) => String(h).padStart(2, '0');

const calm = { t: -4, feels: -8, snow: 0, wind: 4, gust: 7, vis: 16000, code: 0 };
function makeSite(times, at) {
  const rows = times.map((t) => ({ ...calm, ...at(+t.slice(11, 13), t) }));
  const col = (k) => rows.map((r) => r[k]);
  return { hourly: { time: times, temperature_2m: col('t'), apparent_temperature: col('feels'), snowfall: col('snow'), wind_speed_10m: col('wind'), wind_gusts_10m: col('gust'), visibility: col('vis'), weather_code: col('code') } };
}
function dayTimes(date, skip = () => false) {
  return Array.from({ length: 24 }, (_, h) => h).filter((h) => !skip(h)).map((h) => `${date}T${pad(h)}:00`);
}
function makeWeather(dates, summitAt = () => ({}), baseAt = () => ({}), skip) {
  const times = dates.flatMap((d) => dayTimes(d, skip));
  return { summit: makeSite(times, (h, t) => ({ wind: 5, gust: 8, ...summitAt(h, t) })), base: makeSite(times, (h, t) => ({ t: -2, ...baseAt(h, t) })) };
}

const flatRow = (hour, score, date = '2026-01-10') => {
  const site = { components: { surface: score, visibility: score, wind: score, comfort: score }, detail: { crust: 0, wet: 0, rain: 0, fog: false, vis: null, snow: 0, feels: -5 } };
  return { time: `${date}T${pad(hour)}:00`, date, hour, score, components: site.components, sites: 'both', factor: null, base: site, upper: site };
};
const rowsFor = (scores) => Object.entries(scores).map(([h, s]) => flatRow(+h, s));
const windowOf = { from: 9, to: 16, assumed: true };
const day = (scores, extra = {}) => scoreDay({ date: '2026-01-10', rows: rowsFor(scores), window: windowOf, single: false, daysAhead: 0, ...extra });

describe('day score formula', () => {
  it('weights 0.60 x the ski-hour mean and 0.40 x the best 3-hour window: 70 and 85 give 76', () => {
    const d = day({ 9: 58.75, 10: 58.75, 11: 85, 12: 85, 13: 85, 14: 58.75, 15: 58.75 });
    expect(d.mean).toBeCloseTo(70, 9);
    expect(d.window).toMatchObject({ start: 11, end: 14 });
    expect(d.window.mean).toBeCloseTo(85, 9);
    expect(d.score).toBeCloseTo(76, 9);
    expect(roundHalfUp(d.score)).toBe(76);
  });

  it('rounds half up for display only and keeps the unrounded value in the output', () => {
    expect(roundHalfUp(84.5)).toBe(85);
    expect(roundHalfUp(84.4999)).toBe(84);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(100)).toBe(100);
    const d = day({ 9: 70.3, 10: 70.3, 11: 70.3, 12: 70.3, 13: 70.3, 14: 70.3, 15: 70.3 });
    expect(d.score).toBeCloseTo(70.3, 9);
    expect(Number.isInteger(d.score)).toBe(false);
  });

  it('does not let three isolated hours form a window: the window term is dropped and the day is the mean', () => {
    const d = day({ 9: 95, 11: 95, 13: 95, 15: 40 });
    expect(d.status).toBe('ok');
    expect(d.window).toBeNull();
    expect(d.flags).toContain('window_under_3h');
    expect(d.mean).toBeCloseTo(81.25, 9);
    expect(d.score).toBeCloseTo(d.mean, 9);
    expect(d.windowConfidence.reason.code).toBe('WR_NO_WINDOW');
  });

  it('picks the earliest window when windows tie', () => {
    const scores = new Map([[9, 80], [10, 80], [11, 80], [12, 80], [13, 50], [14, 50], [15, 50]]);
    expect(bestWindow(scores, 9, 16)).toMatchObject({ start: 9, end: 12 });
    const d = day({ 9: 80, 10: 80, 11: 80, 12: 80, 13: 50, 14: 50, 15: 50 });
    expect(d.window.start).toBe(9);
  });

  it('ties are earliest even when the sums differ only by float error', () => {
    const scores = new Map([[9, 0.3], [10, 0.2], [11, 0.1], [12, 0.1], [13, 0.3], [14, 0.2], [15, 0.1]]);
    expect(bestWindow(scores, 9, 16).start).toBe(9);
  });

  it('gives the peak hour as the best single ski hour, earliest on ties', () => {
    const d = day({ 9: 60, 10: 90, 11: 70, 12: 90, 13: 60, 14: 60, 15: 60 });
    expect(d.peakHour).toMatchObject({ hour: 10, score: 90 });
  });

  it('uses only hours inside the ski window', () => {
    const rows = [...rowsFor({ 9: 60, 10: 60, 11: 60, 12: 60, 13: 60, 14: 60, 15: 60 }), flatRow(7, 100), flatRow(16, 100), flatRow(20, 100)];
    const d = scoreDay({ date: '2026-01-10', rows, window: windowOf, single: false, daysAhead: 0 });
    expect(d.score).toBeCloseTo(60, 9);
    expect(d.hours.filter((h) => h.ski)).toHaveLength(7);
  });
});

describe('short, missing and insufficient days', () => {
  it('scores a day with exactly 3 ski hours: the window is the whole day', () => {
    const d = scoreDay({ date: '2026-01-10', rows: rowsFor({ 10: 60, 11: 70, 12: 80 }), window: { from: 10, to: 13, assumed: false }, single: false, daysAhead: 0 });
    expect(d.status).toBe('ok');
    expect(d.window).toMatchObject({ start: 10, end: 13 });
    expect(d.score).toBeCloseTo(70, 9);
    expect(d.flags).not.toContain('assumed_hours');
  });

  it('is Insufficient when a short operating day has fewer than 3 ski hours', () => {
    const d = scoreDay({ date: '2026-01-10', rows: rowsFor({ 10: 60, 11: 70 }), window: { from: 10, to: 12, assumed: false }, single: false, daysAhead: 0 });
    expect(d.status).toBe('insufficient');
    expect(d.score).toBeNull();
    expect(d.insufficientReason).toEqual({ code: 'IR_TOO_FEW_HOURS', params: [2] });
  });

  it('needs 4 of the 7 assumed hours: 4 is scored, 3 is Insufficient (more than half missing)', () => {
    expect(day({ 9: 70, 10: 70, 11: 70, 12: 70 }).status).toBe('ok');
    const d = day({ 9: 70, 10: 70, 11: 70 });
    expect(d.status).toBe('insufficient');
    expect(d.insufficientReason.code).toBe('IR_TOO_FEW_HOURS');
    expect(d.skiHours).toMatchObject({ expected: 7, withData: 3 });
  });

  it('is Insufficient when more than half of a longer window is missing even with 3 or more hours', () => {
    const d = scoreDay({ date: '2026-01-10', rows: rowsFor({ 8: 70, 9: 70, 10: 70 }), window: { from: 8, to: 17, assumed: false }, single: false, daysAhead: 0 });
    expect(d.status).toBe('insufficient');
  });

  it('treats hours with null data as missing, from the weather itself', () => {
    const w = makeWeather(['2026-01-10']);
    for (const site of [w.summit, w.base]) for (const h of [9, 10, 11, 14]) site.hourly.temperature_2m[h] = null;
    const d = scoreForecast(RESORT, w).days[0];
    expect(d.skiHours.withData).toBe(3);
    expect(d.status).toBe('insufficient');
  });

  it('says the weather service has nothing when no hour has data', () => {
    const w = makeWeather(['2026-01-10']);
    for (const site of [w.summit, w.base]) site.hourly.temperature_2m.fill(null);
    expect(scoreForecast(RESORT, w).days[0].insufficientReason.code).toBe('IR_SERVICE_UNAVAILABLE');
    expect(scoreForecast(RESORT, {}).days).toEqual([]);
  });

  it('shows Closed only for a confirmed closure the caller passes, with its source code', () => {
    const w = makeWeather(['2026-01-10', '2026-01-11']);
    const closure = { code: 'closed.ops_report', params: ['Test Mountain'] };
    const out = scoreForecast(RESORT, w, { closures: { '2026-01-10': closure, '2026-01-11': true } });
    expect(out.days[0]).toMatchObject({ status: 'closed', score: null, closureSource: closure, hours: [] });
    expect(out.days[1]).toMatchObject({ status: 'closed', closureSource: null });
    expect(scoreForecast(RESORT, w).days.every((d) => d.status === 'ok')).toBe(true);
  });
});

describe('local dates and daylight saving', () => {
  const asWeather = (now) => {
    const grid = hourGrid('America/New_York', now);
    const hours = grid.map((_, i) => ({ t: -3, feels: -6, wind: 4, gust: 7, dir: 270, cloud: 10, pop: 5, snow: 0, rain: 0, vis: 16000, frz: 1500, code: 0 }));
    const sum = shape(hours, grid, 'America/New_York', 44.5, -72.8, now);
    const bas = shape(hours.map((h) => ({ ...h, t: h.t + 3, wind: h.wind - 1 })), grid, 'America/New_York', 44.45, -72.7, now);
    return { summit: sum, base: bas };
  };

  it('keeps every hour on its own local date across the spring-forward change (23-hour day)', () => {
    const out = scoreForecast(RESORT, asWeather(Date.UTC(2026, 2, 8, 12)));
    expect(out.days.slice(0, 3).map((d) => d.date)).toEqual(['2026-03-08', '2026-03-09', '2026-03-10']);
    expect(out.days[0].hours).toHaveLength(23);
    expect(out.days[0].hours.some((h) => h.time === '2026-03-08T02:00')).toBe(false);
    for (const d of out.days.slice(0, 3)) {
      expect(d.status).toBe('ok');
      expect(d.skiHours.withData).toBe(7);
      expect(d.window.start).toBe(9);
    }
    expect(out.days[1].hours[0].time).toBe('2026-03-09T00:00');
  });

  it('copes with the repeated 01:00 label on the fall-back day (25-hour day)', () => {
    const out = scoreForecast(RESORT, asWeather(Date.UTC(2026, 10, 1, 12)));
    expect(out.days.slice(0, 2).map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02']);
    expect(out.days[0].hours).toHaveLength(25);
    expect(out.days[0].hours.filter((h) => h.time === '2026-11-01T01:00')).toHaveLength(2);
    expect(out.days[0].status).toBe('ok');
    expect(out.days[0].skiHours.withData).toBe(7);
    expect(out.days[1].skiHours.withData).toBe(7);
  });

  it('does not move a date when the time zone is far from UTC', () => {
    const w = makeWeather(['2026-06-30', '2026-07-01']);
    expect(scoreForecast({ ...RESORT, tz: 'Pacific/Auckland' }, w).days.map((d) => d.date)).toEqual(['2026-06-30', '2026-07-01']);
  });
});

describe('base and summit', () => {
  it('averages base and upper per hour and keeps both parts', () => {
    const w = makeWeather(['2026-01-10'], () => ({ wind: 12, gust: 18 }), () => ({ wind: 3, gust: 5 }));
    const h = scoreForecast(RESORT, w).days[0].hours[12];
    expect(h.sites).toBe('both');
    expect(h.score).toBeCloseTo((h.base.score + h.upper.score) / 2, 9);
    expect(h.components.wind).toBeCloseTo((h.base.components.wind + h.upper.components.wind) / 2, 9);
    expect(h.upper.components.wind).toBeLessThan(h.base.components.wind);
  });

  it('gives one estimate, flags it and lowers confidence when the summit is missing; never invents summit values', () => {
    const w = makeWeather(['2026-01-10']);
    delete w.summit;
    const out = scoreForecast(RESORT, w);
    const d = out.days[0];
    expect(out.siteMode).toBe('single');
    expect(out.siteReason).toBe('summit_missing');
    expect(d.status).toBe('ok');
    expect(d.hours.every((h) => h.upper === null && h.sites === 'single')).toBe(true);
    expect(d.flags).toContain('single_estimate');
    expect(d.confidence).toEqual({ level: 'Low', reason: { code: 'CR_ONE_ESTIMATE', params: [] } });
  });

  it('treats a summit block with no usable hours the same as a missing summit', () => {
    const w = makeWeather(['2026-01-10']);
    w.summit.hourly.temperature_2m.fill(null);
    expect(scoreForecast(RESORT, w).siteReason).toBe('summit_missing');
  });

  it('gives one estimate when the source returns identical wind for base and summit', () => {
    const w = makeWeather(['2026-01-10'], () => ({ wind: 6, gust: 9 }), () => ({ wind: 6, gust: 9 }));
    const out = scoreForecast(RESORT, w);
    expect(out.siteMode).toBe('single');
    expect(out.siteReason).toBe('identical_wind');
    expect(out.days[0].confidence.reason.code).toBe('CR_ONE_ESTIMATE');
  });

  it('gives one estimate when the resort has almost no vertical drop', () => {
    const out = scoreForecast({ ...RESORT, top: 450, base: 399 }, makeWeather(['2026-01-10']));
    expect(out.siteReason).toBe('small_vertical');
  });

  it('uses the one site that has data for an hour the other lacks, and lowers confidence', () => {
    const w = makeWeather(['2026-01-10']);
    for (const h of [11, 12]) w.summit.hourly.temperature_2m[h] = null;
    const d = scoreForecast(RESORT, w).days[0];
    expect(d.hours[11]).toMatchObject({ sites: 'base', upper: null });
    expect(d.hours[10].sites).toBe('both');
    expect(d.flags).toContain('partial_sites');
    expect(d.confidence.reason.code).toBe('CR_PARTIAL_SITES');
  });

  it('names a missing summit as the reason when a day is Insufficient because of it', () => {
    const w = makeWeather(['2026-01-10']);
    for (const h of [9, 10, 11, 12, 13]) w.summit.hourly.temperature_2m[h] = null;
    for (const h of [9, 10, 11, 12]) w.base.hourly.temperature_2m[h] = null;
    const d = scoreForecast(RESORT, w).days[0];
    expect(d.status).toBe('insufficient');
    expect(d.insufficientReason.code).toBe('IR_SUMMIT_MISSING');
  });
});

describe('component mappings', () => {
  const smooth = (f, from, to, step, maxJump) => {
    let prev = f(from);
    for (let x = from + step; x <= to; x += step) {
      const v = f(x);
      expect(Math.abs(v - prev)).toBeLessThan(maxJump);
      prev = v;
    }
  };
  const x = (o) => normalizeHour({ t: -4, snow: 0, wind: 3, gust: 4, vis: 16000, code: 0, ...o });

  it('weights sum to 1 with surface 45, visibility 25, wind 20, comfort 10', () => {
    expect(WEIGHTS).toEqual({ surface: 0.45, visibility: 0.25, wind: 0.2, comfort: 0.1 });
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('visibility rises smoothly with distance and drops with heavy snowfall or fog', () => {
    smooth((v) => visibilityScore(x({ vis: v })), 0, 20000, 20, 3);
    expect(visibilityScore(x({ vis: 200 }))).toBeLessThan(visibilityScore(x({ vis: 3000 })));
    expect(visibilityScore(x({ vis: 16000 }))).toBe(100);
    expect(visibilityScore(x({ snow: 3, code: 75 }))).toBeLessThan(50);
    expect(visibilityScore(x({ code: 45 }))).toBeLessThanOrEqual(20);
  });

  it('wind falls smoothly as speed or gusts rise', () => {
    smooth((w) => windScore(x({ wind: w, gust: w })), 0, 30, 0.1, 3);
    expect(windScore(x({ wind: 2, gust: 3 }))).toBeGreaterThan(95);
    expect(windScore(x({ wind: 5, gust: 25 }))).toBeLessThan(windScore(x({ wind: 5, gust: 8 })));
    expect(windScore(x({ wind: 22, gust: 30 }))).toBeLessThan(10);
  });

  it('comfort is flat in the comfortable range, falls when very cold, and falls with rain', () => {
    smooth((f) => comfortScore(x({ t: f, feels: f })), -40, 16, 0.1, 3);
    expect(comfortScore(x({ feels: -2 }))).toBe(100);
    expect(comfortScore(x({ feels: -28 }))).toBeLessThan(25);
    expect(comfortScore(x({ t: 2, feels: 2, code: 63 }))).toBeLessThan(40);
  });

  it('snow surface: new snow lifts it, rain then refreeze leaves it icy, daytime sun softens it', () => {
    const run = (hours, start = 0) => hours.reduce((s, [hour, o]) => stepSurface(s, x(o), hour), initialSurface(x({ t: start })));
    const groomed = surfaceScore(initialSurface(x({})));
    const powder = run(Array.from({ length: 8 }, (_, i) => [i, { snow: 2, code: 73 }]));
    expect(surfaceScore(powder)).toBeGreaterThan(groomed + 15);

    const thawed = run([[0, { t: 3, code: 63 }], [1, { t: 3, code: 63 }], [2, { t: 3, code: 63 }]]);
    const frozen = run([[0, { t: 3, code: 63 }], [1, { t: 3, code: 63 }], [2, { t: 3, code: 63 }], ...Array.from({ length: 6 }, (_, i) => [3 + i, { t: -8 }])]);
    expect(surfaceScore(thawed)).toBeLessThan(groomed - 15);
    expect(frozen.crust).toBeGreaterThan(0.3);
    expect(frozen.wet).toBeLessThan(thawed.wet);
    expect(surfaceScore(frozen)).toBeLessThan(groomed - 10);

    const sunny = run(Array.from({ length: 6 }, (_, i) => [10 + i, { t: 4 }]));
    expect(sunny.wet).toBeGreaterThan(0.4);
    expect(surfaceScore(sunny)).toBeLessThan(groomed);
  });

  it('fresh snow on a crust buries it', () => {
    const crust = { fresh: 0, crust: 0.8, wet: 0 };
    const after = stepSurface(crust, x({ snow: 3, code: 73 }), 3);
    expect(after.crust).toBeLessThan(0.1);
    expect(after.fresh).toBeGreaterThan(2);
  });
});

describe('scenario fixtures (derived from a real Stowe response)', () => {
  const run = (name, opts) => scoreForecast(RESORT, fixture(name), opts);
  const groomer = run('scenario-clear-groomer').days[0];

  it('the real response scores 7 days with sensible unrounded values', () => {
    const out = run('real-stowe-2026-11-22', { today: '2026-11-22' });
    expect(out.days).toHaveLength(7);
    expect(out.siteMode).toBe('both');
    for (const d of out.days) {
      expect(d.status).toBe('ok');
      expect(d.score).toBeGreaterThan(40);
      expect(d.score).toBeLessThan(100);
      expect(d.uncertainty).toBeNull();
      expect(d.skiHours).toMatchObject({ from: 9, to: 16, assumed: true, withData: 7 });
    }
    expect(out.days.map((d) => d.daysAhead)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(out.days[0].confidence.level).toBe('Medium');
    expect(out.days[6].confidence).toMatchObject({ level: 'Low', reason: { code: 'CR_FAR_AHEAD', params: [6] } });
    expect(out.days[0].score).toBeGreaterThan(out.days[1].score - 15);
  });

  it('clear groomer day: high score with no new snow, firm groomed surface, no precipitation', () => {
    expect(groomer.score).toBeGreaterThan(85);
    expect(groomer.explain.code).toBe('EX_GROOMED_FIRM_FAST');
    const mid = groomer.hours[10];
    expect(mid.upper.surface.code).toBe('surf.firm_groomed');
    expect(mid.upper.precip.code).toBe('precip.none');
    expect(mid.factor.code).toBe('F_GOOD_VISIBILITY');
  });

  it('powder morning: the best day, fresh snow is the top factor, snowfall flagged early', () => {
    const d = run('scenario-powder-morning').days[0];
    expect(d.score).toBeGreaterThanOrEqual(85);
    expect(groomer.score).toBeGreaterThanOrEqual(85);
    expect(d.score).toBeGreaterThan(groomer.score + 4);
    expect(d.factors[0]).toMatchObject({ component: 'surface', code: 'F_FRESH_SNOW' });
    expect(d.explain.code).toBe('EX_FRESH_SNOW_FIRM_BASE');
    expect(d.hours[6].upper.precip.code).toBe('precip.heavy_snow');
    expect(d.hours[9].upper.surface.code).toMatch(/^surf\.(fresh_packed|fresh_firm|deep_fresh)$/);
    expect(d.hours[6].components.visibility).toBeLessThan(60);
  });

  it('rain day: low score, rain at the base, wet snow up high', () => {
    const d = run('scenario-rain-day').days[0];
    expect(d.score).toBeLessThan(50);
    expect(d.score).toBeLessThan(groomer.score - 35);
    expect(d.explain.code).toBe('EX_RAIN_AT_BASE');
    expect(d.hours[12].base.precip.code).toBe('precip.rain');
    expect(d.hours[12].base.surface.code).toBe('surf.wet_snow');
    expect(d.hours[12].base.score).toBeLessThan(d.hours[12].upper.score);
  });

  it('wind-hold afternoon: afternoon hours collapse, the strong-gust factor is named, window is in the morning', () => {
    const d = run('scenario-wind-hold-afternoon').days[0];
    expect(d.hours[10].score).toBeGreaterThan(d.hours[14].score + 30);
    for (const h of [12, 13, 14, 15]) expect(d.hours[h].score).toBeLessThan(50);
    expect(d.hours[14].hold).toBeGreaterThan(0.9);
    expect(d.score).toBeLessThan(80);
    expect(d.hours[14].factor.code).toBe('F_STRONG_GUSTS');
    expect(d.hours[14].upper.score).toBeLessThan(d.hours[14].base.score);
    expect(d.explain.code).toBe('EX_SUMMIT_WIND');
    expect(d.window.start).toBeLessThan(12);
    expect(d.score).toBeLessThan(groomer.score);
  });

  it('freeze-thaw day: firm and cold early, softening in the sun, named with the hour it starts', () => {
    const d = run('scenario-freeze-thaw').days[0];
    expect(d.explain.code).toBe('EX_SOFTENING_SUN');
    expect(d.explain.params).toHaveLength(1);
    expect(d.explain.params[0]).toBeGreaterThanOrEqual(10);
    expect(d.hours[14].components.surface).toBeLessThan(d.hours[9].components.surface);
    expect(d.hours[14].base.surface.code).toMatch(/^surf\.(softening|wet_snow)$/);
    expect(d.hours[9].base.surface.code).toBe('surf.firm_groomed');
    expect(d.score).toBeGreaterThan(65);
    expect(d.score).toBeLessThan(groomer.score - 4);
    expect(d.hours[9].score).toBeLessThan(groomer.hours[9].score - 3);
    expect(d.hours[9].factor.code).toBe('F_ICY_REFROZEN');
  });

  it('a stale forecast lowers confidence and names its age', () => {
    const d = run('scenario-clear-groomer', { fetchAgeHours: 8 }).days[0];
    expect(d.confidence).toEqual({ level: 'Low', reason: { code: 'CR_STALE', params: [8] } });
  });

  it('a published operating window replaces the assumed one and is not flagged as assumed', () => {
    const out = run('scenario-clear-groomer', { hours: { from: 8, to: 17 } });
    expect(out.hours).toEqual({ from: 8, to: 17, assumed: false });
    expect(out.days[0].skiHours.expected).toBe(9);
    expect(out.days[0].flags).not.toContain('assumed_hours');
    expect(out.days[0].windowConfidence.reason.code).toBe('WR_STABLE');
  });
});

describe('output contract', () => {
  const out = scoreForecast(RESORT, fixture('scenario-powder-morning'));
  const d = out.days[0];

  it('carries the version, assumed window and day fields phase 2 depends on', () => {
    expect(out.version).toBe(SCORING_VERSION);
    expect(out.resortId).toBe('test');
    expect(out.hours).toEqual({ ...ASSUMED_HOURS, assumed: true });
    expect(out.ageHours).toBeNull();
    expect(scoreForecast(RESORT, fixture('scenario-powder-morning'), { ageHours: 3 }).ageHours).toBe(3);
    expect(Object.keys(d).sort()).toEqual(['broadWindow', 'confidence', 'date', 'daysAhead', 'detail', 'explain', 'factors', 'flags', 'hours', 'liftHolds', 'mean', 'notes', 'peakHour', 'range', 'score', 'skiHours', 'status', 'uncertainty', 'window', 'windowConfidence'].sort());
    expect(d.flags).toContain('snow_history_limited');
    expect(d.confidence.level).not.toBe('High');
  });

  it('gives every hour base, upper and combined component scores', () => {
    const h = d.hours[10];
    expect(Object.keys(h.components).sort()).toEqual(['comfort', 'surface', 'visibility', 'wind']);
    expect(Object.keys(h.base.components).sort()).toEqual(['comfort', 'surface', 'visibility', 'wind']);
    expect(h.upper.precip).toEqual({ code: expect.any(String), params: [] });
    expect(h.factor).toMatchObject({ code: expect.any(String), params: [] });
    expect(h).toMatchObject({ ski: true, hour: 10, sites: 'both' });
  });

  it('returns codes and parameters only, and every emitted code is in the published list', () => {
    const emitted = new Set();
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        if (typeof v.code === 'string' && Array.isArray(v.params)) emitted.add(v.code);
        Object.entries(v).forEach(([k, x]) => (k === 'time' ? null : walk(x)));
      }
    };
    for (const name of ['real-stowe-2026-11-22', 'scenario-clear-groomer', 'scenario-freeze-thaw', 'scenario-powder-morning', 'scenario-rain-day', 'scenario-wind-hold-afternoon']) {
      walk(scoreForecast(RESORT, fixture(name), { fetchAgeHours: 7 }));
    }
    walk(scoreForecast(RESORT, makeWeather(['2026-01-10'], () => ({}), () => ({}), (h) => h > 9)));
    walk(scoreForecast({ ...RESORT, top: 420 }, fixture('scenario-rain-day')));
    expect(emitted.size).toBeGreaterThan(10);
    for (const code of emitted) expect(ALL_CODES, code).toContain(code);
    expect(JSON.stringify(out)).not.toMatch(/[.!?] [A-Z]/);
  });

  it('documents every code it can emit', () => {
    const doc = readFileSync(new URL('../docs/FORECAST_SCORING.md', import.meta.url), 'utf8');
    for (const code of ALL_CODES) expect(doc, code).toContain('`' + code + '`');
  });
});

describe('review fixes', () => {
  const only = (weather, opts) => scoreForecast(RESORT, weather, opts).days[0];
  const dateOnly = ['2026-01-10'];

  it('thunder with snow is snow, not rain; warm thunder is rain', () => {
    expect(normalizeHour({ t: -6, snow: 1, wind: 3, code: 95 }).rain).toBe(0);
    expect(normalizeHour({ t: 5, snow: 0, wind: 3, code: 95 }).rain).toBe(2);
    expect(normalizeHour({ t: -6, snow: 0, wind: 3, code: 95 }).rain).toBe(0);
    const w = makeWeather(dateOnly, () => ({ t: -6, snow: 1, code: 95 }), () => ({ t: -5, snow: 1, code: 95 }));
    const h = only(w).hours[12];
    expect(h.upper.precip.code).toBe('precip.snow');
    expect(h.upper.surface.code).not.toBe('surf.wet_snow');
    expect(h.upper.detail.wet).toBe(0);
  });

  it('predicted wind hold: ramps in from 14/20 m/s, reaches full at 18/25, and caps the site toward Poor', () => {
    const wind = (wnd, gust) => normalizeHour({ t: -4, snow: 0, wind: wnd, gust, vis: 16000, code: 0 });
    expect(holdRisk(wind(13, 19))).toBe(0);
    const mid = holdRisk(wind(16, 18));
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(holdRisk(wind(18, 18))).toBe(1);
    expect(holdRisk(wind(5, 25))).toBe(1);
    const state = initialSurface(wind(3, 4));
    const calmSite = scoreSite(wind(3, 4), state);
    const held = scoreSite(wind(18, 26), state);
    expect(calmSite.hold).toBe(0);
    expect(held.score).toBeCloseTo(35, 9);
    expect(scoreSite(wind(14.5, 16), state).score).toBeGreaterThan(held.score);
  });

  it('a summit gale all day cannot stay in the Good band at the summit, and a gale on both sites is Poor', () => {
    const summitOnly = only(makeWeather(dateOnly, () => ({ wind: 30, gust: 40 })));
    expect(summitOnly.hours[12].upper.score).toBeLessThan(40);
    expect(summitOnly.score).toBeLessThan(65);
    expect(summitOnly.explain.code).toBe('EX_SUMMIT_WIND');
    const both = only(makeWeather(dateOnly, () => ({ wind: 30, gust: 40 }), () => ({ wind: 25, gust: 35 })));
    expect(both.score).toBeLessThan(40);
  });

  it('steady rain on snow all day lands below 45', () => {
    const d = only(makeWeather(dateOnly, () => ({ t: 3, feels: 1, code: 63 }), () => ({ t: 4, feels: 2, code: 63 })));
    expect(d.score).toBeLessThan(45);
    expect(d.explain.code).toBe('EX_RAIN_WHOLE_MOUNTAIN');
  });

  it('rain at the base with snow higher up says so', () => {
    const d = only(makeWeather(dateOnly, () => ({ t: -1, snow: 0.5, code: 71 }), () => ({ t: 4, feels: 2, code: 63 })));
    expect(d.explain.code).toBe('EX_RAIN_AT_BASE');
  });

  it('wet base under a cold dry summit says drier higher up, not rain across the whole mountain', () => {
    const d = only(makeWeather(dateOnly, () => ({ t: -13, code: 3 }), () => ({ t: 1, snow: 0.1, code: 68 })));
    expect(d.explain.code).toBe('EX_RAIN_AT_BASE_DRY');
  });

  it('wet base under a snowing summit still says snow higher up', () => {
    const d = only(makeWeather(dateOnly, () => ({ t: -8, snow: 0.5, code: 73 }), () => ({ t: 4, feels: 2, code: 63 })));
    expect(d.explain.code).toBe('EX_RAIN_AT_BASE');
  });

  it('one rainy summit hour among base-only rain hours reads as rain across the whole mountain', () => {
    const d = only(makeWeather(dateOnly, (h) => (h === 12 ? { t: 3, feels: 1, code: 63 } : { t: -13, code: 3 }), () => ({ t: 4, feels: 2, code: 63 })));
    expect(d.explain.code).toBe('EX_RAIN_WHOLE_MOUNTAIN');
  });

  it('warm days are not called comfortable and not called cold', () => {
    expect(factorCode('comfort', -3, { rain: 0, snow: 0, feels: 8 })).toBe('F_TOO_WARM');
    expect(factorCode('comfort', -3, { rain: 0, snow: 0, feels: -20 })).toBe('F_COLD');
    expect(factorCode('comfort', -3, { rain: 0, snow: 0, feels: 0 })).toBe('F_COMFORTABLE');
    expect(factorCode('comfort', -3, { rain: 1, snow: 0, feels: 8 })).toBe('F_RAIN');
    const warm = only(makeWeather(dateOnly, () => ({ feels: 9 }), () => ({ feels: 9 })));
    expect(warm.explain.code).toBe('EX_WARM_SOFT');
    expect(warm.factors[0]).toMatchObject({ component: 'comfort', code: 'F_TOO_WARM' });
    expect(warm.hours[12].factor.code).toBe('F_TOO_WARM');
    const cold = only(makeWeather(dateOnly, () => ({ feels: -25 }), () => ({ feels: -25 })));
    expect(cold.explain.code).toBe('EX_COLD');
    expect(cold.factors[0].code).toBe('F_COLD');
  });

  it('mild haze is not low visibility; a real deficit is', () => {
    const hazy = only(makeWeather(dateOnly, () => ({ vis: 4500 }), () => ({ vis: 4500 })));
    expect(hazy.explain.code).toBe('EX_GROOMED_FIRM_FAST');
    const murk = only(makeWeather(dateOnly, () => ({ vis: 1500 }), () => ({ vis: 1500 })));
    expect(murk.explain.code).toBe('EX_LOW_VISIBILITY');
  });

  it('flat light and gusts in the afternoon only when the gusts are in the afternoon', () => {
    const murky = { vis: 800 };
    const pm = only(makeWeather(dateOnly, (h) => ({ ...murky, ...(h >= 12 ? { wind: 14, gust: 20 } : {}) }), (h) => murky));
    expect(pm.explain.code).toBe('EX_FLAT_LIGHT_GUSTS_PM');
    const am = only(makeWeather(dateOnly, (h) => ({ ...murky, ...(h < 12 ? { wind: 14, gust: 20 } : {}) }), (h) => murky));
    expect(am.explain.code).toBe('EX_LOW_VISIBILITY');
  });

  it('names fog at the base with a neutral code and fog at the summit as summit fog', () => {
    const baseFog = only(makeWeather(dateOnly, () => ({}), () => ({ vis: 200, code: 45 }))).hours[12];
    expect(baseFog.factor.code).toBe('F_FOG');
    const summitFog = only(makeWeather(dateOnly, () => ({ vis: 200, code: 45 }), () => ({}))).hours[12];
    expect(summitFog.factor.code).toBe('F_SUMMIT_FOG');
  });

  it('a day whose ski hours fall after the series ends has too few hours, not no service', () => {
    const d = only(makeWeather(dateOnly, () => ({}), () => ({}), (h) => h >= 9));
    expect(d.insufficientReason).toEqual({ code: 'IR_TOO_FEW_HOURS', params: [0] });
  });

  it('handles a resort with no elevation (a map pin) without calling it a single estimate', () => {
    const out = scoreForecast({ id: 'pin', lat: 44, lon: -72, tz: 'UTC' }, makeWeather(dateOnly));
    expect(out.siteMode).toBe('both');
  });

  it('near-identical wind at both sites is not an identical-wind single estimate', () => {
    const w = makeWeather(dateOnly, () => ({ wind: 6.01, gust: 9 }), () => ({ wind: 6, gust: 9 }));
    expect(scoreForecast(RESORT, w).siteMode).toBe('both');
  });
});
