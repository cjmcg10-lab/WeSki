import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseMtnpowder, publishedHours, resortStatus, assumedStatus } from '../worker/resort-status.js';
import { MTNPOWDER_IDS } from '../worker/resort-status-feeds.js';
import { loadResortStatus, statusToScoreOpts } from '../src/forecast/status.js';
import { scoreForecast, ALL_CODES } from '../src/forecast/score/index.js';
import { groomSurface } from '../src/forecast/score/components.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/forecast/${name}.json`, import.meta.url), 'utf8'));
const RESORT = { id: 'palisades-tahoe', lat: 44.5, lon: -72.8, baseLat: 44.45, baseLon: -72.7, top: 1116, base: 399, tz: 'America/Los_Angeles' };
const NOW = Date.parse('2026-11-22T17:30:00Z');
const palisades = () => normaliseMtnpowder('palisades-tahoe', fixture('status-mtnpowder-palisades'), NOW);
const stratton = () => normaliseMtnpowder('stratton', fixture('status-mtnpowder-stratton'), NOW);
const dayZero = (name) => scoreForecast(RESORT, fixture(name)).days[0].date;

describe('feed normaliser (recorded mtnpowder.com responses)', () => {
  it('reads published hours, season, lift holds and grooming from an operating resort', () => {
    const s = palisades();
    expect(s).toMatchObject({ id: 'palisades-tahoe', source: 'mtnpowder', assumed: false, hours: { from: 9, to: 16 }, season: { state: 'open' }, closures: {} });
    expect(s.fetchedAt).toBe('2026-11-22T17:30:00.000Z');
    expect(s.liftHolds).toEqual([
      { lift: 'Summit Express', status: 'delayed', date: '2026-11-22', at: '2026-11-21T16:14' },
      { lift: 'Treeline Cirque', status: 'partial', date: '2026-11-22', at: '2026-11-20T16:07' },
    ]);
    expect(s.grooming.map((g) => g.at)).toEqual(['2026-11-21T10:23', '2026-11-21T10:24']);
  });

  it('does not call a resort closed when its lifts are running, even if the headline status says Closed', () => {
    expect(fixture('status-mtnpowder-palisades').OperatingStatus).toBe('Closed');
    expect(palisades().closures).toEqual({});
  });

  it('turns a resort that reports closed with no lift running into a confirmed closure for that date only', () => {
    const s = stratton();
    expect(s.season).toMatchObject({ state: 'not_open' });
    expect(s.closures).toEqual({ '2026-11-22': { code: 'closed.ops_report', params: ['Stratton'], source: 'mtnpowder' } });
    expect(s.hours).toEqual({ from: 9, to: 16 });
  });

  it('records closed-for-season as a season state and never as a closure', () => {
    const s = normaliseMtnpowder('blue', fixture('status-mtnpowder-blue'), NOW);
    expect(s.season.state).toBe('closed_for_season');
    expect(s.closures).toEqual({});
  });

  it('falls back to the labelled assumed status when the feed is stale or malformed', () => {
    const feed = fixture('status-mtnpowder-palisades');
    const stale = normaliseMtnpowder('palisades-tahoe', feed, Date.parse('2026-11-25T00:00:00Z'));
    expect(stale).toEqual(assumedStatus('palisades-tahoe'));
    expect(normaliseMtnpowder('x', { LastUpdate: 'soon' }, NOW).assumed).toBe(true);
    expect(normaliseMtnpowder('x', null, NOW).assumed).toBe(true);
  });

  it('takes the most common lift schedule and keeps only whole hours inside it', () => {
    const day = (Open, Close) => ({ Monday: { Open, Close }, Tuesday: { Open, Close }, Wednesday: { Open, Close } });
    expect(publishedHours([{ Hours: day('8:30 AM', '4:30 PM') }, { Hours: day('9:00 AM', '3:00 PM') }, { Hours: day('8:30 AM', '4:30 PM') }])).toEqual({ from: 9, to: 16 });
    expect(publishedHours([{ Hours: day('', '') }, { Hours: '--' }])).toBeNull();
    expect(publishedHours([{ Hours: day('9:00 AM', '9:30 AM') }])).toBeNull();
  });

  it('maps every mapped resort id to a number', () => {
    expect(Object.keys(MTNPOWDER_IDS)).toHaveLength(10);
    for (const n of Object.values(MTNPOWDER_IDS)) expect(Number.isInteger(n)).toBe(true);
  });
});

