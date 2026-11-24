// MeteoSwiss local forecasts with ensemble ranges, for Swiss resorts, days 6 to 8 (issue #57).
//
// Source: MeteoSwiss open data, STAC collection `ch.meteoschweiz.ogd-local-forecasting` on data.geo.admin.ch (licence
// CC BY, credit "Source: MeteoSwiss"). One CSV per parameter and hourly run, about 33 MB each:
//   https://data.geo.admin.ch/ch.meteoschweiz.ogd-local-forecasting/<YYYYMMDD>-ch/vnut12.lssw.<YYYYMMDDHH>00.<param>.csv
// with rows `point_id;point_type_id;Date;<param>`. The temperature files are hour-first (sorted by Date, then point_id,
// then type), the precipitation and wind files point-first (each point's hours together; points by type, then id as
// text); checked on the 2026-11-23 15:00 run, 5,818 points per hour. Date is UTC and marks the
// END of the hour the value covers (hourly sums and means; see docs/FORECAST_SOURCES.md for the evidence), so the value
// stamped 12:00 is stored as the hour starting at 11:00.
//
// A scheduled run (cron in wrangler.assets.jsonc, `scheduled` in worker/index.js) calls `ensembleStep` in one Durable
// Object every 5 minutes. Each call does at most one parameter file (an hour-first file only from day 6 on, by HTTP range
// requests; a point-first file whole), then finds the rows of the Swiss resorts' points with a search on the sorted
// file instead of reading every line. When all twelve parameters of a run are in, the next
// call cuts them into one small record per resort, which `/api/weather` attaches as `ensemble`.
import { MS_POINTS, MS_RESORTS } from './meteoswiss-points.js';
import { LAPSE, hourLabel } from './weather-util.js';

export const MS_BASE = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-local-forecasting';
const UA = { 'user-agent': 'weski-build' };
/** Parameter file -> field in a resort record. t °C, p mm in the hour, w mean wind and g gust peak in km/h (m/s when served). */
export const MS_FIELDS = {
  tre200h0: 't', treq10h0: 't10', treq90h0: 't90',
  rre150h0: 'p', rreq10h0: 'p10', rreq90h0: 'p90',
  fu3010h0: 'w', fu3q10h0: 'w10', fu3q90h0: 'w90',
  fu3010h1: 'g', fu3q10h1: 'g10', fu3q90h1: 'g90',
};
export const MS_PARAMS = Object.keys(MS_FIELDS);

const HOUR = 3600e3;
const FIRST_DAY = 6; // the first local day (counted from the run's date) the series starts on
const MAX_HOURS = 96; // at most four days are kept per run (the file ends about 9 days after the run's date)
const PUBLISH_DELAY_MS = 10 * 60e3; // a run's files appear about 3 minutes after the hour; wait 10
const REFRESH_MS = 12 * HOUR; // start a new run once the stored one is this old (about 270 MB is read per run)
const ABANDON_MS = 3 * HOUR; // a run still incomplete after this long is replaced by a newer one
export const MAX_AGE_MS = 18 * HOUR; // a stored run older than this is not served
const MISSING = -32768;
const ZONE = 'Europe/Zurich';

// ---------- times
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** UTC milliseconds -> the file's Date number YYYYMMDDHHMM. */
export const stampOf = (ms) => { const d = new Date(ms); return Number(`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`); };
export const msOfStamp = (n) => { const s = String(n); return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)); };
export const fileUrl = (runMs, param) => { const s = String(stampOf(runMs)); return `${MS_BASE}/${s.slice(0, 8)}-ch/vnut12.lssw.${s}.${param}.csv`; };

/** UTC milliseconds of local midnight in Zurich, `days` after the local date of `ms`. */
export function zurichMidnight(ms, days) {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const [y, m, d] = local.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d + days) - 2 * HOUR; // midnight is 22:00 or 23:00 UTC the day before
  for (let i = 0; i < 4 && hourLabel(t, ZONE).slice(11, 13) !== '00'; i++) t += HOUR;
  return t;
}

// ---------- reading the sorted CSV (bytes)
const NL = 10, SEMI = 59, MINUS = 45, DOT = 46;

/** Where whole lines start and stop in a slice that may begin and end mid-line (the first line is dropped: it may be cut or the header). */
export function dataRegion(bytes) {
  const first = bytes.indexOf(NL);
  const last = bytes.lastIndexOf(NL);
  return first < 0 || last <= first ? { start: 0, end: 0 } : { start: first + 1, end: last + 1 };
}

