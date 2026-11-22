import { ASSUMED_HOURS, daysBetween, scoreDay } from './day.js';
import { scoreHours } from './hour.js';
import { SCORING_VERSION } from './version.js';

export { SCORING_VERSION } from './version.js';
export { roundHalfUp, ASSUMED_HOURS, DAY_WEIGHTS, WINDOW_HOURS, MIN_HOURS_WITH_DATA } from './day.js';
export { WEIGHTS } from './components.js';
export { ALL_CODES, CODES } from './codes.js';

const GROOM_LOOKBACK_MS = 24 * 3600e3;
const labelMs = (t) => Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10), +t.slice(11, 13), +t.slice(14, 16) || 0);

function groomedHours(grooming, weather) {
  const first = (weather?.summit?.hourly?.time ?? weather?.base?.hourly?.time)?.[0];
  const hours = new Set();
  for (const g of grooming ?? []) {
    if (first && g.at < first && labelMs(first) - labelMs(g.at) <= GROOM_LOOKBACK_MS) hours.add(first);
    else hours.add(`${g.at.slice(0, 13)}:00`);
  }
  return hours;
}

export function scoreForecast(resort, weather, opts = {}) {
  const window = opts.hours ? { from: opts.hours.from, to: opts.hours.to, assumed: false } : { ...ASSUMED_HOURS, assumed: true };
  const groomedAt = groomedHours(opts.grooming, weather);
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