describe('server entry', () => {
  const feed = fixture('status-mtnpowder-palisades');
  it('answers with the assumed status until the source is switched live, and for unmapped resorts', async () => {
    expect(await resortStatus('palisades-tahoe', { fetchFeed: () => { throw new Error('must not fetch'); } })).toEqual(assumedStatus('palisades-tahoe'));
    expect((await resortStatus('stowe', { live: ['mtnpowder'], fetchFeed: () => { throw new Error('must not fetch'); } })).assumed).toBe(true);
  });

  it('fetches the mapped feed number and normalises it when live', async () => {
    const seen = [];
    const s = await resortStatus('palisades-tahoe', { live: ['mtnpowder'], now: NOW, fetchFeed: async (n) => (seen.push(n), feed) });
    expect(seen).toEqual([61]);
    expect(s.hours).toEqual({ from: 9, to: 16 });
  });

  it('lets a failed feed fetch reach the route, which answers 502', async () => {
    await expect(resortStatus('palisades-tahoe', { live: ['mtnpowder'], fetchFeed: async () => { throw new Error('resort feed 500'); } })).rejects.toThrow('resort feed 500');
  });
});

describe('phone side', () => {
  const respond = (body, ok = true) => async () => ({ ok, json: async () => body });
  it('returns the server status when it is well formed', async () => {
    const s = palisades();
    expect(await loadResortStatus({ id: 'palisades-tahoe' }, respond(s))).toEqual(s);
  });

  it('returns a labelled assumed status offline, on an error status, and on a bad body', async () => {
    const assumed = assumedStatus('palisades-tahoe');
    expect(await loadResortStatus({ id: 'palisades-tahoe' }, async () => { throw new TypeError('offline'); })).toEqual(assumed);
    expect(await loadResortStatus({ id: 'palisades-tahoe' }, respond({}, false))).toEqual(assumed);
    expect(await loadResortStatus({ id: 'palisades-tahoe' }, respond({ nope: 1 }))).toEqual(assumed);
    expect((await loadResortStatus({ id: '../x' }, respond(palisades()))).assumed).toBe(true);
  });

  it('gives the engine options, and leaves the assumed window in place when no hours are published', () => {
    expect(statusToScoreOpts(palisades())).toMatchObject({ hours: { from: 9, to: 16 }, liftHolds: expect.any(Array), closures: {}, season: { state: 'open' } });
    const none = statusToScoreOpts(assumedStatus('x'));
    expect(none.hours).toBeUndefined();
    const out = scoreForecast(RESORT, fixture('scenario-clear-groomer'), none);
    expect(out.hours.assumed).toBe(true);
    expect(out.days[0].flags).toContain('assumed_hours');
  });
});

