import { SNOW_HISTORY_MIN_HOURS, dayConfidence, dayDrivers, dayExplanation, veryColdNote, windowConfidence } from './explain.js';

export const DAY_WEIGHTS = { mean: 0.6, window: 0.4 };
export const WINDOW_HOURS = 3;
export const ASSUMED_HOURS = { from: 9, to: 16 };
export const MIN_HOURS_WITH_DATA = 3;
export const DETAIL_MAX_DAYS_AHEAD = { hourly: 1, windows: 5, range: 9, trend: 14 };
export const BROAD_PARTS = ['morning', 'midday', 'afternoon'];

const EPSILON = 1e-9;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const roundHalfUp = (x) => Math.floor(x + 0.5 + EPSILON);

/** The finest detail the screens may show for a day this far ahead. Counted from day 0, the local date of `today`. */
export function detailLevel(daysAhead) {
  return Object.entries(DETAIL_MAX_DAYS_AHEAD).find(([, max]) => daysAhead <= max)?.[0] ?? 'none';
}

/** The best third of the ski hours (morning, midday or afternoon): the coarse timing allowed for days 2 to 5. */
export function broadWindow(scoreByHour, from, to) {
  const length = to - from;
  if (length < WINDOW_HOURS) return null;
  let best = null;
  BROAD_PARTS.forEach((part, k) => {
    const start = from + Math.round((k * length) / BROAD_PARTS.length), end = from + Math.round(((k + 1) * length) / BROAD_PARTS.length);
    const scores = Array.from({ length: end - start }, (_, i) => scoreByHour.get(start + i)).filter((s) => s != null);
    if (scores.length * 2 < end - start) return;
    const m = mean(scores);
    if (!best || m > best.mean + EPSILON) best = { part, start, end, mean: m };
  });
  return best;
}

export function daysBetween(from, to) {
  const ms = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((ms(to) - ms(from)) / 864e5);
}

export function bestWindow(scoreByHour, from, to) {
  let best = null;
  for (let h = from; h + WINDOW_HOURS <= to; h++) {
    const scores = Array.from({ length: WINDOW_HOURS }, (_, k) => scoreByHour.get(h + k));
    if (scores.some((s) => s == null)) continue;
    const m = mean(scores);
    if (!best || m > best.mean + EPSILON) best = { start: h, end: h + WINDOW_HOURS, mean: m };
  }
  return best;
}

export function peakHour(skiRows) {
  let best = null;
  for (const r of skiRows) if (!best || r.score > best.score + EPSILON) best = r;
  return best && { time: best.time, hour: best.hour, score: best.score };
}

function skiRowsOf(rows, from, to) {
  const byHour = new Map();
  for (const r of rows) if (r.hour >= from && r.hour < to && r.score != null && !byHour.has(r.hour)) byHour.set(r.hour, r);
  return byHour;
}

export const outOfSeason = (season, date) =>
  !!season && (season.state === 'closed_for_season' || season.state === 'not_open' || (!!season.open && date < season.open) || (!!season.close && date > season.close));

export const alertEventsOn = (alerts, date) =>
  [...new Set(alerts.filter((a) => a.from.slice(0, 10) <= date && a.to.slice(0, 10) >= date).map((a) => a.event))];

export function scoreDay({ date, rows, window, single, closure, daysAhead, ageHours, fetchAgeHours = null, season, liftHolds = [], alerts = [], groomed = false, history = { hours: 0, observed: 0 }, stale = false, resolutionKm = null, elevationMismatchM = null }) {
  const { from, to, assumed } = window;
  const expected = to - from;
  const holds = liftHolds.filter((h) => h.date === date).map(({ lift, status, from: heldFrom, to: heldTo }) => ({ lift, status, from: heldFrom ?? null, to: heldTo ?? null }));
  const notes = [];
  if (holds.length) notes.push({ code: 'EX_LIFT_HOLD_CONFIRMED', params: [holds.length] });
  if (outOfSeason(season, date)) notes.push({ code: 'NT_OUT_OF_SEASON', params: [] });
  for (const event of alertEventsOn(alerts, date)) notes.push({ code: 'NT_WEATHER_ALERT', params: [event] });
  const cold = veryColdNote([...skiRowsOf(rows, from, to).values()]);
  if (cold) notes.push(cold);
  const detail = detailLevel(daysAhead);
  const base = { date, uncertainty: null, detail, skiHours: { from, to, assumed, expected }, daysAhead, liftHolds: holds, notes };
  if (closure) {
    return { ...base, status: 'closed', score: null, mean: null, window: null, peakHour: null, hours: [], factors: [], explain: null, confidence: null, windowConfidence: null, closureSource: closure === true ? null : closure, flags: [] };
  }
  const byHour = skiRowsOf(rows, from, to);
  const ski = [...byHour.values()];
  const hours = rows.map((r) => ({ ...r, ski: r.hour >= from && r.hour < to }));
  const withData = ski.length;
  const flags = [];
  if (history.hours < SNOW_HISTORY_MIN_HOURS) flags.push('snow_history_limited');
  if (stale) flags.push('stale_source');
  if (assumed) flags.push('assumed_hours');
  if (single) flags.push('single_estimate');
  const partial = !single && ski.some((r) => r.sites !== 'both');
  if (partial) flags.push('partial_sites');
  if (holds.length) flags.push('lift_hold_confirmed');
  if (groomed) flags.push('grooming_reported');
  const skiHours = { ...base.skiHours, withData };

  if (withData < MIN_HOURS_WITH_DATA || expected - withData > expected / 2) {
    const summitMissing = !single && ski.some((r) => r.sites === 'base');
    const code = !rows.some((r) => r.score != null) ? 'IR_SERVICE_UNAVAILABLE' : summitMissing ? 'IR_SUMMIT_MISSING' : 'IR_TOO_FEW_HOURS';
    return { ...base, skiHours, status: 'insufficient', score: null, mean: null, window: null, peakHour: null, hours, factors: [], explain: null, confidence: null, windowConfidence: null, insufficientReason: { code, params: code === 'IR_TOO_FEW_HOURS' ? [withData] : [] }, flags };
  }

  const dayMean = mean(ski.map((r) => r.score));
  const window_ = bestWindow(new Map([...byHour].map(([h, r]) => [h, r.score])), from, to);
  if (!window_) flags.push('window_under_3h');
  const score = window_ ? DAY_WEIGHTS.mean * dayMean + DAY_WEIGHTS.window * window_.mean : dayMean;
  const drivers = dayDrivers(ski);
  const confidence = dayConfidence({ single, partial, daysAhead, ageHours, fetchAgeHours, stale, history, resolutionKm, elevationMismatchM });
  const scoreByHour = new Map([...byHour].map(([h, r]) => [h, r.score]));
  return {
    ...base,
    skiHours,
    status: 'ok',
    score,
    mean: dayMean,
    window: window_,
    broadWindow: detail === 'windows' ? broadWindow(scoreByHour, from, to) : null,
    peakHour: peakHour(ski),
    hours,
    factors: drivers,
    explain: dayExplanation(ski, drivers),
    confidence,
    windowConfidence: windowConfidence({ window: window_, assumed, daysAhead, stale, ageHours, fetchAgeHours, dayLevel: confidence.level }),
    flags,
  };
}
