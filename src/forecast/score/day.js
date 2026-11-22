import { dayConfidence, dayDrivers, dayExplanation, windowConfidence } from './explain.js';

export const DAY_WEIGHTS = { mean: 0.6, window: 0.4 };
export const WINDOW_HOURS = 3;
export const ASSUMED_HOURS = { from: 9, to: 16 };
export const MIN_HOURS_WITH_DATA = 3;

const EPSILON = 1e-9;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const roundHalfUp = (x) => Math.floor(x + 0.5 + EPSILON);

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

export function scoreDay({ date, rows, window, single, closure, daysAhead, ageHours }) {
  const { from, to, assumed } = window;
  const expected = to - from;
  const base = { date, uncertainty: null, skiHours: { from, to, assumed, expected }, daysAhead };
  if (closure) {
    return { ...base, status: 'closed', score: null, mean: null, window: null, peakHour: null, hours: [], factors: [], explain: null, confidence: null, windowConfidence: null, closureSource: closure === true ? null : closure, flags: [] };
  }
  const byHour = skiRowsOf(rows, from, to);
  const ski = [...byHour.values()];
  const hours = rows.map((r) => ({ ...r, ski: r.hour >= from && r.hour < to }));
  const withData = ski.length;
  const flags = ['snow_history_limited'];
  if (assumed) flags.push('assumed_hours');
  if (single) flags.push('single_estimate');
  const partial = !single && ski.some((r) => r.sites !== 'both');
  if (partial) flags.push('partial_sites');
  const skiHours = { ...base.skiHours, withData };

  if (withData < MIN_HOURS_WITH_DATA || expected - withData > expected / 2) {
    const summitMissing = !single && ski.some((r) => r.sites === 'base');
    const code = withData === 0 ? 'IR_SERVICE_UNAVAILABLE' : summitMissing ? 'IR_SUMMIT_MISSING' : 'IR_TOO_FEW_HOURS';
    return { ...base, skiHours, status: 'insufficient', score: null, mean: null, window: null, peakHour: null, hours, factors: [], explain: null, confidence: null, windowConfidence: null, insufficientReason: { code, params: code === 'IR_TOO_FEW_HOURS' ? [withData] : [] }, flags };
  }

  const dayMean = mean(ski.map((r) => r.score));
  const window_ = bestWindow(new Map([...byHour].map(([h, r]) => [h, r.score])), from, to);
  if (!window_) flags.push('window_under_3h');
  const score = window_ ? DAY_WEIGHTS.mean * dayMean + DAY_WEIGHTS.window * window_.mean : dayMean;
  const drivers = dayDrivers(ski);
  return {
    ...base,
    skiHours,
    status: 'ok',
    score,
    mean: dayMean,
    window: window_,
    peakHour: peakHour(ski),
    hours,
    factors: drivers,
    explain: dayExplanation(ski, drivers),
    confidence: dayConfidence({ single, partial, daysAhead, ageHours }),
    windowConfidence: windowConfidence({ window: window_, assumed, daysAhead }),
    flags,
  };
}
