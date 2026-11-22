import { SCORING_VERSION, scoreForecast } from '../src/forecast/score/index.js';
import { hourLabel } from './weather.js';

const HOUR = 3600e3;
export const HISTORY_HOURS = 72;
export const ARCHIVE_MIN_GAP_MS = 6 * HOUR;
export const ARCHIVE_KEEP_MS = 28 * 24 * HOUR;
export const LAST_GOOD_MAX_AGE_MS = 48 * HOUR;
export const RECORD_MIN_GAP_MS = 30 * 60e3;
const SITES = ['summit', 'base'];
const DELETE_BATCH = 128;

const round = (x, digits) => (x == null ? x : Math.round(x * 10 ** digits) / 10 ** digits);
const pad = (ms) => String(ms).padStart(13, '0');
const isObserved = (row) => row.src === 'nws-obs';
const isMeasured = (row) => isObserved(row) && !row.snowEstimated;

/** Hourly rows for the completed hours of a forecast, tagged with when it was issued and by which source and model. */
export function forecastRows(points, grid, { issuedMs, source, model, now }) {
  const rows = [];
  points.forEach((p, i) => {
    const ms = grid[i];
    if (p.filled || ms + HOUR > now || ![p.t, p.wind, p.snow].every(Number.isFinite)) return;
    rows.push({
      ms, t: round(p.t, 1), feels: round(p.feels ?? p.t, 1), snow: round(p.snow, 2), wind: round(p.wind, 1), gust: round(p.gust ?? p.wind, 1),
      vis: p.vis == null ? null : Math.round(p.vis), code: p.code ?? 0, acc: p.acc ?? 1, issued: issuedMs, src: source, model,
    });
  });
  return rows;
}

/**
 * One row per valid hour (UTC milliseconds, so a daylight-saving change cannot merge or split hours). A later forecast
 * replaces an earlier one for the same hour instead of adding to it, and an observation is never replaced by a forecast.
 */
export function mergeRows(existing, incoming, now) {
  const byHour = new Map(existing.map((r) => [r.ms, r]));
  for (const row of incoming) {
    const old = byHour.get(row.ms);
    if (!old) {
      byHour.set(row.ms, row.snow == null ? { ...row, snow: 0, snowEstimated: true } : row);
    } else if (isObserved(row)) {
      if (row.snow != null) byHour.set(row.ms, row);
      else if (!isObserved(old) || old.snowEstimated) byHour.set(row.ms, { ...row, snow: old.snow, snowEstimated: true });
    } else if (isObserved(old)) {
      if (old.snowEstimated) byHour.set(row.ms, { ...old, snow: row.snow, snowEstimated: false });
    } else if (row.issued >= old.issued) {
      byHour.set(row.ms, row);
    }
  }
  const cutoff = Math.floor(now / HOUR) * HOUR - HISTORY_HOURS * HOUR;
  return [...byHour.values()].filter((r) => r.ms >= cutoff).sort((a, b) => a.ms - b.ms).slice(-HISTORY_HOURS);
}

/** Rows in the Open-Meteo shape `/api/weather` uses, with local time labels; `observed` marks hours measured by a station. */
export function toOpenMeteo(rows, tz) {
  const col = (k) => rows.map((r) => r[k]);
  return {
    hourly: {
      time: rows.map((r) => hourLabel(r.ms, tz)), temperature_2m: col('t'), apparent_temperature: col('feels'), snowfall: col('snow'),
      wind_speed_10m: col('wind'), wind_gusts_10m: col('gust'), visibility: col('vis'), weather_code: col('code'), observed: rows.map(isMeasured),
    },
  };
}

function compactHourly(hourly) {
  const cols = { t: 'temperature_2m', snow: 'snowfall', wind: 'wind_speed_10m', gust: 'wind_gusts_10m', vis: 'visibility', code: 'weather_code' };
  const digits = { t: 1, snow: 2, wind: 1, gust: 1, vis: 0, code: 0 };
  return Object.fromEntries(Object.entries(cols).map(([short, long]) => [short, hourly[long].map((x) => round(x, digits[short]))]));
}

const conf = (c) => (c ? [c.level, c.reason.code] : null);

/** A forecast as issued: its raw hourly numbers, the engine version and the day scores it produced. */
export function archiveEntry(snap, scored) {
  return {
    v: SCORING_VERSION,
    issued: snap.issuedAt, fetched: snap.fetchedAt, source: snap.source, model: snap.model, resolutionKm: snap.weather.resolutionKm,
    ms0: snap.ms0, hoursAssumed: scored.hours.assumed, inputs: scored.inputs,
    summit: compactHourly(snap.weather.summit.hourly), base: compactHourly(snap.weather.base.hourly),
    days: scored.days.map((d) => ({
      date: d.date, status: d.status, score: d.score, mean: d.mean, window: d.window, peak: d.peakHour?.hour ?? null,
      conf: conf(d.confidence), wconf: conf(d.windowConfidence), detail: d.detail,
    })),
  };
}

