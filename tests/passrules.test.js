import { describe, it, expect, beforeEach } from 'vitest';
import {
  FREE_FORECAST_DAYS, localDay, forecastAccess, forecastActionPaid, tasteResort, tasteDates, forecastDayOpen,
  historyView, dayOpen, canDownload, mountainFiles, mountainOfPath, staleMountains, planChoices,
} from '../src/passrules.js';
import * as acct from '../src/account.js';

const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2027, 2, 14, 15);

describe('the pass on this phone (src/account.js)', () => {
  beforeEach(() => acct.setSimFree(false));
  it('everything is open while the paywall is off, and "Simulate free tier" closes it', () => {
    expect(acct.config().paywall).toBe(false);
    expect(acct.hasPass()).toBe(true);
    acct.setSimFree(true);
    expect(acct.hasPass()).toBe(false);
    expect(acct.simulatingFree()).toBe(true);
  });
  it('never treats a simulation or a missing server answer as sure (nothing is deleted on a guess)', () => {
    expect(acct.passKnown()).toBe(false);          // no answer from /api/config yet
    acct.setSimFree(true);
    expect(acct.passKnown()).toBe(false);
  });
});

describe('Forecast: free taste and paid parts', () => {
  it('a pass opens everything; without one, one mountain and two days', () => {
    expect(forecastAccess(true)).toMatchObject({ full: true, trip: true, calendar: true });
    expect(forecastAccess(false)).toMatchObject({ full: false, days: 2, mountains: 1, trip: false, calendar: false });
    expect(FREE_FORECAST_DAYS).toBe(2);
  });
  it('the taste shows the mountain you are at, else the first on your list', () => {
    const a = { id: 'a' }, b = { id: 'b' };
    expect(tasteResort(b, [a])).toBe(b);
    expect(tasteResort(null, [a, b])).toBe(a);
    expect(tasteResort(null, [])).toBe(null);
  });
  it('the taste covers today and tomorrow only', () => {
    const dates = ['2027-02-13', '2027-02-14', '2027-02-15', '2027-02-16', '2027-02-17'];
    expect(tasteDates(dates, '2027-02-14')).toEqual(['2027-02-14', '2027-02-15']);
    expect(forecastDayOpen(false, dates, '2027-02-15', '2027-02-14')).toBe(true);
    expect(forecastDayOpen(false, dates, '2027-02-16', '2027-02-14')).toBe(false);
    expect(forecastDayOpen(true, dates, '2027-02-17', '2027-02-14')).toBe(true);
  });
  it('trip planner, sorting and a second mountain need a pass; the first mountain does not', () => {
    for (const act of ['fc-trip', 'fc-sort', 'fc-upsell']) expect(forecastActionPaid(act, false, { shown: 1, listed: 1 }), act).toBe(true);
    expect(forecastActionPaid('fc-add', false, { shown: 0, listed: 0 })).toBe(false);
    expect(forecastActionPaid('fc-add', false, { shown: 1, listed: 1 })).toBe(true);
    expect(forecastActionPaid('fc-doadd', false, { shown: 1, listed: 0 })).toBe(true);   // the mountain you are at counts
    expect(forecastActionPaid('fc-keep', false, { shown: 1, listed: 0 })).toBe(false);   // keeping it as the first is free
    expect(forecastActionPaid('fc-day', false, { shown: 1, listed: 1 })).toBe(false);
    expect(forecastActionPaid('fc-refresh', false, { shown: 1, listed: 1 })).toBe(false);
    for (const act of ['fc-trip', 'fc-sort', 'fc-add', 'fc-keep']) expect(forecastActionPaid(act, true, { shown: 5, listed: 5 }), act).toBe(false);
  });
});

describe('saved days: locked without a pass, all open with one', () => {
  const days = [
    { id: 'today', start: at(2027, 2, 14, 9) },
    { id: 'yesterday', start: at(2027, 2, 13, 9) },
    { id: 'december', start: at(2026, 12, 20, 9) },
  ];
  it('without a pass, days before today are locked and kept, none dropped', () => {
    const v = historyView(days, false, NOW);
    expect(v.open.map((s) => s.id)).toEqual(['today']);
    expect(v.locked.map((s) => s.id)).toEqual(['yesterday', 'december']);
    expect(v.open.length + v.locked.length).toBe(days.length);
    expect(dayOpen(days[1], false, NOW)).toBe(false);
  });
  it('a pass opens every day, including days recorded before it was bought', () => {
    const boughtAt = at(2027, 2, 14, 12);                         // bought today at noon
    const before = days.filter((s) => s.start < boughtAt);
    expect(before.length).toBe(3);
    const v = historyView(days, true, NOW);
    expect(v.open.map((s) => s.id)).toEqual(['today', 'yesterday', 'december']);
    expect(v.locked).toEqual([]);
    for (const s of days) expect(dayOpen(s, true, NOW)).toBe(true);
  });
  it('"Simulate free tier" locks them like no pass, and turning it off opens them again', () => {
    acct.setSimFree(true);
    expect(historyView(days, acct.hasPass(), NOW).locked.length).toBe(2);
    acct.setSimFree(false);
    expect(historyView(days, acct.hasPass(), NOW).locked.length).toBe(0);
  });
  it('uses the phone’s own calendar day', () => {
    expect(localDay(at(2027, 2, 14, 0))).toBe('2027-02-14');
    expect(localDay(at(2027, 2, 14, 23))).toBe('2027-02-14');
  });
});