const lineStart = (b, pos, start) => { const i = b.lastIndexOf(NL, pos - 1); return i < start ? start : i + 1; };
const lineEnd = (b, pos) => b.indexOf(NL, pos);

/** Compares the line starting at `i` with the key (stamp, point * 10 + type): negative, 0 or positive. No allocation. */
function cmpAt(b, i, stamp, pt) {
  let pid = 0, type = 0, st = 0;
  for (; b[i] !== SEMI; i++) pid = pid * 10 + (b[i] - 48);
  for (i++; b[i] !== SEMI; i++) type = type * 10 + (b[i] - 48);
  for (i++; b[i] !== SEMI; i++) st = st * 10 + (b[i] - 48);
  return st !== stamp ? st - stamp : pid * 10 + type - pt;
}

/** The Date of the line starting at `i`. */
function stampAt(b, i) {
  let k = 0;
  while (k < 2) if (b[i++] === SEMI) k++;
  let st = 0;
  for (; b[i] !== SEMI; i++) st = st * 10 + (b[i] - 48);
  return st;
}

/** Where the value of the line starting at `i` begins (after the third semicolon). */
function valueAt(b, i) {
  let k = 0;
  while (k < 3) if (b[i++] === SEMI) k++;
  return i;
}

function readValue(b, i) {
  let neg = false, n = 0, scale = 0, any = false;
  if (b[i] === MINUS) { neg = true; i++; }
  for (; i < b.length && b[i] !== NL && b[i] !== 13; i++) {
    const c = b[i];
    if (c === DOT) { scale = 1; continue; }
    if (c < 48 || c > 57) return null;
    n = n * 10 + (c - 48); any = true;
    if (scale) scale *= 10;
  }
  if (!any) return null;
  const x = scale ? n / scale : n;
  return neg ? -x : x;
}

/** First line start in [lo, hi) (both line starts) whose key is not below (stamp, pt). */
function lowerBound(b, lo, hi, start, stamp, pt) {
  while (lo < hi) {
    const ls = Math.max(lo, lineStart(b, (lo + hi) >>> 1, start));
    if (cmpAt(b, ls, stamp, pt) < 0) lo = lineEnd(b, ls) + 1;
    else hi = ls;
  }
  return lo;
}

/** First line start at or after `cur` whose key is not below (stamp, pt): gallop forward, then bisect. */
function seek(b, cur, end, start, stamp, pt) {
  let hi = end;
  for (let step = 256; cur + step < end; step *= 2) {
    const ls = lineStart(b, cur + step, start);
    if (cmpAt(b, ls, stamp, pt) >= 0) { hi = lineEnd(b, ls) + 1; break; }
  }
  return lowerBound(b, cur, hi, start, stamp, pt);
}

const WALK = 24; // lines to walk from a guess before falling back to a search

/**
 * Hour-first files (rows sorted by Date, then point_id, then type; the temperature files). Every hour holds the same
 * points in the same order, and a row's length changes by a character or two from one hour to the next, so each target is first looked for where it sat an hour earlier, shifted by how far the previous target
 * moved; a short walk finds it. Only the first hour, and any target the walk misses, is found by a search.
 */
function extractByTime(bytes, keys, ms0, n) {
  const { start, end } = dataRegion(bytes);
  const values = keys.map(() => new Array(n).fill(null));
  const pts = keys.map(([id, type]) => id * 10 + type);
  const prev = new Array(pts.length).fill(-1);
  let cur = start, found = 0;
  for (let h = 0; h < n && cur < end; h++) {
    const stamp = stampOf(ms0 + (h + 1) * HOUR);
    let shift = null;
    for (let k = 0; k < pts.length && cur < end; k++) {
      const pt = pts[k];
      let at = -1;
      if (shift != null && prev[k] >= 0) {
        let ls = lineStart(bytes, Math.min(end - 1, Math.max(cur, prev[k] + shift)), start);
        if (ls < cur) ls = cur;
        for (let w = 0; w < WALK; w++) {
          const c = cmpAt(bytes, ls, stamp, pt);
          if (c === 0) { at = ls; break; }
          if (c < 0) { const e = lineEnd(bytes, ls) + 1; if (e >= end) break; ls = e; } else {
            if (ls <= cur) { at = ls; break; } // nothing between cur and here: the row is missing
            const back = lineStart(bytes, ls - 1, start);
            if (cmpAt(bytes, back, stamp, pt) < 0) { at = ls; break; }
            ls = back;
          }
        }
      }
      if (at < 0) at = seek(bytes, cur, end, start, stamp, pt);
      if (at >= end) { cur = end; break; }
      if (cmpAt(bytes, at, stamp, pt) === 0) {
        values[k][h] = readValue(bytes, valueAt(bytes, at));
        found++;
        if (prev[k] >= 0) shift = at - prev[k];
        prev[k] = at;
        cur = lineEnd(bytes, at) + 1;
      } else cur = at;
    }
  }
  return { values, found };
}

