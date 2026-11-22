import { scoreForecast, roundHalfUp } from './score/index.js';
import { loadWeather } from '../weather.js';
import { prefs } from '../store.js';
import { loadResortStatus, statusToScoreOpts } from './status.js';

const HOUR_MS = 3600e3;
const STALE_HOURS = 6;

export function localToday(tz, now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export const ageHoursOf = (at, now = Date.now()) => Math.max(0, (now - at) / HOUR_MS);

export const isStale = (hours) => hours >= STALE_HOURS;

export function scoreResort(resort, weather, { now = Date.now(), at = now, status } = {}) {
  const first = (weather?.base?.hourly?.time ?? weather?.summit?.hourly?.time ?? [])[0]?.slice(0, 10);
  const local = localToday(resort.tz, now);
  const today = first && local < first ? first : local;
  const out = scoreForecast(resort, weather, { ...statusToScoreOpts(status), today, ageHours: ageHoursOf(at, now) });
  return { ...out, days: out.days.filter((d) => d.date >= today) };
}

const statusKey = (id) => `fcStatus:${id}`;

export async function loadStatusSaved(resort, loader = loadResortStatus) {
  const fresh = await loader(resort);
  if (!fresh.assumed) { prefs.set(statusKey(resort.id), fresh); return fresh; }
  return prefs.get(statusKey(resort.id), null) ?? fresh;
}

export async function loadForecast(resort, force = false, loader = loadWeather, statusLoader = loadStatusSaved) {
  const [w, status] = await Promise.all([loader(resort, force), statusLoader(resort)]);
  const weather = { summit: w.summit, base: w.base };
  return { resort, at: w.at, source: w.source, stale: !!w.stale, weather, status, scored: scoreResort(resort, weather, { at: w.at, status }) };
}

export function columnDates(forecasts, count = 7) {
  const dates = new Set();
  for (const fc of forecasts) for (const d of fc?.scored?.days ?? []) dates.add(d.date);
  return [...dates].sort().slice(0, count);
}

const BANDS = [[85, 5, 'Epic'], [70, 4, 'Great'], [55, 3, 'Good'], [40, 2, 'Fair'], [0, 1, 'Poor']];

export function bandOf(score) {
  const shown = roundHalfUp(score);
  const [, band, label] = BANDS.find(([min]) => shown >= min);
  return { shown, band, label };
}

export const BLOCKS = [
  { id: 'morning', label: 'Morning', from: 0, to: 12 },
  { id: 'midday', label: 'Midday', from: 12, to: 14 },
  { id: 'afternoon', label: 'Afternoon', from: 14, to: 24 },
];

export const blockOfHour = (hour) => BLOCKS.find((b) => hour >= b.from && hour < b.to);

export function timeBlocks(day) {
  const ski = day.hours.filter((h) => h.ski && h.score != null);
  return BLOCKS.map((b) => {
    const rows = ski.filter((h) => h.hour >= b.from && h.hour < b.to);
    return { ...b, from: rows.length ? rows[0].hour : b.from, to: rows.length ? rows[rows.length - 1].hour + 1 : b.to, score: rows.length ? rows.reduce((s, h) => s + h.score, 0) / rows.length : null };
  }).filter((b) => b.score != null);
}

export const BROAD_FROM_DAYS_AHEAD = 3;

export function windowSummary(day) {
  if (!day.window) return { kind: 'none' };
  if (day.daysAhead >= BROAD_FROM_DAYS_AHEAD || day.windowConfidence?.level === 'Low') {
    return { kind: 'broad', block: blockOfHour((day.window.start + day.window.end - 1) / 2) };
  }
  return { kind: 'exact', start: day.window.start, end: day.window.end };
}
