import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyse, formatReport, mergeExports, meanRating, nowcasts, spearman } from '../tools/forecast_calibrate.mjs';
import { archiveEntry } from '../worker/history.js';
import { scoreForecast, SCORING_VERSION } from '../src/forecast/score/index.js';

const stowe = JSON.parse(readFileSync(new URL('./fixtures/forecast/real-stowe-2026-11-22.json', import.meta.url), 'utf8'));
const PLACE = { top: 1116, base: 399, tz: 'America/New_York' };

const cut = (block, from, windier) => Object.fromEntries(Object.entries(block.hourly).map(([k, v]) => {
  const part = v.slice(from);
  return [k, windier && (k === 'wind_speed_10m' || k === 'wind_gusts_10m') ? part.map((x) => x + windier) : part];
}));

function weatherFrom(dayOffset, extraWind = 0) {
  const wind = dayOffset * 3 + extraWind;
  return { resolutionKm: 2.5, summit: { hourly: cut(stowe.summit, dayOffset * 24, wind) }, base: { hourly: cut(stowe.base, dayOffset * 24, wind) } };
}

function entry(dayOffset, extra = {}, extraWind = 0) {
  const weather = weatherFrom(dayOffset, extraWind);
  const issuedAt = Date.UTC(2026, 10, 22 + dayOffset, 6);
  const scored = scoreForecast({ id: 'stowe', ...PLACE }, weather);
  return { ...archiveEntry({ issuedAt, fetchedAt: issuedAt, source: 'nws', model: 'nws_ndfd', weather, ms0: issuedAt }, scored), ...extra };
}

const archive = [entry(0), entry(1), entry(2)];
const DAYS = ['2026-11-22', '2026-11-23', '2026-11-24'];
const truth = nowcasts(archive);
const byScore = [...DAYS].sort((a, b) => truth.get(a).score - truth.get(b).score);
const counts = (rating) => [1, 2, 3, 4, 5].map((r) => (r === rating ? 4 : 0));
const feedbackFor = (order) => order.map((day, i) => ({ day, ratings: counts(i + 2), tags: {} }));

const exportFor = (id, over = {}) => ({ id, place: PLACE, archive, history: null, feedback: feedbackFor(byScore), ...over });