// Point-first files (the precipitation and wind files): each point's hours are together, Date ascending, and the
// points are ordered by type, then by point_id compared as text (1, 10, 10101, ..., 1024, ...).

/** Compares the line at `i` with (type, point id as text, stamp) in point-first order. No allocation. */
function cmpPointFirst(b, i, type, pid, stamp) {
  const p0 = i;
  while (b[i] !== SEMI) i++;
  const p1 = i;
  let ty = 0, st = 0;
  for (i++; b[i] !== SEMI; i++) ty = ty * 10 + (b[i] - 48);
  if (ty !== type) return ty - type;
  for (let j = 0; ; j++) { // the point ids as text
    const a = p0 + j < p1 ? b[p0 + j] : -1, c = j < pid.length ? pid.charCodeAt(j) : -1;
    if (a !== c) return a - c;
    if (a === -1) break;
  }
  for (i++; b[i] !== SEMI; i++) st = st * 10 + (b[i] - 48);
  return st - stamp;
}

function pointFirstBound(b, start, end, type, pid, stamp) {
  let lo = start, hi = end;
  while (lo < hi) {
    const ls = Math.max(lo, lineStart(b, (lo + hi) >>> 1, start));
    if (cmpPointFirst(b, ls, type, pid, stamp) < 0) lo = lineEnd(b, ls) + 1;
    else hi = ls;
  }
  return lo;
}

const samePoint = (b, i, type, pid) => { const c = cmpPointFirst(b, i, type, pid, 0); return c > 0 && cmpPointFirst(b, i, type, pid, 1e15) < 0; };

function extractByPoint(bytes, keys, ms0, n) {
  const { start, end } = dataRegion(bytes);
  const values = keys.map(() => new Array(n).fill(null));
  const hourOf = new Map(Array.from({ length: n }, (_, h) => [stampOf(ms0 + (h + 1) * HOUR), h]));
  const first = stampOf(ms0 + HOUR), last = stampOf(ms0 + n * HOUR);
  let found = 0;
  keys.forEach(([id, type], k) => {
    const pid = String(id);
    for (let at = pointFirstBound(bytes, start, end, type, pid, first); at < end && samePoint(bytes, at, type, pid); at = lineEnd(bytes, at) + 1) {
      const st = stampAt(bytes, at);
      if (st > last) break;
      const h = hourOf.get(st);
      if (h != null) { values[k][h] = readValue(bytes, valueAt(bytes, at)); found++; }
    }
  });
  return { values, found };
}

/** 'time' when consecutive rows are different points (hour-first), 'point' when two of the first four share one (point-first). */
export function layoutOf(bytes) {
  const { start, end } = dataRegion(bytes);
  const ids = [];
  for (let i = start; i < end && ids.length < 4; i = lineEnd(bytes, i) + 1) {
    const cut = bytes.indexOf(SEMI, bytes.indexOf(SEMI, i) + 1);
    ids.push(String.fromCharCode(...bytes.subarray(i, cut)));
  }
  return ids.some((x, j) => j > 0 && x === ids[j - 1]) ? 'point' : 'time';
}

/**
 * The values of `keys` ([[point_id, type]] in file order) for `n` hours from `ms0` (hour starts, UTC ms), out of a whole
 * parameter file or a slice of one. Returns `values[k][h]` (null where there is no row) and `found`, the rows found.
 * MeteoSwiss writes some parameters hour-first and others point-first, so the layout is read from the rows themselves.
 */
export function extract(bytes, keys, ms0, n) {
  return layoutOf(bytes) === 'point' ? extractByPoint(bytes, keys, ms0, n) : extractByTime(bytes, keys, ms0, n);
}

