// Map evidence from skiers: opt-in ski-day summaries and "report a map mistake" notes. Pure logic, unit tested.
//
// Privacy (see docs/PRIVACY_DATA.md and the privacy policy):
// - Only people who switch on "Help improve the maps" send anything, once per ski day, after the day ends.
// - The phone sends a summary, never a track: which runs were skied (run numbers on that map) and which 20 m squares
//   off the known runs were skied through, plus one number: how many 20 m squares on the shown runs were skied (a count,
//   no places). No times, no order, no speed, no account, no device id. Only stretches
//   that look like skiing are used (ski speed, on the map, not on a lift, away from lodges, buildings and car parks). A one-day random key lets the server drop a duplicate upload; it is kept
//   three days and cannot be linked to the next day's key.
// - The server only adds counts. A square or run is published (and used) only once at least K different ski days
//   reached it, so no single person's day can be read back.
export const K_ANON = 5;
export const CELL_M = 20;
export const MAX_CELLS = 6000;
export const MAX_RUNS = 400;
// The most on-run squares one ski day can have (20 m squares: 20,000 is 400 km of skiing, far beyond any real day).
export const MAX_ON_CELLS = 20000;
// Per-day totals ("how much of the skiing was on the drawn runs") are kept for this many days.
export const DAILY_KEEP = 400;
export const REPORT_KINDS = ['missing', 'not_real', 'wrong_rating', 'wrong_place', 'closed_for_good', 'wrong_name', 'no_connection', 'other'];
// "It should be:" on a wrong-rating report. 'us': the four North American levels (resort.json `d`); 'colour': the
// European and Japanese piste colours (resort.json `c`). The phone says which scale its resort uses.
export const RATING_SCALES = {
  us: ['Green', 'Blue', 'Black', 'Double black'],
  colour: ['Green', 'Blue', 'Red', 'Black', 'Freeride / ski route'],
};

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const RESORT_RE = /^[a-z0-9-]{2,40}$/;

/** Is `day` (YYYY-MM-DD) a real date no later than tomorrow (UTC) and no more than DAILY_KEEP days ago? */
export function plausibleDay(day, now = Date.now()) {
  const ms = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) return false;
  return ms <= now + 86400e3 && ms >= now - DAILY_KEEP * 86400e3;
}

/**
 * Check a ski-day summary. Returns {ok, resort, key, runs:Set, cells:Set, day, on} or {error}. `on` (newer phones, #112) is how many
 * 20 m squares on the shown runs were skied that day: a count only. Older phones send none (on stays null) and are left
 * out of the per-day on-map share.
 */
export function cleanSummary(b, now = Date.now()) {
  if (!b || typeof b !== 'object') return { error: 'bad body' };
  if (!RESORT_RE.test(b.resort || '')) return { error: 'bad resort' };
  if (!/^[0-9a-f]{32}$/.test(b.key || '')) return { error: 'bad key' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.day || '')) return { error: 'bad day' };
  const runs = new Set(), cells = new Set();
  if (!Array.isArray(b.runs) || b.runs.length > MAX_RUNS) return { error: 'bad runs' };
  for (const r of b.runs) if (isInt(r, 0, 100000)) runs.add(r);
  if (!Array.isArray(b.cells) || b.cells.length > MAX_CELLS) return { error: 'bad cells' };
  for (const c of b.cells) if (Array.isArray(c) && isInt(c[0], -5000, 5000) && isInt(c[1], -5000, 5000)) cells.add(`${c[0]},${c[1]}`);
  let on = null;
  if (b.on != null) {
    if (!isInt(b.on, 0, MAX_ON_CELLS)) return { error: 'bad on' };
    // a day with a date that cannot be right (far past, future) still adds its squares, but not to the per-day share
    if (plausibleDay(b.day, now)) on = b.on;
  }
  // resort and key are returned too: the Worker routes the summary by `resort` and the store drops a repeat by `key`
  // (before #112 they were left out, so every summary went to one store named "undefined" and repeats were not caught)
  return { ok: true, resort: b.resort, key: b.key, runs, cells, day: b.day, on };
}

/**
 * Add one summary to the running totals (plain objects: key -> count). A summary with an on-run count also adds to
 * `daily[day]` = {n: ski days with a count, on: on-run squares, off: off-run squares}, from which the share of skied
 * squares on the drawn runs is worked out per day (onMapShare). Only the newest DAILY_KEEP days are kept.
 */
