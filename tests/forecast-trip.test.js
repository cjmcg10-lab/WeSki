import { describe, it, expect } from 'vitest';
import {
  MARGIN, MAX_RANGE_DAYS, daysBetween, shiftDate, classifyDay, clearRange, cleanTrip, entersRangeOn, isCloseCall, notYet, rangeDays, rangeError, rankTrip, sharedDays, summarize, toggleDate, tripDates,
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
    expect(cleanTrip({ picked: ['2026-12-05', 'soon', 7, '2026-13-45'], from: 'x', to: '2026-12-09' })).toEqual({ picked: ['2026-12-05'], from: '', to: '', skip: [] });
    expect(cleanTrip(null)).toEqual({ picked: [], from: '', to: '', skip: [] });
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
    expect(classifyDay(f, '2026-12-01')).toEqual({ kind: 'past' });
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

  it('gives every scored day in the list its rounded number, which the trip cards print', () => {
    const s = summarize(forecast([day(DATES[0], 60.4), closed(DATES[1])]), DATES.slice(0, 2));
    expect(s.days[0]).toMatchObject({ kind: 'scored', shown: 60 });
    expect(s.days[1].shown).toBeUndefined();
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
    expect(s).toMatchObject({ covered: 1, total: 1, later: 1, average: 60 });
    expect(s.days[1].kind).toBe('notyet');
  });
});

describe('unpicking a day inside the range', () => {
  const base = { picked: [], from: '2026-12-05', to: '2026-12-08', skip: [] };

  it('lets a tap remove a range day and a second tap bring it back', () => {
    const off = toggleDate(base, '2026-12-06');
    expect(tripDates(off)).toEqual(['2026-12-05', '2026-12-07', '2026-12-08']);
    expect(tripDates(toggleDate(off, '2026-12-06'))).toEqual(tripDates(base));
  });

  it('removes a day that is both picked and in the range', () => {
    const both = { ...base, picked: ['2026-12-06'] };
    expect(tripDates(toggleDate(both, '2026-12-06'))).not.toContain('2026-12-06');
  });

  it('clearing the range drops its exclusions but keeps hand picks', () => {
    const state = toggleDate(toggleDate(base, '2026-12-06'), '2026-12-20');
    const cleared = clearRange(state);
    expect(cleared).toMatchObject({ from: '', to: '', skip: [], picked: ['2026-12-20'] });
    expect(tripDates(cleared)).toEqual(['2026-12-20']);
  });

  it('forgets exclusions that fall outside the range and dates before today', () => {
    expect(cleanTrip({ ...base, skip: ['2026-12-06', '2027-01-01'] }).skip).toEqual(['2026-12-06']);
    expect(cleanTrip({ picked: ['2026-11-01', '2026-12-05'] }, '2026-11-22').picked).toEqual(['2026-12-05']);
    expect(cleanTrip({ picked: [], from: '2026-11-01', to: '2026-11-05' }, '2026-11-22').from).toBe('');
  });
});

describe('scores that are not numbers', () => {
  it('treats NaN and Infinity as missing, never as a covered day', () => {
    const f = forecast([day(DATES[0], NaN), day(DATES[1], Infinity), day(DATES[2], 60)]);
    expect(classifyDay(f, DATES[0])).toEqual({ kind: 'insufficient' });
    expect(classifyDay(f, DATES[1])).toEqual({ kind: 'insufficient' });
    expect(summarize(f, DATES.slice(0, 3))).toMatchObject({ covered: 1, average: 60 });
  });
});

describe('mixed time zones', () => {
  it('counts a day after one mountain window as not yet, not as missing', () => {
    const short = forecast([day(DATES[0], 70), day(DATES[1], 70), day(DATES[2], 70)]);
    const s = summarize(short, DATES);
    expect(s).toMatchObject({ covered: 3, total: 3, later: 1, allClosed: false });
    expect(s.days[3].kind).toBe('notyet');
  });

  it('judges not-yet days per mountain and clamps the arrival date to today', () => {
    const narrow = forecast([day(DATES[0], 70), day(DATES[1], 70)]);
    const wide = forecast(DATES.map((d) => day(d, 70)));
    expect(notYet([DATES[2]], [narrow]).dates).toEqual([DATES[2]]);
    expect(notYet([DATES[2]], [wide]).dates).toEqual([]);
    expect(entersRangeOn('2026-12-09', 30, '2026-11-22')).toBe('2026-11-22');
    expect(entersRangeOn('2026-12-09', 2, '2026-11-22')).toBe('2026-12-07');
  });
});

describe('staggered forecast windows', () => {
  const window = (from, to, score) => forecast(Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => day(shiftDate(from, i), score)));
  const picked = Array.from({ length: 7 }, (_, i) => shiftDate('2026-12-06', i));
  const us = { resort: resort('us'), forecast: window('2026-12-05', '2026-12-11', 80), entry: { state: 'ok' } };
  const japan = { resort: resort('japan'), forecast: window('2026-12-06', '2026-12-12', 60), entry: { state: 'ok' } };

  it('marks days before a mountain window as past, and counts only days inside it', () => {
    const jp = summarize(japan.forecast, ['2026-12-05', '2026-12-06']);
    expect(jp.days[0].kind).toBe('past');
    expect(jp).toMatchObject({ covered: 1, total: 1, later: 1 });
  });

  it('ranks on the days every mountain forecasts, not on raw counts', () => {
    const ranked = rankTrip([japan, us], picked);
    expect(order(ranked)).toEqual(['us', 'japan']);
    expect(ranked[0].ranked.covered).toBe(6);
    expect(ranked[1].ranked.covered).toBe(6);
    expect(ranked[0].covered).toBe(6);
    expect(ranked[1].covered).toBe(7);
    expect(ranked[1].closeWith).toBeUndefined();
  });

  it('counts the shared days, and gives no ranks when there are none', () => {
    expect(sharedDays([japan, us], picked)).toHaveLength(6);
    const apart = { resort: resort('far'), forecast: window('2026-12-20', '2026-12-22', 50), entry: { state: 'ok' } };
    const ranked = rankTrip([us, apart], picked);
    expect(sharedDays([us, apart], picked)).toEqual([]);
    expect(ranked.map((c) => c.rank)).toEqual([undefined, undefined]);
    expect(order(ranked)).toEqual(['us', 'far']);
  });

  it('keeps the unshared days on the card but out of the average used for ranking', () => {
    const odd = { resort: resort('odd'), forecast: forecast([...window('2026-12-06', '2026-12-11', 70).scored.days, day('2026-12-12', 100)]), entry: { state: 'ok' } };
    const ranked = rankTrip([odd, us], picked);
    expect(ranked.find((c) => c.resort.id === 'odd').average).toBeGreaterThan(70);
    expect(ranked.find((c) => c.resort.id === 'odd').ranked.average).toBe(70);
  });
});

describe('a saved range that started in the past', () => {
  it('moves its start up to today instead of losing it', () => {
    expect(cleanTrip({ picked: [], from: '2026-11-21', to: '2026-11-25' }, '2026-11-22')).toMatchObject({ from: '2026-11-22', to: '2026-11-25' });
    expect(cleanTrip({ picked: [], from: '2026-11-18', to: '2026-11-20' }, '2026-11-22')).toMatchObject({ from: '', to: '' });
  });
});