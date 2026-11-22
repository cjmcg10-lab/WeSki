import { describe, it, expect } from 'vitest';
import {
  MARGIN, MAX_RANGE_DAYS, classifyDay, cleanTrip, entersRangeOn, isCloseCall, notYet, rangeDays, rangeError, rankTrip, summarize, tripDates,
} from '../src/forecast/trip.js';

const DATES = ['2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08'];
const day = (date, score, level = 'High') => ({ date, score, confidence: { level } });
const closed = (date) => ({ date, status: 'closed', score: 0, confidence: { level: 'High' } });
const insufficient = (date) => ({ date, status: 'insufficient', score: null, confidence: { level: 'Low' } });
const forecast = (days) => ({ scored: { days } });
const resort = (id) => ({ id, name: id });
const entry = (id, days) => ({ resort: resort(id), forecast: days ? forecast(days) : null, entry: { state: days ? 'ok' : 'error' } });
const scores = (id, values, level) => entry(id, DATES.map((d, i) => (values[i] == null ? insufficient(d) : day(d, values[i], level))));
const order = (ranked) => ranked.map((c) => c.resort.id);

describe('trip dates', () => {
  it('turns a range into its days, capped at 14, and ignores a range that ends before it starts', () => {
    expect(rangeDays('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(rangeDays('2026-12-01', '2026-12-31')).toHaveLength(MAX_RANGE_DAYS);
    expect(rangeDays('2026-12-05', '')).toEqual(['2026-12-05']);
    expect(rangeDays('', '2026-12-05')).toEqual([]);
    expect(rangeDays('2026-12-05', '2026-12-01')).toEqual(['2026-12-05']);
    expect(rangeError('2026-12-05', '2026-12-01')).toBe(true);
    expect(rangeError('2026-12-05', '2026-12-05')).toBe(false);
  });

  it('merges picked days and range days without repeats, in date order', () => {
    expect(tripDates({ picked: ['2026-12-07', '2026-12-05'], from: '2026-12-05', to: '2026-12-06' })).toEqual(['2026-12-05', '2026-12-06', '2026-12-07']);
  });

  it('cleans what was saved, dropping anything that is not a date', () => {
    expect(cleanTrip({ picked: ['2026-12-05', 'soon', 7, '2026-13-45'], from: 'x', to: '2026-12-09' })).toEqual({ picked: ['2026-12-05'], from: '', to: '' });
    expect(cleanTrip(null)).toEqual({ picked: [], from: '', to: '' });
    expect(cleanTrip({ picked: [], from: '2026-12-05', to: '2026-12-01' }).to).toBe('');
  });
});

describe('classifying a day', () => {
  const f = forecast([day('2026-12-05', 71.4), closed('2026-12-06'), insufficient('2026-12-07')]);

  it('knows scored, closed, insufficient, beyond-range and missing days', () => {
    expect(classifyDay(f, '2026-12-05')).toMatchObject({ kind: 'scored', score: 71.4 });
    expect(classifyDay(f, '2026-12-06')).toEqual({ kind: 'closed' });
    expect(classifyDay(f, '2026-12-07')).toEqual({ kind: 'insufficient' });
    expect(classifyDay(f, '2026-12-20')).toEqual({ kind: 'notyet' });
    expect(classifyDay(f, '2026-12-01')).toEqual({ kind: 'insufficient' });
    expect(classifyDay(null, '2026-12-05')).toEqual({ kind: 'insufficient' });
  });
});

describe('summarising a mountain for a trip', () => {
  it('averages only scored days and names the strongest and weakest, earlier day winning a tie', () => {
    const s = summarize(forecast([day(DATES[0], 60), day(DATES[1], 80), day(DATES[2], 80), day(DATES[3], 60)]), DATES);
    expect(s).toMatchObject({ covered: 4, total: 4, closed: 0, average: 70 });
    expect(s.strongest.date).toBe(DATES[1]);
    expect(s.weakest.date).toBe(DATES[0]);
  });

  it('leaves closed and missing days out of coverage and the average', () => {
    const s = summarize(forecast([day(DATES[0], 90), closed(DATES[1]), insufficient(DATES[2]), day(DATES[3], 70)]), DATES);
    expect(s).toMatchObject({ covered: 2, total: 4, closed: 1, average: 80, allClosed: false });
    expect(s.weakest.date).toBe(DATES[3]);
  });

  it('flags a mountain closed on every picked day and gives it no averages', () => {
    const s = summarize(forecast(DATES.map(closed)), DATES);
    expect(s).toMatchObject({ allClosed: true, covered: 0, average: null, strongest: null, weakest: null, closed: 4 });
  });

  it('takes its confidence from its least confident scored day', () => {
    const s = summarize(forecast([day(DATES[0], 70, 'High'), day(DATES[1], 70, 'Low')]), DATES.slice(0, 2));
    expect(s).toMatchObject({ level: 'Low', margin: MARGIN.Low });
  });
});

describe('ranking mountains for a trip', () => {
  it('ranks coverage first: a mountain with missing days never beats one with more covered days', () => {
    const ranked = rankTrip([scores('gappy', [99, 99, null, null]), scores('full', [60, 60, 60, 60])], DATES);
    expect(order(ranked)).toEqual(['full', 'gappy']);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2]);
  });

  it('ranks by average when coverage is equal, and by list order when everything ties', () => {
    expect(order(rankTrip([scores('b', [50, 50, 50, 50]), scores('a', [80, 80, 80, 80])], DATES))).toEqual(['a', 'b']);
    expect(order(rankTrip([scores('first', [70, 70, 70, 70]), scores('second', [70, 70, 70, 70])], DATES))).toEqual(['first', 'second']);
  });

  it('does not let a closed day help or hurt: ranks on open days only', () => {
    const partlyClosed = entry('partly', [day(DATES[0], 80), closed(DATES[1]), day(DATES[2], 80), day(DATES[3], 80)]);
    const ranked = rankTrip([scores('open', [70, 70, 70, 70]), partlyClosed], DATES);
    expect(order(ranked)).toEqual(['open', 'partly']);
    expect(ranked[1]).toMatchObject({ covered: 3, closed: 1, average: 80 });
  });

  it('lists a mountain closed on all days last, after failed cards, numbering after the open ones', () => {
    const ranked = rankTrip([entry('shut', DATES.map(closed)), entry('failed', null), scores('open', [50, 50, 50, 50])], DATES);
    expect(order(ranked)).toEqual(['open', 'failed', 'shut']);
    expect(ranked.map((c) => c.rank)).toEqual([1, undefined, 2]);
  });

  it('keeps a mountain with no covered day below one that has some', () => {
    expect(order(rankTrip([scores('none', [null, null, null, null]), scores('some', [20, null, null, null])], DATES))).toEqual(['some', 'none']);
  });
});