/** The Date of the first whole line in a slice, or null. */
export function firstStamp(bytes) {
  const { start, end } = dataRegion(bytes);
  return start < end ? stampAt(bytes, start) : null;
}
/** The Date of the last whole line in a slice, or null. */
export function lastStamp(bytes) {
  const { start, end } = dataRegion(bytes);
  return start < end ? stampAt(bytes, lineStart(bytes, end - 1, start)) : null;
}

// ---------- fetching one parameter file
const sizeOf = (res) => Number(/\/(\d+)$/.exec(res.headers.get('content-range') || '')?.[1]);

async function range(fetchFn, url, spec) {
  const res = await fetchFn(url, { headers: { ...UA, range: `bytes=${spec}` } });
  if (res.status !== 206 && res.status !== 200) throw new Error(`MeteoSwiss ${res.status} for ${url}`);
  return { res, bytes: new Uint8Array(await res.arrayBuffer()) };
}

/**
 * The bytes of a parameter file needed from the hour stamped `fromStamp` on. An hour-first file is read from shortly
 * before that hour to the end with range requests: the first and last 4 KB give the file's size and first and last
 * Date, the start is estimated from them (the hours have nearly the same size) with a margin, and widened if the slice
 * starts too late (3 to 5 requests, about 12 MB). A point-first file is read whole (2 requests, about 32 MB).
 */
export async function fetchFrom(fetchFn, url, fromStamp) {
  const head = await range(fetchFn, url, '0-4095');
  if (head.res.status === 200) return head.bytes; // a server that ignores ranges sent the whole file
  if (layoutOf(head.bytes) === 'point') return (await range(fetchFn, url, '0-')).bytes; // every point's hours are spread through the file
  const size = sizeOf(head.res);
  const tail = await range(fetchFn, url, '-4096');
  const first = firstStamp(head.bytes), last = lastStamp(tail.bytes);
  if (!size || first == null || last == null) throw new Error('MeteoSwiss file layout not recognised');
  const hdr = head.bytes.indexOf(NL) + 1;
  const hours = (msOfStamp(last) - msOfStamp(first)) / HOUR + 1;
  const frac = Math.max(0, (msOfStamp(fromStamp) - msOfStamp(first)) / HOUR / hours);
  const margin = Math.max(400000, Math.round(size * 0.04));
  let from = Math.max(0, Math.floor(hdr + frac * (size - hdr)) - margin);
  for (let tries = 0; ; tries++) {
    const { bytes } = await range(fetchFn, url, `${from}-`);
    const got = firstStamp(bytes);
    if (from === 0 || (got != null && got < fromStamp) || tries >= 2) return bytes;
    from = Math.max(0, from - 3 * margin);
  }
}

// ---------- packing for storage
/** The values of one parameter as whole tenths in an Int16Array (stored as is: Durable Object storage keeps typed arrays). */
export function pack(values) {
  const n = values[0]?.length ?? 0;
  const v = new Int16Array(values.length * n);
  values.forEach((row, k) => row.forEach((x, h) => { v[k * n + h] = x == null ? MISSING : Math.max(-32767, Math.min(32767, Math.round(x * 10))); }));
  return { n, v };
}

export function unpack({ n, v }, count) {
  return Array.from({ length: count }, (_, k) => Array.from(v.subarray(k * n, (k + 1) * n), (x) => (x === MISSING ? null : x / 10)));
}

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** One record per resort out of the twelve parameter arrays: its summit and base series, temperatures corrected for height. */
export function resortRecords(params, run, ms0, n, points = MS_POINTS, resorts = MS_RESORTS) {
  // hours at the end that no point has (beyond the file) are dropped
  let last = -1;
  for (const vals of Object.values(params)) for (const row of vals) for (let h = n - 1; h > last; h--) if (row[h] != null) { last = h; break; }
  const len = last + 1;
  const out = {};
  for (const [id, [si, bi, dzs, dzb]] of Object.entries(resorts)) {
    if (si >= points.length || bi >= points.length) continue;
    const site = (i, dz) => {
      const s = {};
      for (const [param, field] of Object.entries(MS_FIELDS)) {
        const row = params[param]?.[i] ?? [];
        const lapse = field[0] === 't' ? -LAPSE * dz : 0;
        s[field] = Array.from({ length: len }, (_, h) => (row[h] == null ? null : round1(row[h] + lapse)));
      }
      return s;
    };
    out[id] = { run, ms0, n: len, summit: site(si, dzs), base: site(bi, dzb) };
  }
  return out;
}

