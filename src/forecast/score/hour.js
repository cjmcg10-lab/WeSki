import { COMPONENTS, UPPER_HOLD_CAP, groomSurface, initialSurface, normalizeHour, scoreSite, stepSurface } from './components.js';
import { hourFactor } from './explain.js';

export const MIN_VERTICAL_M = 100;

const hourOf = (time) => +time.slice(11, 13);

function occurrenceKeys(times) {
  const seen = {};
  return times.map((t) => {
    seen[t] = (seen[t] || 0) + 1;
    return `${t}#${seen[t]}`;
  });
}

function rawAt(h, i) {
  return { t: h.temperature_2m?.[i], feels: h.apparent_temperature?.[i], snow: h.snowfall?.[i], wind: h.wind_speed_10m?.[i], gust: h.wind_gusts_10m?.[i], vis: h.visibility?.[i], code: h.weather_code?.[i] };
}

export const HISTORY_HOURS = 72;

/** Steps the snow surface through the hours before the forecast starts (the last 72 valid ones) and counts what it covered. */
export function replayHistory(block, firstTime) {
  const h = block?.hourly;
  const past = { state: null, hours: 0, observed: 0 };
  if (!h?.time) return past;
  const usable = [];
  h.time.forEach((time, i) => {
    if (firstTime && time >= firstTime) return;
    const x = normalizeHour(rawAt(h, i));
    if (x) usable.push({ time, x, observed: !!h.observed?.[i] });
  });
  for (const { time, x, observed } of usable.slice(-HISTORY_HOURS)) {
    past.state = stepSurface(past.state ?? initialSurface(x), x, hourOf(time));
    past.hours++;
    if (observed) past.observed++;
  }
  return past;
}

export function siteSeries(block, site, groomedAt = new Set(), past = null) {
  const h = block?.hourly;
  const bySlot = new Map();
  if (!h?.time) return bySlot;
  const keys = occurrenceKeys(h.time);
  let state = past?.state ?? null;
  h.time.forEach((time, i) => {
    const x = normalizeHour(rawAt(h, i));
    if (!x) return;
    state = state ?? initialSurface(x);
    if (groomedAt.has(time)) state = groomSurface(state);
    state = stepSurface(state, x, hourOf(time));
    const scored = scoreSite(x, state);
    scored.detail.site = site;
    bySlot.set(keys[i], scored);
  });
  return bySlot;
}

function sameWind(summit, base) {
  const s = summit.hourly, b = base.hourly;
  let compared = 0;
  for (let i = 0; i < Math.min(s.time.length, b.time.length); i++) {
    if (s.wind_speed_10m?.[i] == null || b.wind_speed_10m?.[i] == null) continue;
    compared++;
    const g = (s.wind_gusts_10m?.[i] ?? s.wind_speed_10m[i]) - (b.wind_gusts_10m?.[i] ?? b.wind_speed_10m[i]);
    if (Math.abs(s.wind_speed_10m[i] - b.wind_speed_10m[i]) > 1e-6 || Math.abs(g) > 1e-6) return false;
  }
  return compared >= 6;
}

export function chooseSites(resort, weather, upper, base) {
  if (!upper.size && !base.size) return { mode: 'both', reason: null };
  if (!upper.size) return { mode: 'single', use: 'base', reason: 'summit_missing' };
  if (!base.size) return { mode: 'single', use: 'upper', reason: 'base_missing' };
  const knownVertical = Number.isFinite(resort.top) && Number.isFinite(resort.base);
  if (knownVertical && resort.top - resort.base < MIN_VERTICAL_M) return { mode: 'single', use: 'base', reason: 'small_vertical' };
  if (sameWind(weather.summit, weather.base)) return { mode: 'single', use: 'base', reason: 'identical_wind' };
  return { mode: 'both', reason: null };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function scoreHours(resort, weather, groomedAt = new Set(), history = null) {
  const block = weather.summit?.hourly?.time ? weather.summit : weather.base;
  if (!block?.hourly?.time) return { rows: [], sites: { mode: 'both', reason: null }, history: { hours: 0, observed: 0 } };
  const times = block.hourly.time;
  const keys = occurrenceKeys(times);
  const past = { summit: replayHistory(history?.summit, times[0]), base: replayHistory(history?.base, times[0]) };
  const upper = siteSeries(weather.summit, 'upper', groomedAt, past.summit);
  const base = siteSeries(weather.base, 'base', groomedAt, past.base);
  const sites = chooseSites(resort, weather, upper, base);
  const used = sites.mode === 'single' ? [sites.use === 'base' ? 'base' : 'summit'] : [['summit', upper], ['base', base]].filter(([, s]) => s.size).map(([k]) => k);
  const covered = { hours: used.length ? Math.min(...used.map((k) => past[k].hours)) : 0, observed: Math.max(0, ...used.map((k) => past[k].observed)) };
  const rows = times.map((time, i) => {
    const key = keys[i];
    let u = upper.get(key) ?? null;
    let b = base.get(key) ?? null;
    if (sites.mode === 'single') {
      if (sites.use === 'base') u = null;
      else b = null;
    }
    const used = [b, u].filter(Boolean);
    const row = { time, date: time.slice(0, 10), hour: hourOf(time), score: null, components: null, sites: null, factor: null, hold: 0, holdLoss: 0, base: b, upper: u };
    if (!used.length) return row;
    row.score = mean(used.map((s) => s.score));
    row.components = Object.fromEntries(COMPONENTS.map((c) => [c, mean(used.map((s) => s.components[c]))]));
    row.sites = sites.mode === 'single' ? 'single' : used.length === 2 ? 'both' : b ? 'base' : 'upper';
    row.hold = Math.max(...used.map((s) => s.hold));
    row.holdLoss = mean(used.map((s) => s.holdLoss));
    if (u && b && u.hold > 0) {
      const upperLoss = u.hold * Math.max(0, row.score - UPPER_HOLD_CAP);
      row.score -= upperLoss;
      row.holdLoss += upperLoss;
    }
    row.factor = hourFactor(used);
    return row;
  });
  return { rows, sites, history: covered };
}
