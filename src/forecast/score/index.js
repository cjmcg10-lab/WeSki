import { ASSUMED_HOURS, daysBetween, scoreDay } from './day.js';
import { scoreHours } from './hour.js';
import { SCORING_VERSION } from './version.js';

export { SCORING_VERSION } from './version.js';
export { roundHalfUp, ASSUMED_HOURS, DAY_WEIGHTS, WINDOW_HOURS, MIN_HOURS_WITH_DATA, detailLevel, DETAIL_MAX_DAYS_AHEAD } from './day.js';
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

const biggestGap = (a, b) => Math.max(...[a, b].filter(Number.isFinite), -Infinity);

/** How far the weather model's own ground height is from the resort's, in metres, or null when the source does not say. */
export function elevationMismatch(resort, gridElevation) {
  const gap = biggestGap(Math.abs((gridElevation?.summit ?? NaN) - resort.top), Math.abs((gridElevation?.base ?? NaN) - resort.base));
  return Number.isFinite(gap) ? gap : null;
}

/** What the engine reads about the source from an `/api/weather` response, so a caller only passes `history`. `opts` wins. */
function sourceInputs(resort, weather, opts) {
  return {
    ageHours: opts.ageHours ?? weather?.ageHours ?? null,
    fetchAgeHours: opts.fetchAgeHours ?? null,
    stale: opts.stale ?? weather?.stale ?? false,
    resolutionKm: opts.resolutionKm ?? weather?.resolutionKm ?? null,
    elevationMismatchM: opts.elevationMismatchM ?? elevationMismatch(resort, weather?.gridElevation),
  };
}

export function scoreForecast(resort, weather, opts = {}) {
  const window = opts.hours ? { from: opts.hours.from, to: opts.hours.to, assumed: !!opts.hours.assumed } : { ...ASSUMED_HOURS, assumed: true };
  const groomedAt = groomedHours(opts.grooming, weather);
  const { rows, sites, history } = scoreHours(resort, weather ?? {}, groomedAt, opts.history);
  const dates = [...new Set(rows.map((r) => r.date))];
  const today = opts.today ?? dates[0];
  const closures = opts.closures ?? {};
  const source = sourceInputs(resort, weather, opts);
  const days = dates.map((date) =>
    scoreDay({
      date,
      rows: rows.filter((r) => r.date === date),
      window,
      single: sites.mode === 'single',
      closure: closures[date],
      daysAhead: daysBetween(today, date),
      season: opts.season,
      liftHolds: opts.liftHolds,
      groomed: rows.some((r) => r.date === date && groomedAt.has(r.time)),
      history,
      ...source,
    }));
  const inputs = { ...source, historyHours: history.hours, observedHours: history.observed };
  return { version: SCORING_VERSION, resortId: resort.id, siteMode: sites.mode, siteReason: sites.reason, ageHours: source.ageHours, hours: window, inputs, days };
}
