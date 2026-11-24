import { describe, it, expect } from 'vitest';
import { scoreForecast, ALL_CODES, WEIGHTS, SCORING_VERSION } from '../src/forecast/score/index.js';
import { VERY_COLD_C, veryColdNote } from '../src/forecast/score/explain.js';
import { CODE_TEXT, codeText } from '../src/forecast/text.js';
import EN from '../src/i18n/en.js';

// Issue #51: a very cold day keeps its score (no weight changes without calibration evidence) but carries a note.
const RESORT = { id: 'test', lat: 45.98, lon: 7.75, baseLat: 46.02, baseLon: 7.75, top: 3883, base: 1620, tz: 'Europe/Zurich' };
const pad = (h) => String(h).padStart(2, '0');
const DATE = '2026-11-27';
const calm = { t: -8, feels: -10, snow: 0, wind: 2, gust: 3, vis: 16000, code: 0 };

function site(at) {
  const times = Array.from({ length: 24 }, (_, h) => `${DATE}T${pad(h)}:00`);
  const rows = times.map((t) => ({ ...calm, ...at(+t.slice(11, 13)) }));
  const col = (k) => rows.map((r) => r[k]);
  return { hourly: { time: times, temperature_2m: col('t'), apparent_temperature: col('feels'), snowfall: col('snow'), wind_speed_10m: col('wind'), wind_gusts_10m: col('gust'), visibility: col('vis'), weather_code: col('code') } };
}
const dayOf = (summitAt, baseAt = () => ({ t: -3, feels: -5, wind: 1 }), resort = RESORT) =>
  scoreForecast(resort, { summit: site(summitAt), base: site(baseAt) }, { today: DATE }).days[0];
const coldNotes = (d) => d.notes.filter((n) => n.code === 'NT_VERY_COLD');

describe('very cold day note (issue #51)', () => {
  it('adds NT_VERY_COLD with the coldest ski-hour temperature when the summit feels like -20 C or colder', () => {
    const d = dayOf((h) => (h >= 9 && h < 12 ? { t: -18, feels: -24.8 } : { t: -15, feels: -17 }));
    expect(VERY_COLD_C).toBe(-20);
    expect(coldNotes(d)).toEqual([{ code: 'NT_VERY_COLD', params: [-25] }]);
  });

  it('counts -20 exactly but not -19.9', () => {
    expect(coldNotes(dayOf((h) => (h === 10 ? { feels: -20 } : {})))).toHaveLength(1);
    expect(coldNotes(dayOf((h) => (h === 10 ? { feels: -19.9 } : {})))).toEqual([]);
  });

  it('looks only at ski hours: a -30 C night gives no note', () => {
    expect(coldNotes(dayOf((h) => (h < 7 ? { t: -26, feels: -30 } : {})))).toEqual([]);
  });

  it('uses the air temperature when it is colder or there is no feels-like value', () => {
    expect(coldNotes(dayOf((h) => (h === 13 ? { t: -22, feels: -18 } : {})))[0].params).toEqual([-22]);
    expect(coldNotes(dayOf((h) => (h === 13 ? { t: -21, feels: null } : {})))[0].params).toEqual([-21]);
  });

  it('uses the one site on a one-estimate mountain', () => {
    const small = { ...RESORT, top: 400, base: 340 };
    const d = dayOf(() => ({}), (h) => (h === 11 ? { t: -20, feels: -27 } : { t: -12, feels: -15 }), small);
    expect(coldNotes(d)).toEqual([{ code: 'NT_VERY_COLD', params: [-27] }]);
  });

  it('never changes the score, explanation or confidence: the note is the only difference', () => {
    const cold = (h) => ({ t: -18, feels: h === 12 ? -20 : -19.9 });
    const notQuite = () => ({ t: -18, feels: -19.9 });
    const a = dayOf(cold), b = dayOf(notQuite);
    expect(coldNotes(a)).toHaveLength(1);
    expect(coldNotes(b)).toHaveLength(0);
    expect(Math.abs(a.score - b.score)).toBeLessThan(0.05);
    expect(a.explain).toEqual(b.explain);
    expect(a.confidence).toEqual(b.confidence);
    expect(WEIGHTS).toEqual({ surface: 0.45, visibility: 0.25, wind: 0.2, comfort: 0.1 });
  });

  it('the issue day (summit -24.8 C, calm, light snow) still scores high but is no longer silent about the cold', () => {
    const d = dayOf((h) => (h >= 9 && h < 12 ? { t: -24.8, feels: -24.8, wind: 1.6, gust: 2.5, snow: 0.3, code: 71 } : { t: -16.8, feels: -16.8, wind: 1.6, snow: 0.3, code: 71 }), () => ({ t: -10.7, feels: -10.7, wind: 1, snow: 0.3, code: 71 }));
    expect(d.status).toBe('ok');
    expect(d.score).toBeGreaterThan(80);
    expect(coldNotes(d)).toEqual([{ code: 'NT_VERY_COLD', params: [-25] }]);
  });

  it('returns null for rows without sites and is a listed code with English and translated text', () => {
    expect(veryColdNote([])).toBeNull();
    expect(ALL_CODES).toContain('NT_VERY_COLD');
    expect(SCORING_VERSION).toBe('1.8.0');
    expect(EN[1430]).toBe(CODE_TEXT.NT_VERY_COLD);
    expect(codeText({ code: 'NT_VERY_COLD', params: ['-25°C'] })).toBe('Very cold on the lifts: it feels like -25°C in the coldest ski hour.');
  });

  it('has the note in all nine other languages with its {0} slot', async () => {
    for (const lang of ['es', 'fr', 'de', 'it', 'pt', 'nl', 'ja', 'ko', 'zh']) {
      const tbl = (await import(`../src/i18n/${lang}.js`)).default;
      expect(tbl[1430], lang).toContain('{0}');
    }
  });
});
