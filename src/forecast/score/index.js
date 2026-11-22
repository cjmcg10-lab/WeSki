import { ASSUMED_HOURS, daysBetween, scoreDay } from './day.js';
import { scoreHours } from './hour.js';
import { SCORING_VERSION } from './version.js';

export { SCORING_VERSION } from './version.js';
export { roundHalfUp, ASSUMED_HOURS, DAY_WEIGHTS, WINDOW_HOURS, MIN_HOURS_WITH_DATA } from './day.js';
export { WEIGHTS } from './components.js';
export { ALL_CODES, CODES } from './codes.js';

export function scoreForecast(resort, weather, opts = {}) {
  const window = opts.hours ? { from: opts.hours.from, to: opts.hours.to, assumed: false } : { ...ASSUMED_HOURS, assumed: true };
  const groomedAt = new Set((opts.grooming ?? []).map((g) => `${g.at.slice(0, 13)}:00`));
  const { rows, sites } = scoreHours(resort, weather ?? {}, groomedAt);
  const dates = [...new Set(rows.map((r) => r.date))];
  const today = opts.today ?? dates[0];
  const closures = opts.closures ?? {};
  const days = dates.map((date) =>
    scoreDay({
      date,
      rows: rows.filter((r) => r.date === date),
      window,
      single: sites.mode === 'single',
      closure: closures[date],
      daysAhead: daysBetween(today, date),
      ageHours: opts.ageHours,
      season: opts.season,
      liftHolds: opts.liftHolds,
      groomed: rows.some((r) => r.date === date && groomedAt.has(r.time)),
    }));
  return { version: SCORING_VERSION, resortId: resort.id, siteMode: sites.mode, siteReason: sites.reason, ageHours: opts.ageHours ?? null, hours: window, days };
}