describe('engine with resort status', () => {
  const run = (name, opts) => scoreForecast(RESORT, fixture(name), opts);

  it('shows Closed only for the confirmed closure date and keeps the other days scored', () => {
    const date = dayZero('real-stowe-2026-11-22');
    const out = run('real-stowe-2026-11-22', statusToScoreOpts({ ...stratton(), closures: { [date]: stratton().closures['2026-11-22'] } }));
    expect(out.days[0]).toMatchObject({ status: 'closed', score: null, closureSource: { code: 'closed.ops_report', source: 'mtnpowder' } });
    expect(out.days.slice(1).every((d) => d.status === 'ok')).toBe(true);
  });

  it('scores a short operating day inside its hours, and calls a window under three hours Insufficient', () => {
    const short = run('scenario-clear-groomer', { hours: { from: 10, to: 14 } }).days[0];
    expect(short).toMatchObject({ status: 'ok', skiHours: { from: 10, to: 14, expected: 4, withData: 4, assumed: false } });
    expect(short.window.start).toBeGreaterThanOrEqual(10);
    expect(short.window.end).toBeLessThanOrEqual(14);
    const tiny = run('scenario-clear-groomer', { hours: { from: 9, to: 11 } }).days[0];
    expect(tiny.status).toBe('insufficient');
  });

  it('keeps a confirmed lift hold apart from the predicted wind impact', () => {
    const date = dayZero('scenario-wind-hold-afternoon');
    const plain = run('scenario-wind-hold-afternoon').days[0];
    const held = run('scenario-wind-hold-afternoon', { liftHolds: [{ lift: 'Summit Express', status: 'delayed', date }, { lift: 'Other', status: 'partial', date: '2000-01-01' }] }).days[0];
    expect(held.liftHolds).toEqual([{ lift: 'Summit Express', status: 'delayed', from: null, to: null }]);
    expect(held.notes).toEqual([{ code: 'EX_LIFT_HOLD_CONFIRMED', params: [1] }]);
    expect(held.flags).toContain('lift_hold_confirmed');
    expect(plain.notes).toEqual([]);
    expect(plain.liftHolds).toEqual([]);
    expect(held.score).toBe(plain.score);
    expect(held.hours.map((h) => h.components.wind)).toEqual(plain.hours.map((h) => h.components.wind));
    expect(held.explain).toEqual(plain.explain);
    expect(held.explain.code).toBe('EX_SUMMIT_WIND');
    expect(held.factors.map((f) => f.code)).toEqual(plain.factors.map((f) => f.code));
  });

  it('puts out-of-season days under a note and never marks them closed', () => {
    const closedSeason = run('real-stowe-2026-11-22', { season: { open: null, close: null, state: 'closed_for_season' } });
    for (const d of closedSeason.days) {
      expect(d.status).toBe('ok');
      expect(d.notes).toEqual([{ code: 'NT_OUT_OF_SEASON', params: [] }]);
    }
    const dates = closedSeason.days.map((d) => d.date);
    const opening = run('real-stowe-2026-11-22', { season: { open: dates[3], close: null, state: 'open' } });
    expect(opening.days.map((d) => d.notes.length)).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(opening.days.every((d) => d.status === 'ok')).toBe(true);
    const ending = run('real-stowe-2026-11-22', { season: { open: null, close: dates[5], state: 'open' } });
    expect(ending.days.map((d) => d.notes.length)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it('applies a grooming report as a hook on the snow surface and flags the day', () => {
    expect(groomSurface({ fresh: 2, crust: 0.8, wet: 0.5 })).toEqual({ fresh: 2, crust: 0.2, wet: 0.35 });
    const date = dayZero('scenario-freeze-thaw');
    const plain = run('scenario-freeze-thaw').days[0];
    const groomed = run('scenario-freeze-thaw', { grooming: [{ trail: 'Main', at: `${date}T09:15` }] }).days[0];
    expect(groomed.flags).toContain('grooming_reported');
    expect(plain.flags).not.toContain('grooming_reported');
    expect(groomed.hours[10].components.surface).toBeGreaterThan(plain.hours[10].components.surface);
    expect(groomed.hours[8].components.surface).toBe(plain.hours[8].components.surface);
    const yesterday = run('scenario-freeze-thaw', { grooming: [{ trail: 'Main', at: '2000-01-01T11:20' }] }).days[0];
    expect(yesterday.score).toBe(plain.score);
  });

  it('lists the new codes in the published list', () => {
    for (const code of ['EX_LIFT_HOLD_CONFIRMED', 'NT_OUT_OF_SEASON']) expect(ALL_CODES).toContain(code);
  });
});
