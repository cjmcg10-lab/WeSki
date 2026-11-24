import { scoreForecast, roundHalfUp } from './score/index.js';
import { sourceAge } from './score/explain.js';
import { loadWeather, savedHistory } from '../weather.js';
import { prefs } from '../store.js';
import { forecastPoints } from './catalog.js';
import { loadResortStatus, statusToScoreOpts } from './status.js';

const HOUR_MS = 3600e3;
const STALE_HOURS = 6;

export function localToday(tz, now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export const ageHoursOf = (at, now = Date.now()) => Math.max(0, (now - at) / HOUR_MS);

export const sourceAgeHours = (weather, at, now = Date.now()) => (weather?.ageHours == null ? null : weather.ageHours + ageHoursOf(at, now));

export const isStale = (hours) => hours >= STALE_HOURS;

const STATUS_FRESH_MS = 20 * 60e3;
const STATUS_GRACE_MS = 1500;
const statusKey = (id) => `fcStatus:${id}`;

export const statusAgeHours = (status, now) => {
  const at = Date.parse(status?.fetchedAt ?? '');
  return Number.isFinite(at) ? ageHoursOf(at, now) : Infinity;
};

export function agedStatus(status, now = Date.now()) {
  if (!status || status.assumed) return { status, ageHours: 0 };
  const ageHours = statusAgeHours(status, now);
  if (!isStale(ageHours)) return { status, ageHours };
  const hours = status.hours ? { ...status.hours, assumed: true } : status.hours;
  return { status: { ...status, hours, closures: {}, liftHolds: [] }, ageHours };
}

function scoreToday(resort, weather, now) {
  const first = (weather?.base?.hourly?.time ?? weather?.summit?.hourly?.time ?? [])[0]?.slice(0, 10);
  const local = localToday(resort.tz, now);
  return first && local < first ? first : local;
}

export function scoreResort(resort, weather, { now = Date.now(), at = now, status, history } = {}) {
  const today = scoreToday(resort, weather, now);
  const aged = agedStatus(status, now);
  const fetchAgeHours = ageHoursOf(at, now);
  const opts = statusToScoreOpts(aged.status);
  if (aged.status?.hours?.assumed && opts.hours) opts.hours = { ...opts.hours, assumed: true };
  const ageHours = sourceAgeHours(weather, at, now);
  const out = scoreForecast(resort, weather, { ...opts, today, ageHours, fetchAgeHours, ...(history ? { history } : {}) });
  return { ...out, today, band: bandOfAges({ stale: weather?.stale, fetchAgeHours, ageHours }, aged.ageHours), days: out.days.filter((d) => d.date >= today) };
}

const bandOfAges = (source, statusAge) => `${sourceAge(source)?.level ?? ''}|${isStale(statusAge)}`;

export function rescored(forecast, now = Date.now()) {
  const { resort, weather, at, status, scored, history } = forecast;
  const fetchAgeHours = ageHoursOf(at, now);
  const ageHours = sourceAgeHours(weather, at, now);
  if (scoreToday(resort, weather, now) === scored.today && bandOfAges({ stale: weather?.stale, fetchAgeHours, ageHours }, agedStatus(status, now).ageHours) === scored.band) return forecast;
  return { ...forecast, scored: scoreResort(resort, weather, { now, at, status, history }) };
}

export function withHistory(forecast, history, now = Date.now()) {
  if (!history) return forecast;
  const { resort, weather, at, status } = forecast;
  return { ...forecast, history, scored: scoreResort(resort, weather, { now, at, status, history }) };
}

export function savedStatus(resort) {
  const saved = prefs.get(statusKey(resort.id), null);
  return saved?.status ? saved : null;
}

export async function loadStatusSaved(resort, loader = loadResortStatus, now = Date.now()) {
  const saved = prefs.get(statusKey(resort.id), null);
  if (saved?.status && now - saved.checkedAt < STATUS_FRESH_MS) return saved.status;
  const fresh = await loader(resort);
  if (!fresh.assumed) {
    const status = { ...fresh, fetchedAt: fresh.fetchedAt ?? new Date(now).toISOString() };
    prefs.set(statusKey(resort.id), { status, checkedAt: now });
    return status;
  }
  return saved?.status ?? fresh;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function loadForecast(resort, force = false, loader = loadWeather, statusLoader = loadStatusSaved, now = Date.now(), peekHistory = savedHistory) {
  const place = forecastPoints(resort);
  if (!place || !resort.tz) throw new Error('no height or time zone data');
  const saved = savedStatus(resort);
  const statusP = statusLoader(place);
  const quick = saved ? Promise.race([statusP, wait(STATUS_GRACE_MS).then(() => saved.status)]) : statusP;
  const [w, status] = await Promise.all([loader(place, force, { allowStale: true }), quick]);
  const serverStale = !!w.stale && !w.error;
  const weather = { summit: w.summit, base: w.base, ageHours: w.ageHours ?? null, stale: serverStale, resolutionKm: w.resolutionKm ?? null, gridElevation: w.gridElevation, alerts: w.alerts ?? [], ...(w.ensemble ? { ensemble: w.ensemble } : {}) };
  const history = peekHistory(place, now)?.data ?? undefined;
  return { resort: place, at: w.at, source: w.source, stale: !!w.stale, serverStale, weather, status, history, scored: scoreResort(place, weather, { now, at: w.at, status, history }) };
}

/** The calendar's dates: seven days, or nine when a mountain has ensemble days 7 and 8 (Swiss resorts, issue #57). */
export function columnDates(forecasts, count = 9) {
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

export function windowSummary(day) {
  if (day.detail && day.detail !== 'hourly' && day.detail !== 'windows') return { kind: 'hidden' };
  if (!day.window) return { kind: 'none' };
  if (day.detail === 'windows' || day.windowConfidence?.level === 'Low') {
    const part = day.broadWindow?.part;
    return { kind: 'broad', block: BLOCKS.find((b) => b.id === part) ?? blockOfHour((day.window.start + day.window.end - 1) / 2) };
  }
  return { kind: 'exact', start: day.window.start, end: day.window.end };
}