describe('spearman and meanRating', () => {
  it('is 1 for the same order, -1 for the opposite order and handles ties', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    expect(spearman([1, 2, 2, 4], [1, 3, 3, 9])).toBeCloseTo(1);
  });

  it('is null for fewer than 3 pairs or when one side never changes', () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 2, 3], [5, 5, 5])).toBeNull();
  });

  it('averages 1 to 5 counts', () => {
    expect(meanRating([0, 0, 2, 0, 2])).toBe(4);
    expect(meanRating([0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('the recorded archive fixtures', () => {
  it('takes the latest forecast issued on a day as that day\'s score', () => {
    expect([...truth.keys()]).toEqual(DAYS);
    expect(truth.get('2026-11-24').entry).toBe(archive[2]);
  });

  it('measures how far each earlier forecast of a day was from the score of the latest forecast of that day, by lead', () => {
    const { leadTime } = analyse([exportFor('stowe')]);
    expect(leadTime.map((l) => [l.lead, l.n])).toEqual([[1, 2], [2, 1]]);
    expect(leadTime.every((l) => l.mae > 0 && l.mae >= Math.abs(l.bias))).toBe(true);
    const [one] = archive[0].days.slice(1, 2);
    expect(leadTime[0].mae * 2).toBeGreaterThanOrEqual(Math.abs(one.score - truth.get('2026-11-23').score));
  });

  it('reports a perfect rank correlation when ratings follow the scores and -1 when they run against them', () => {
    expect(analyse([exportFor('stowe')]).scoreVsRating.spearman).toBeCloseTo(1);
    const against = analyse([exportFor('stowe', { feedback: feedbackFor([...byScore].reverse()) })]);
    expect(against.scoreVsRating.spearman).toBeCloseTo(-1);
  });

  it('puts each day in its score band with its mean rating', () => {
    const { scoreVsRating } = analyse([exportFor('stowe')]);
    expect(scoreVsRating.days).toBe(3);
    expect(scoreVsRating.bands.reduce((s, b) => s + b.days, 0)).toBe(3);
    for (const b of scoreVsRating.bands.filter((x) => x.days)) expect(b.meanRating).toBeGreaterThanOrEqual(2);
  });

  it('ignores days with fewer answers than asked for', () => {
    expect(analyse([exportFor('stowe')], { minAnswers: 5 }).scoreVsRating.days).toBe(0);
    expect(analyse([exportFor('stowe')], { minAnswers: 4 }).scoreVsRating.days).toBe(3);
  });

  it('keeps only forecasts of the asked scoring version', () => {
    const old = [entry(0, { v: '1.0.0' }), entry(1, { v: '1.0.0' }), entry(2)];
    const both = analyse([exportFor('stowe', { archive: old })]);
    expect(both.versions).toEqual({ '1.0.0': 2, [SCORING_VERSION]: 1 });
    expect(analyse([exportFor('stowe', { archive: old })], { version: SCORING_VERSION }).forecasts).toBe(1);
  });

  it('compares the order of two resorts on the same day', () => {
    const windier = [entry(0, {}, 5), entry(1, {}, 5), entry(2, {}, 5)];
    const sameRating = (rating) => DAYS.map((day) => ({ day, ratings: counts(rating), tags: {} }));
    const stowe3 = exportFor('stowe', { feedback: sameRating(4) });
    expect(nowcasts(windier).get('2026-11-23').score).toBeLessThan(truth.get('2026-11-23').score);
    const agree = analyse([stowe3, exportFor('alps', { archive: windier, feedback: sameRating(2) })]).resortRanking;
    expect(agree).toMatchObject({ dates: 3, pairsCompared: 3, concordance: 1 });
    const disagree = analyse([stowe3, exportFor('alps', { archive: windier, feedback: sameRating(5) })]).resortRanking;
    expect(disagree).toMatchObject({ dates: 3, pairsCompared: 3, concordance: 0 });
    expect(analyse([stowe3]).resortRanking).toMatchObject({ dates: 0, concordance: null });
  });

  it('measures the best-window start against hours a station measured, by lead', () => {
    const observed = (block) => ({ hourly: { ...cut(block, 0, 0), observed: block.hourly.time.map((t) => t.startsWith('2026-11-22')) } });
    const history = { summit: observed(stowe.summit), base: observed(stowe.base) };
    const { windowTiming } = analyse([exportFor('stowe', { history })]);
    expect(windowTiming[0]).toMatchObject({ lead: 0, n: 1, meanAbsHours: 0, withinOneHour: 1 });
    expect(windowTiming.every((w) => w.n >= 1)).toBe(true);
  });

  it('leaves hours the forecast itself filled in out of the timing check', () => {
    const history = { summit: { hourly: { ...cut(stowe.summit, 0, 0), observed: stowe.summit.hourly.time.map(() => false) } }, base: { hourly: { ...cut(stowe.base, 0, 0), observed: stowe.base.hourly.time.map(() => false) } } };
    expect(analyse([exportFor('stowe', { history })]).windowTiming).toEqual([]);
  });

  it('shows how days skiers tagged scored against the others', () => {
    const tagged = exportFor('stowe', { feedback: [
      { day: '2026-11-22', ratings: counts(2), tags: { icy: 4 } },
      { day: '2026-11-23', ratings: counts(4), tags: { icy: 1, powder: 3 } },
      { day: '2026-11-24', ratings: counts(5), tags: {} },
    ] });
    const tags = Object.fromEntries(analyse([tagged]).tags.map((t) => [t.tag, t]));
    expect(tags.icy.days).toBe(1);
    expect(tags.icy.meanScore).toBe(Math.round(truth.get('2026-11-22').score * 10) / 10);
    expect(tags.powder.days).toBe(1);
  });

  it('merges exports of one resort: every forecast once, the newest counts for a day', () => {
    const older = exportFor('stowe', { archive: archive.slice(0, 2), feedback: [{ day: '2026-11-22', ratings: counts(1), tags: {} }] });
    const newer = exportFor('stowe', { feedback: [{ day: '2026-11-22', ratings: counts(5), tags: {} }] });
    const [merged] = mergeExports([older, newer]);
    expect(merged.archive).toHaveLength(3);
    expect(merged.feedback).toEqual([{ day: '2026-11-22', ratings: counts(5), tags: {} }]);
  });

  it('prints a readable report even with no feedback yet', () => {
    const text = formatReport(analyse([exportFor('stowe', { feedback: [] })]));
    expect(text).toContain(`Scoring version now ${SCORING_VERSION}`);
    expect(text).toContain('rank correlation n/a');
    expect(text).toContain('no data yet');
  });

  it('copes with an empty archive', () => {
    expect(analyse([{ id: 'x', place: PLACE, archive: [], feedback: [], history: null }]).forecasts).toBe(0);
  });
});
