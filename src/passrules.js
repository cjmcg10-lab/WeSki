// What a phone without a SkiWithMe Pass may see (owner's decision, 2026-11-23; see docs/PAID_TIER.md).
// Pure rules, no page or storage access, so they can be unit tested (tests/passrules.test.js).
// `pass` is acct.hasPass(): true while PAYWALL is off, false with "Simulate free tier" on.

/** The free taste of the Forecast: this many days (today and tomorrow) for one mountain. */
export const FREE_FORECAST_DAYS = 2;

/** Local calendar date (YYYY-MM-DD) of a time on this phone. */
export const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Forecast access. With a pass: everything. Without: one mountain (the one you are at, else the first on your list),
 * its first FREE_FORECAST_DAYS days, no calendar of several mountains, no trip planner.
 */
export function forecastAccess(pass) {
  return pass
    ? { full: true, days: Infinity, mountains: Infinity, trip: true, calendar: true }
    : { full: false, days: FREE_FORECAST_DAYS, mountains: 1, trip: false, calendar: false };
}

/**
 * Does this Forecast button need a pass? shown: mountains in the Forecast now (your list plus the one you are at);
 * listed: mountains on your list. Without a pass: no trip planner, no sorting by day, no second mountain.
 */
export function forecastActionPaid(act, pass, { shown = 0, listed = 0 } = {}) {
  const can = forecastAccess(pass);
  if (can.full) return false;
  if (act === 'fc-upsell') return true;
  if (act === 'fc-trip' && !can.trip) return true;
  if ((act === 'fc-sort' || act === 'fc-unsort') && !can.calendar) return true;
  if ((act === 'fc-add' || act === 'fc-doadd') && shown >= can.mountains) return true;
  if (act === 'fc-keep' && listed >= can.mountains) return true;
  return false;
}

/** The one mountain a free taste shows: the one you are at, else the first on your list (or null). */
export function tasteResort(here, list) {
  return here || list?.[0] || null;
}

/** The dates a free taste shows: the first FREE_FORECAST_DAYS of the forecast's days from today on. */
export function tasteDates(dates, today) {
  const from = today ? dates.filter((d) => d >= today) : dates;
  return from.slice(0, FREE_FORECAST_DAYS);
}

/** May this day of the forecast be opened? */
export function forecastDayOpen(pass, dates, date, today) {
  return pass || tasteDates(dates, today).includes(date);
}

/**
 * Saved ski days. Tracking and saving are free and every day is kept. Without a pass only days from today are open;
 * earlier days are listed locked (date and mountain only). With a pass every day opens, including the ones recorded
 * before the pass was bought: nothing on the phone depends on when it was bought.
 * Returns {open, locked} in the order given.
 */
export function historyView(days, pass, now = Date.now()) {
  if (pass) return { open: days.slice(), locked: [] };
  const today = localDay(now);
  const open = [], locked = [];
  for (const s of days) (localDay(s.start) >= today ? open : locked).push(s);
  return { open, locked };
}

/** May this saved day be opened (its stats, runs and replay)? */
export const dayOpen = (s, pass, now = Date.now()) => pass || localDay(s.start) >= localDay(now);

// ---------- offline maps

/** "Download for offline" (the whole mountain ahead of time) is part of the pass. */
export const canDownload = (pass) => !!pass;

/**
 * The files of one mountain, for a download ahead of time. `required` must all arrive; `optional` may be missing
 * (older maps have no canopy; graph.json only with a pass, and the server answers 402 without one).
 */
export function mountainFiles(id, { z16 = true, pass = false, graphInline = false } = {}) {
  const heights = z16 ? ['terrain.z16', 'surround.z16'] : ['terrain.bin', 'surround.bin'];
  const at = (f) => `/data/${id}/${f}`;
  return {
    required: ['resort.json', heights[0]].map(at),
    optional: [heights[1], 'canopy.z8', 'landcover.z8', ...(pass && !graphInline ? ['graph.json'] : [])].map(at),
  };
}

/** The mountain a cached map file belongs to (or null for app files and the Forecast catalog). */
export const mountainOfPath = (path) => /^\/data\/([^/]+)\/[^/]+$/.exec(path)?.[1] ?? null;

/**
 * Which mountains' saved map files to remove from the phone. The map you open stays on the phone for that day,
 * free. Without a pass, a map opened on an earlier day is removed (it downloads again next time it is opened online).
 * With a pass nothing is removed: downloads and opened maps stay. `keep` (the mountain open now) always stays.
 * Never decided on a guess: the caller passes `known: false` when the server's answer about the pass is not in.
 */
export function staleMountains({ cached, opened = {}, today, pass, keep = [], known = true }) {
  if (pass || !known) return [];
  return [...new Set(cached)].filter((id) => !keep.includes(id) && opened[id] !== today);
}

/**
 * What the Plans list offers to this account (owner, 2026-11-24). me: /api/me's answer. Returns
 * {action: {plan: 'buy' | 'have' | 'upgrade' | 'none'}, yearly: {plan, until} | null, shortUntil}:
 * - while a yearly pass is on (own Season or Crew, a crew seat, the owner pass) Day and Week are not sold;
 * - the Season Pass you have shows as yours; with a website Season Pass the Crew Pass is an upgrade
 *   (Paddle charges only the difference); one bought in the iPhone app is upgraded through Apple, so inside the
 *   app (inApp) it is the Apple Season Pass that shows Upgrade and a website one shows none;
 * - while a Day or Week Pass runs, shortUntil is when the last one bought ends: a new one starts then.
 */
export function planChoices(me, now = Date.now(), inApp = false) {
  const own = (me?.purchases || []).filter((p) => (p.starts ?? 0) <= now && p.ends > now);
  const ownCrew = own.find((p) => p.plan === 'crew'), ownSeason = own.find((p) => p.plan === 'season');
  const pass = me?.pass || {};
  const action = { day: 'buy', week: 'buy', season: 'buy', crew: 'buy' };
  let yearly = null;
  if (pass.comp) {
    for (const k of Object.keys(action)) action[k] = 'none';
    yearly = { plan: 'comp', until: pass.until };
  } else if (ownCrew) {
    Object.assign(action, { day: 'none', week: 'none', season: 'none', crew: 'have' });
    yearly = { plan: 'crew', until: ownCrew.ends };
  } else if (ownSeason) {
    Object.assign(action, { day: 'none', week: 'none', season: 'have', crew: ownSeason.store === (inApp ? 'apple' : 'paddle') ? 'upgrade' : 'none' });
    yearly = { plan: 'season', until: ownSeason.ends };
  } else if (pass.active && pass.member) {
    Object.assign(action, { day: 'none', week: 'none' });
    yearly = { plan: 'crew', until: pass.until, member: true };
  }
  const short = (me?.purchases || []).filter((p) => !p.renews && p.ends > now);
  const shortUntil = !yearly && short.length ? Math.max(...short.map((p) => p.ends)) : 0;
  return { action, yearly, shortUntil };
}