export function addSummary(totals, s) {
  for (const r of s.runs) totals.runs[r] = (totals.runs[r] || 0) + 1;
  for (const c of s.cells) totals.cells[c] = (totals.cells[c] || 0) + 1;
  totals.days = (totals.days || 0) + 1;
  if (Number.isInteger(s.on) && s.day) {
    const daily = (totals.daily ||= {});
    const d = (daily[s.day] ||= { n: 0, on: 0, off: 0 });
    d.n += 1; d.on += s.on; d.off += s.cells.size;
    const days = Object.keys(daily);
    if (days.length > DAILY_KEEP) for (const old of days.sort().slice(0, days.length - DAILY_KEEP)) delete daily[old];
  }
}

/**
 * The share of skied squares that were on the drawn runs, per day, only for days with at least k ski days that sent a
 * count: [{day, days, pct}] oldest first. Days with fewer are left out entirely ("not enough ski days yet").
 */
export function onMapShare(daily = {}, k = K_ANON) {
  return Object.entries(daily).filter(([, d]) => d.n >= k && d.on + d.off > 0).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, d]) => ({ day, days: d.n, pct: Math.round((1000 * d.on) / (d.on + d.off)) / 10 }));
}

/** What may be shown: only counts reached by at least K_ANON ski days. */
export function publicTotals(totals, k = K_ANON) {
  const pick = (o) => Object.fromEntries(Object.entries(o).filter(([, n]) => n >= k));
  return {
    days: totals.days || 0, k, cell: CELL_M, runs: pick(totals.runs || {}), cells: pick(totals.cells || {}),
    onMap: onMapShare(totals.daily, k),
  };
}

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Check a map-mistake report. It becomes public, like a note on a shared map. */
export function cleanReport(b, now = Date.now()) {
  if (!b || typeof b !== 'object') return { error: 'bad body' };
  if (!RESORT_RE.test(b.resort || '')) return { error: 'bad resort' };
  if (!REPORT_KINDS.includes(b.kind)) return { error: 'bad kind' };
  const x = Math.round(Number(b.x)), y = Math.round(Number(b.y));
  if (!isInt(x, -100000, 100000) || !isInt(y, -100000, 100000)) return { error: 'bad place' };
  const text = clean(b.text, 500);
  // leave out anything that looks like an email address or phone number: reports are public
  const safe = text.replace(/[^\s@]+@[^\s@]+/g, '[removed]').replace(/\+?\d[\d\s().-]{7,}\d/g, '[removed]');
  // Optional, sent by newer phones (#112). None of these is published in the report list:
  // dev: a random id made once per app install (never tied to an account); the server keeps only a per-mountain hash.
  // near: how far, in metres, the phone's own GPS was from the reported spot when the report was sent (not the position).
  // run: the run's number on that map build, to compare with map-help counts. lat/lon: the reported spot itself.
  // ref: the run's OpenStreetMap way id, or "lift:<OSM id or name>" for a lift (not the run number, which changes
  // between map builds); worker/confidence.js groups reports about one run or lift by it.
  const dev = /^[0-9a-f]{32}$/.test(b.dev || '') ? b.dev : '';
  const near = Math.round(Number(b.near));
  const run = Number(b.run);
  const lat = Number(b.lat), lon = Number(b.lon);
  // should + scale: the rating a wrong-rating report says the run should have. Required for that kind from newer
  // phones; older phones sent none, so a wrong-rating report without it is still taken (should stays null).
  let should = null, scale = null;
  if (b.kind === 'wrong_rating' && b.should != null) {
    scale = b.scale == null ? 'us' : b.scale;
    if (!RATING_SCALES[scale] || !isInt(b.should, 0, RATING_SCALES[scale].length - 1)) return { error: 'bad rating' };
    should = b.should;
  }
  const placed = b.lat != null && b.lon != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return {
    ok: true,
    report: {
      resort: b.resort, kind: b.kind, x, y, ref: clean(b.ref, 60), name: clean(b.name, 80), text: safe, at: now,
      dev, near: b.near != null && isInt(near, 0, 100000) ? near : null, run: b.run != null && isInt(run, 0, 100000) ? run : null,
      lat: placed ? Math.round(lat * 1e5) / 1e5 : null, lon: placed ? Math.round(lon * 1e5) / 1e5 : null,
      should, scale,
    },
  };
}