// ---------- the scheduled job, run inside a Durable Object (`storage` is its key-value storage)
/** The newest run whose first file exists, trying the last few hours. */
export async function latestRun(fetchFn, now) {
  const top = Math.floor((now - PUBLISH_DELAY_MS) / HOUR) * HOUR;
  for (let k = 0; k < 4; k++) {
    const run = top - k * HOUR;
    const res = await fetchFn(fileUrl(run, MS_PARAMS[0]), { method: 'HEAD', headers: UA });
    if (res.ok) return run;
  }
  return null;
}

/**
 * One step of the scheduled job: start a new run when the stored one is old, else read the next parameter file, else
 * cut the finished run into resort records. Returns what it did, for the log. Errors leave the state as it was, so the
 * next call tries again.
 */
export async function ensembleStep(storage, fetchFn, now = Date.now(), { points = MS_POINTS, resorts = MS_RESORTS } = {}) {
  let state = await storage.get('ms:state');
  const old = !state || (state.complete ? now - state.run >= REFRESH_MS : now - state.startedAt >= ABANDON_MS);
  if (old) {
    const run = await latestRun(fetchFn, now);
    if (run == null || (state && run <= state.run)) return { action: 'none', reason: run == null ? 'no run published' : 'no newer run' };
    const ms0 = zurichMidnight(run, FIRST_DAY);
    state = { run, ms0, n: MAX_HOURS, done: {}, startedAt: now, complete: false };
    await storage.put('ms:state', state);
  }
  if (state.complete) return { action: 'none', reason: 'up to date' };
  const param = MS_PARAMS.find((p) => !state.done[p]);
  if (param) {
    const bytes = await fetchFrom(fetchFn, fileUrl(state.run, param), stampOf(state.ms0));
    const { values, found } = extract(bytes, points, state.ms0, state.n);
    if (!found) throw new Error(`MeteoSwiss ${param}: no rows for our points`);
    await storage.put(`ms:p:${param}`, { run: state.run, ...pack(values) });
    state = { ...state, done: { ...state.done, [param]: true } };
    await storage.put('ms:state', state);
    return { action: 'param', param, found, run: state.run };
  }
  const params = {};
  for (const p of MS_PARAMS) {
    const stored = await storage.get(`ms:p:${p}`);
    if (!stored || stored.run !== state.run) {
      await storage.put('ms:state', { ...state, done: { ...state.done, [p]: false } });
      return { action: 'redo', param: p };
    }
    params[p] = unpack(stored, points.length);
  }
  const records = resortRecords(params, state.run, state.ms0, state.n, points, resorts);
  const entries = Object.entries(records).map(([id, r]) => [`ms:r:${id}`, r]);
  for (let i = 0; i < entries.length; i += 128) await storage.put(Object.fromEntries(entries.slice(i, i + 128)));
  await storage.put('ms:latest', { run: state.run, ms0: state.ms0, at: now });
  await storage.put('ms:state', { ...state, complete: true });
  return { action: 'assembled', resorts: entries.length, run: state.run };
}

/** The stored record for a resort from the newest complete run, or null when there is none or it is too old. */
export async function ensembleRecord(storage, id, now = Date.now()) {
  const latest = await storage.get('ms:latest');
  if (!latest || now - latest.run > MAX_AGE_MS) return null;
  const r = await storage.get(`ms:r:${id}`);
  return r && r.run === latest.run ? r : null;
}

const KMH = 1 / 3.6;

/**
 * The record as `/api/weather` sends it (`ensemble`): local hour labels (hour starts) and, per site, the central value and
 * the 10% and 90% quantiles of temperature (°C), precipitation (mm in the hour), wind and gust (m/s).
 */
export function ensembleForResponse(r, tz) {
  const site = (s) => Object.fromEntries(Object.entries(s).map(([k, a]) => [k, k[0] === 'w' || k[0] === 'g' ? a.map((x) => (x == null ? null : Math.round(x * KMH * 10) / 10)) : a]));
  return {
    source: 'meteoswiss',
    model: 'meteoswiss_local',
    run: new Date(r.run).toISOString(),
    time: Array.from({ length: r.n }, (_, h) => hourLabel(r.ms0 + h * HOUR, tz)),
    summit: site(r.summit),
    base: site(r.base),
  };
}

export const hasEnsemble = (id) => Object.hasOwn(MS_RESORTS, id);
