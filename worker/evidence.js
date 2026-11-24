// Map evidence from skiers: opt-in ski-day summaries and "report a map mistake" notes. Pure logic, unit tested.
//
// Privacy (see docs/PRIVACY_DATA.md and the privacy policy):
// - Only people who switch on "Help improve the maps" send anything, once per ski day, after the day ends.
// - The phone sends a summary, never a track: which runs were skied (run numbers on that map) and which 20 m squares
//   off the known runs were skied through. No times, no order, no speed, no account, no device id. Only stretches
//   that look like skiing are used (ski speed, on the map, not on a lift, away from lodges, buildings and car parks). A one-day random key lets the server drop a duplicate upload; it is kept
//   three days and cannot be linked to the next day's key.
// - The server only adds counts. A square or run is published (and used) only once at least K different ski days
//   reached it, so no single person's day can be read back.
export const K_ANON = 5;
export const CELL_M = 20;
export const MAX_CELLS = 6000;
export const MAX_RUNS = 400;
export const REPORT_KINDS = ['missing', 'not_real', 'wrong_rating', 'wrong_place', 'closed_for_good', 'other'];

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const RESORT_RE = /^[a-z0-9-]{2,40}$/;

/** Check a ski-day summary. Returns {ok, runs:Set, cells:Set} or {error}. */
export function cleanSummary(b) {
  if (!b || typeof b !== 'object') return { error: 'bad body' };
  if (!RESORT_RE.test(b.resort || '')) return { error: 'bad resort' };
  if (!/^[0-9a-f]{32}$/.test(b.key || '')) return { error: 'bad key' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.day || '')) return { error: 'bad day' };
  const runs = new Set(), cells = new Set();
  if (!Array.isArray(b.runs) || b.runs.length > MAX_RUNS) return { error: 'bad runs' };
  for (const r of b.runs) if (isInt(r, 0, 100000)) runs.add(r);
  if (!Array.isArray(b.cells) || b.cells.length > MAX_CELLS) return { error: 'bad cells' };
  for (const c of b.cells) if (Array.isArray(c) && isInt(c[0], -5000, 5000) && isInt(c[1], -5000, 5000)) cells.add(`${c[0]},${c[1]}`);
  return { ok: true, runs, cells };
}

/** Add one summary to the running totals (plain objects: key -> count). */
export function addSummary(totals, s) {
  for (const r of s.runs) totals.runs[r] = (totals.runs[r] || 0) + 1;
  for (const c of s.cells) totals.cells[c] = (totals.cells[c] || 0) + 1;
  totals.days = (totals.days || 0) + 1;
}

/** What may be shown: only counts reached by at least K_ANON ski days. */
export function publicTotals(totals, k = K_ANON) {
  const pick = (o) => Object.fromEntries(Object.entries(o).filter(([, n]) => n >= k));
  return { days: totals.days || 0, k, cell: CELL_M, runs: pick(totals.runs || {}), cells: pick(totals.cells || {}) };
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
  const dev = /^[0-9a-f]{32}$/.test(b.dev || '') ? b.dev : '';
  const near = Math.round(Number(b.near));
  const run = Number(b.run);
  const lat = Number(b.lat), lon = Number(b.lon);
  const placed = b.lat != null && b.lon != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return {
    ok: true,
    report: {
      resort: b.resort, kind: b.kind, x, y, ref: clean(b.ref, 60), name: clean(b.name, 80), text: safe, at: now,
      dev, near: b.near != null && isInt(near, 0, 100000) ? near : null, run: b.run != null && isInt(run, 0, 100000) ? run : null,
      lat: placed ? Math.round(lat * 1e5) / 1e5 : null, lon: placed ? Math.round(lon * 1e5) / 1e5 : null,
    },
  };
}