describe('too close to call', () => {
  const card = (average, level, covered = 4) => ({ average, margin: MARGIN[level], covered });

  it('uses 5, 8 and 12 points for High, Medium and Low confidence', () => {
    expect(MARGIN).toEqual({ High: 5, Medium: 8, Low: 12 });
  });

  it('is close only when the gap is below the uncertainty, and the larger uncertainty of the pair applies', () => {
    expect(isCloseCall(card(70, 'High'), card(66, 'High'))).toBe(true);
    expect(isCloseCall(card(70, 'High'), card(65, 'High'))).toBe(false);
    expect(isCloseCall(card(70, 'High'), card(63, 'Low'))).toBe(true);
    expect(isCloseCall(card(70, 'Medium'), card(63, 'Medium'))).toBe(true);
    expect(isCloseCall(card(70, 'Medium'), card(62, 'Medium'))).toBe(false);
  });

  it('is never close when coverage differs, since coverage already decides', () => {
    expect(isCloseCall(card(70, 'Low', 4), card(69, 'Low', 3))).toBe(false);
  });

  it('marks the second card of a close pair with the first, and nothing for a clear gap', () => {
    const ranked = rankTrip([scores('a', [72, 72, 72, 72], 'High'), scores('b', [69, 69, 69, 69], 'High'), scores('c', [40, 40, 40, 40], 'High')], DATES);
    expect(ranked.map((c) => c.closeWith)).toEqual([undefined, 'a', undefined]);
  });

  it('is wider for a pinned mountain whose forecast is always Low confidence', () => {
    const ranked = rankTrip([scores('pin', [70, 70, 70, 70], 'Low'), scores('other', [60, 60, 60, 60], 'High')], DATES);
    expect(ranked[1].closeWith).toBe('pin');
  });
});

describe('days beyond the forecast', () => {
  const days = ['2026-12-05', '2026-12-06', '2026-12-07'].map((d) => day(d, 60));

  it('finds days past the last forecast day and when each comes into range', () => {
    const late = notYet(['2026-12-06', '2026-12-09', '2026-12-10'], [forecast(days)]);
    expect(late).toEqual({ dates: ['2026-12-09', '2026-12-10'], span: 2 });
    expect(entersRangeOn('2026-12-09', late.span)).toBe('2026-12-07');
  });

  it('reports nothing before any forecast has loaded, and uses the widest forecast', () => {
    expect(notYet(['2026-12-09'], [null])).toEqual({ dates: [], span: 0 });
    const wide = forecast(['2026-12-05', '2026-12-09'].map((d) => day(d, 50)));
    expect(notYet(['2026-12-09', '2026-12-10'], [forecast(days), wide]).dates).toEqual(['2026-12-10']);
  });

  it('never ranks a not-yet day for or against a mountain', () => {
    const s = summarize(forecast(days), ['2026-12-06', '2026-12-20']);
    expect(s).toMatchObject({ covered: 1, total: 2, average: 60 });
    expect(s.days[1].kind).toBe('notyet');
  });
});
