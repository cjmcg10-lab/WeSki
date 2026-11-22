import { roundHalfUp } from './score/index.js';

export const TRIP_KEY = 'fcTrip';
export const MAX_RANGE_DAYS = 14;
export const MARGIN = { High: 5, Medium: 8, Low: 12 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEVEL_ORDER = ['Low', 'Medium', 'High'];
const DAY_MS = 86400e3;

const isDate = (value) => typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

export const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);

export const rangeError = (from, to) => isDate(from) && isDate(to) && to < from;

export function rangeDays(from, to) {
  if (!isDate(from)) return [];
  const end = isDate(to) && to >= from ? to : from;
  const count = Math.min(daysBetween(from, end) + 1, MAX_RANGE_DAYS);
  return Array.from({ length: count }, (_, i) => shiftDate(from, i));
}

export function cleanTrip(raw, today = '') {
  const picked = Array.isArray(raw?.picked) ? [...new Set(raw.picked.filter((d) => isDate(d) && d >= today))].sort() : [];
  const rawFrom = isDate(raw?.from) ? raw.from : '';
  const rawTo = rawFrom && isDate(raw?.to) && raw.to >= rawFrom ? raw.to : '';
  const from = rawFrom >= today ? rawFrom : rawTo >= today ? today : '';
  const to = from ? rawTo : '';
  const span = rangeDays(from, to);
  const skip = Array.isArray(raw?.skip) ? [...new Set(raw.skip.filter((d) => span.includes(d)))].sort() : [];
  return { picked, from, to, skip };
}

export const tripDates = (trip) => {
  const skip = trip.skip ?? [];
  return [...new Set([...trip.picked, ...rangeDays(trip.from, trip.to).filter((d) => !skip.includes(d))])].sort();
};

export function toggleDate(trip, date) {
  const inRange = rangeDays(trip.from, trip.to).includes(date);
  const skip = trip.skip ?? [];
  if (tripDates(trip).includes(date)) {
    return { ...trip, picked: trip.picked.filter((d) => d !== date), skip: inRange ? [...skip, date].sort() : skip };
  }
  return inRange
    ? { ...trip, skip: skip.filter((d) => d !== date) }
    : { ...trip, picked: [...trip.picked, date].sort() };
}

export const clearRange = (trip) => ({ ...trip, from: '', to: '', skip: [] });

export function classifyDay(forecast, date) {
  const days = forecast?.scored?.days ?? [];
  const day = days.find((d) => d.date === date);
  if (day?.status === 'closed') return { kind: 'closed' };
  if (day && day.status !== 'insufficient' && Number.isFinite(day.score)) return { kind: 'scored', score: day.score, level: day.confidence?.level ?? 'Low' };
  if (!day && days.length && date > days[days.length - 1].date) return { kind: 'notyet' };
  if (!day && days.length && date < days[0].date) return { kind: 'past' };
  return { kind: 'insufficient' };
}

const lowestLevel = (levels) => levels.reduce((low, level) => (LEVEL_ORDER.indexOf(level) < LEVEL_ORDER.indexOf(low) ? level : low), 'High');

export function summarize(forecast, dates) {
  const days = dates.map((date) => ({ date, ...classifyDay(forecast, date) }));
  const scored = days.filter((d) => d.kind === 'scored').map((d) => ({ ...d, shown: roundHalfUp(d.score) }));
  const closed = days.filter((d) => d.kind === 'closed').length;
  const later = days.filter((d) => d.kind === 'notyet' || d.kind === 'past').length;
  const total = dates.length - later;
  const pick = (better) => scored.reduce((best, d) => (!best || better(d.shown, best.shown) ? d : best), null);
  const level = scored.length ? lowestLevel(scored.map((d) => d.level)) : null;
  return {
    days,
    total,
    later,
    covered: scored.length,
    closed,
    allClosed: total > 0 && closed === total,
    average: scored.length ? roundHalfUp(scored.reduce((sum, d) => sum + d.score, 0) / scored.length) : null,
    strongest: pick((a, b) => a > b),
    weakest: pick((a, b) => a < b),
    level,
    margin: level ? MARGIN[level] : null,
  };
}

export const isCloseCall = (a, b) => a.covered > 0 && a.covered === b.covered && Math.abs(a.average - b.average) < Math.max(a.margin, b.margin);

const inWindow = (forecast, date) => !['notyet', 'past'].includes(classifyDay(forecast, date).kind);

export function rankTrip(entries, dates) {
  const loaded = entries.filter((e) => e.forecast);
  const shared = dates.filter((date) => loaded.every((e) => inWindow(e.forecast, date)));
  const cards = entries.map((entry, order) => {
    if (!entry.forecast) return { ...entry, order, failed: true };
    const { covered, average, margin } = summarize(entry.forecast, shared);
    return { ...entry, order, ...summarize(entry.forecast, dates), ranked: { covered, average, margin } };
  });
  const open = cards.filter((c) => !c.failed && !c.allClosed)
    .sort((a, b) => b.ranked.covered - a.ranked.covered || (b.ranked.average ?? -1) - (a.ranked.average ?? -1) || a.order - b.order);
  const failed = cards.filter((c) => c.failed);
  const closed = cards.filter((c) => c.allClosed);
  open.forEach((card, i) => {
    card.rank = i + 1;
    if (i > 0 && isCloseCall(open[i - 1].ranked, card.ranked)) card.closeWith = open[i - 1].resort.id;
  });
  closed.forEach((card, i) => { card.rank = open.length + i + 1; });
  return [...open, ...failed, ...closed];
}

export function notYet(dates, forecasts) {
  const known = forecasts.filter((f) => f?.scored?.days?.length);
  if (!known.length) return { dates: [], span: 0 };
  const lastOf = (f) => f.scored.days[f.scored.days.length - 1].date;
  const widest = known.reduce((best, f) => (lastOf(f) > lastOf(best) ? f : best));
  const span = daysBetween(widest.scored.days[0].date, lastOf(widest));
  return { dates: dates.filter((d) => d > lastOf(widest)), span };
}

export const entersRangeOn = (date, span, today = '') => {
  const on = shiftDate(date, -span);
  return on < today ? today : on;
};