describe('offline maps', () => {
  it('"Download for offline" needs a pass', () => {
    expect(canDownload(true)).toBe(true);
    expect(canDownload(false)).toBe(false);
  });
  it('downloads the whole mountain; directions data only with a pass', () => {
    const free = mountainFiles('stowe', { pass: false });
    expect(free.required).toEqual(['/data/stowe/resort.json', '/data/stowe/terrain.z16']);
    expect(free.optional).toEqual(['/data/stowe/surround.z16', '/data/stowe/canopy.z8', '/data/stowe/landcover.z8']);
    expect(mountainFiles('stowe', { pass: true }).optional).toContain('/data/stowe/graph.json');
    expect(mountainFiles('stowe', { pass: true, graphInline: true }).optional).not.toContain('/data/stowe/graph.json');
    expect(mountainFiles('stowe', { z16: false }).required).toContain('/data/stowe/terrain.bin');
  });
  it('knows which cached files belong to a mountain', () => {
    expect(mountainOfPath('/data/stowe/terrain.z16')).toBe('stowe');
    expect(mountainOfPath('/data/index.json')).toBe(null);
    expect(mountainOfPath('/forecast/catalog-index.json')).toBe(null);
    expect(mountainOfPath('/assets/index.js')).toBe(null);
  });
  it('without a pass, keeps today’s map and removes earlier days’ maps', () => {
    const r = staleMountains({ cached: ['stowe', 'vail', 'jay-peak'], opened: { stowe: '2027-02-14', vail: '2027-02-13' }, today: '2027-02-14', pass: false });
    expect(r).toEqual(['vail', 'jay-peak']);
  });
  it('never removes the mountain open now, anything with a pass, or anything without a sure answer', () => {
    const base = { cached: ['stowe', 'vail'], opened: {}, today: '2027-02-14' };
    expect(staleMountains({ ...base, pass: false, keep: ['vail'] })).toEqual(['stowe']);
    expect(staleMountains({ ...base, pass: true })).toEqual([]);
    expect(staleMountains({ ...base, pass: false, known: false })).toEqual([]);
  });
});

describe('what the Plans list offers (owner, 2026-11-24)', () => {
  const now = Date.UTC(2026, 11, 1);
  const D = 864e5;
  const buy = (plan, starts, ends, store = 'paddle') => ({ plan, starts, ends, renews: plan === 'season' || plan === 'crew', store });
  const choices = (purchases, pass = { active: true }) => planChoices({ signedIn: true, pass, purchases }, now);

  it('signed out or no pass: everything can be bought', () => {
    expect(planChoices(null, now).action).toEqual({ day: 'buy', week: 'buy', season: 'buy', crew: 'buy' });
    expect(choices([], { active: false }).yearly).toBeNull();
  });

  it('a website Season Pass hides Day and Week and offers Crew as an upgrade', () => {
    const c = choices([buy('season', now - D, now + 200 * D)]);
    expect(c.action).toEqual({ day: 'none', week: 'none', season: 'have', crew: 'upgrade' });
    expect(c.yearly).toMatchObject({ plan: 'season', until: now + 200 * D });
  });

  it('a Season Pass from the iPhone app is upgraded in the app, not here', () => {
    expect(choices([buy('season', now - D, now + 200 * D, 'apple')]).action.crew).toBe('none');
  });

  it('inside the iPhone app it is the other way round: Apple Season upgrades, website Season does not', () => {
    const inApp = (p) => planChoices({ signedIn: true, pass: { active: true }, purchases: [p] }, now, true).action.crew;
    expect(inApp(buy('season', now - D, now + 200 * D, 'apple'))).toBe('upgrade');
    expect(inApp(buy('season', now - D, now + 200 * D, 'paddle'))).toBe('none');
  });

  it('a Crew Pass, a crew seat or the owner pass hide Day and Week', () => {
    expect(choices([buy('crew', now - D, now + 9 * D)]).action).toEqual({ day: 'none', week: 'none', season: 'none', crew: 'have' });
    expect(choices([], { active: true, member: true, plan: 'crew', until: now + D }).action).toMatchObject({ day: 'none', week: 'none', season: 'buy' });
    expect(Object.values(choices([], { active: true, comp: true }).action).every((a) => a === 'none')).toBe(true);
  });

  it('while a Week Pass runs, says when a new one would start', () => {
    const c = choices([buy('week', now - D, now + 6 * D), buy('day', now + 6 * D, now + 7 * D)]);
    expect(c.action.week).toBe('buy');
    expect(c.shortUntil).toBe(now + 7 * D);
    expect(choices([buy('week', now - 9 * D, now - 2 * D)], { active: false }).shortUntil).toBe(0);
  });

  it('an expired Season Pass offers everything again', () => {
    expect(choices([buy('season', now - 400 * D, now - D)], { active: false }).action.day).toBe('buy');
  });
});
