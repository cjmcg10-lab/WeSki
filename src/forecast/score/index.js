import { ASSUMED_HOURS, daysBetween, scoreDay } from './day.js';
import { scoreHours } from './hour.js';
import { SCORING_VERSION } from './version.js';

export { SCORING_VERSION } from './version.js';
export { roundHalfUp, ASSUMED_HOURS, DAY_WEIGHTS, WINDOW_HOURS, MIN_HOURS_WITH_DATA } from './day.js';
export { WEIGHTS } from './components.js';
export { ALL_CODES, CODES } from './codes.js';

export function scoreForecast(resort, weather, opts = {}) {
  const window = opts.hours ? { from: opts.hours.from, to: opts.hours.to, assumed: false } : { ...ASSUMED_HOURS, assumed: true };
  const { rows, sites } = scoreHours(resort, weather ?? {});
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
    }));
  return { version: SCORING_VERSION, resortId: resort.id, siteMode: sites.mode, siteReason: sites.reason, hours: window, days };
}