function coverage(rows) {
  const newest = rows.reduce((m, r) => Math.max(m, r.issued), 0);
  return { hours: rows.length, observedHours: rows.filter(isMeasured).length, newestIssued: newest || null, sources: [...new Set(rows.map((r) => r.src))] };
}

/** Per-resort history, last good forecast and forecast archive on top of a Durable Object style key-value storage. */
export class HistoryStore {
  constructor(storage) {
    this.storage = storage;
  }

  async record(snap, now = Date.now()) {
    const meta = (await this.storage.get('meta')) ?? null;
    if (meta?.recordedAt && now - meta.recordedAt < RECORD_MIN_GAP_MS) return { recorded: false, reason: 'too_soon' };
    const stored = (await this.storage.get('hist')) ?? { summit: [], base: [] };
    const hist = Object.fromEntries(SITES.map((s) => [s, mergeRows(mergeRows(stored[s] ?? [], snap.forecast?.[s] ?? [], now), snap.observed?.[s] ?? [], now)]));
    const writes = {};
    const nextMeta = { ...(meta ?? {}), place: snap.place, recordedAt: now };
    if (JSON.stringify(hist) !== JSON.stringify(stored)) writes.hist = hist;
    if (!meta || !(meta.issuedAt >= snap.issuedAt)) {
      writes.last = { issuedAt: snap.issuedAt, weather: snap.weather };
      nextMeta.issuedAt = snap.issuedAt;
    }
    const archiving = !meta?.archivedAt || snap.issuedAt - meta.archivedAt >= ARCHIVE_MIN_GAP_MS;
    if (archiving) {
      const resort = { id: snap.id, top: snap.place.top, base: snap.place.base };
      const scored = scoreForecast(resort, snap.weather, { history: { summit: toOpenMeteo(hist.summit, snap.place.tz), base: toOpenMeteo(hist.base, snap.place.tz) } });
      writes[`a:${pad(snap.issuedAt)}`] = archiveEntry(snap, scored);
      nextMeta.archivedAt = snap.issuedAt;
    }
    if (JSON.stringify(nextMeta) !== JSON.stringify(meta)) writes.meta = nextMeta;
    if (Object.keys(writes).length) await this.storage.put(writes);
    if (archiving) await this.pruneArchive(now);
    return { recorded: true, wrote: Object.keys(writes) };
  }

  async pruneArchive(now) {
    const old = [...(await this.storage.list({ prefix: 'a:', end: `a:${pad(now - ARCHIVE_KEEP_MS)}` })).keys()];
    for (let i = 0; i < old.length; i += DELETE_BATCH) await this.storage.delete(old.slice(i, i + DELETE_BATCH));
    return old.length;
  }

  /** The last 72 hours in `/api/weather`'s shape, with where they came from and how old that is. */
  async history(now = Date.now()) {
    const meta = await this.storage.get('meta');
    const hist = await this.storage.get('hist');
    if (!meta || !hist) return null;
    const rows = SITES.flatMap((s) => hist[s] ?? []);
    const cover = coverage(rows);
    const shaped = Object.fromEntries(SITES.map((s) => [s, toOpenMeteo((hist[s] ?? []).filter((r) => r.ms <= now), meta.place.tz)]));
    return {
      ...shaped,
      tz: meta.place.tz,
      sources: cover.sources,
      ageHours: cover.newestIssued == null ? null : round(Math.max(0, now - cover.newestIssued) / HOUR, 1),
      coverage: Object.fromEntries(SITES.map((s) => [s, { hours: (hist[s] ?? []).length, observedHours: (hist[s] ?? []).filter(isMeasured).length }])),
    };
  }

  /** The last forecast that was fetched successfully, labelled stale, or null once it is older than LAST_GOOD_MAX_AGE_MS. */
  async lastGood(now = Date.now()) {
    const last = await this.storage.get('last');
    if (!last || now - last.issuedAt > LAST_GOOD_MAX_AGE_MS) return null;
    return { ...last.weather, stale: true, ageHours: round((now - last.issuedAt) / HOUR, 1) };
  }

  /** Archived forecasts issued at or after `sinceMs`, oldest first. */
  async archive(sinceMs = 0, limit = 50) {
    return [...(await this.storage.list({ prefix: 'a:', start: `a:${pad(sinceMs)}`, limit })).values()];
  }
}
