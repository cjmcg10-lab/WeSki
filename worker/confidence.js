// How sure are we that a reported map mistake is real? Pure logic, unit tested (tests/confidence.test.js).
// Issue #112, step 2. The daily digest shows these scores; later, automatic fixes (step 3) will read them, so every
// number that decides anything is in CONFIDENCE below, and every problem carries the reasons for its score.
//
// What a score is made of (nothing here identifies a person):
// - Reports of the same kind within CONFIDENCE.spotM of each other are one problem.
// - Each phone counts once per problem (phones send a random install id; the server keeps only a per-mountain hash
//   of it). Reports from before install ids existed count as CONFIDENCE.unknownDevice each.
// - A report fades in a straight line to nothing at CONFIDENCE.fadeDays old.
// - A report sent from near the spot (the phone's GPS within CONFIDENCE.nearM when it was sent) counts more.
// - Map help adds or takes away points, using only the public counts (squares and runs reached by at least K_ANON
//   ski days; see worker/evidence.js). Fewer than K_ANON days reads as "no published ski days", never as a number.
import { CELL_M, K_ANON } from './evidence.js';

export const CONFIDENCE = {
  spotM: 60,              // reports of one kind closer than this (metres on the map) are one problem
  fadeDays: 60,           // a report's weight falls in a straight line from 1 (today) to 0 at this age
  unknownDevice: 0.5,     // weight of a report with no install id (sent before phones sent one): repeats cannot be told apart
  nearM: 200,             // the reporter's GPS was within this many metres of the spot when the report was sent...
  nearFactor: 1.5,        // ...so the report counts this many times as much

  // Map help ("Help improve the maps"): only squares and runs with at least K_ANON ski days are ever used.
  offRunRadiusM: 60,      // off-run squares within this of the spot count for "missing" and "wrong place"
  offRunCellsStrong: 3,   // this many such squares is strong evidence; fewer (but at least one) is some evidence
  offRunPoints: 1.5,      // points for strong evidence (half for some)
  absenceMinDays: 50,     // the mountain needs this many map-help ski days before a run nobody skis means anything
  absencePoints: 1,       // "does not exist" / "closed for good" on a run with no published ski days
  skiedPoints: -1,        // "does not exist" / "closed for good" on a run skied on K_ANON or more days

  levels: { medium: 1.5, high: 3 }, // score at or above which a problem is "medium" or "high" confidence
};

// Which kinds map-help evidence can speak to. A wrong rating is never judged from GPS: it goes to a person and the
// resort's own trail list (a wrong, easier rating can send someone onto terrain above their level).
const OFF_RUN_KINDS = new Set(['missing', 'wrong_place']);
const RUN_ABSENCE_KINDS = new Set(['not_real', 'closed_for_good']);
const DAY = 86400e3;

export const KIND_NAMES = {
  missing: 'Run or lift missing', not_real: 'Run does not exist', wrong_rating: 'Wrong rating',
  wrong_place: 'Drawn in the wrong place', closed_for_good: 'Closed for good', other: 'Something else',
};

/** 1 for a report sent now, falling to 0 at fadeDays old. */
export function ageWeight(at, now, c = CONFIDENCE) {
  const days = Math.max(0, (now - at) / DAY);
  return Math.max(0, 1 - days / c.fadeDays);
}

/** Reports of the same kind within spotM of a group's running centre join that group. Oldest first, so groups are stable. */
export function groupReports(reports, c = CONFIDENCE) {
  const groups = [];
  for (const r of [...reports].sort((a, b) => a.at - b.at || a.id - b.id)) {
    const g = groups.find((q) => q.kind === r.kind && Math.hypot(q.x - r.x, q.y - r.y) <= c.spotM);
    if (!g) { groups.push({ kind: r.kind, x: r.x, y: r.y, reports: [r] }); continue; }
    g.reports.push(r);
    g.x = g.reports.reduce((s, q) => s + q.x, 0) / g.reports.length;
    g.y = g.reports.reduce((s, q) => s + q.y, 0) / g.reports.length;
  }
  return groups;
}

/** Public off-run squares (cells "i,j" of CELL_M metres, as sent by the phones) within radius of (x, y). */
export function offRunNear(cells, x, y, radius) {
  const out = [];
  const i0 = Math.floor((x - radius) / CELL_M), i1 = Math.floor((x + radius) / CELL_M);
  const j0 = Math.floor((y - radius) / CELL_M), j1 = Math.floor((y + radius) / CELL_M);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const n = cells[`${i},${j}`];
    if (n && Math.hypot((i + 0.5) * CELL_M - x, (j + 0.5) * CELL_M - y) <= radius) out.push(n);
  }
  return out;
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Score one group of reports. `heat` is the public map-help totals ({days, runs, cells}) or null. */
export function scoreGroup(g, heat, now, c = CONFIDENCE) {
  const why = [];
  // one weight per phone: its strongest report (newest, and near the spot if any was)
  const byDevice = new Map();
  let unknown = 0, near = 0, live = 0;
  for (const r of g.reports) {
    const w0 = ageWeight(r.at, now, c);
    if (w0 <= 0) continue;
    live++;
    const isNear = Number.isFinite(r.near) && r.near <= c.nearM;
    if (isNear) near++;
    const w = w0 * (isNear ? c.nearFactor : 1);
    if (!r.dev) { unknown += w * c.unknownDevice; continue; }
    byDevice.set(r.dev, Math.max(byDevice.get(r.dev) || 0, w));
  }
  const devices = byDevice.size;
  const reportPts = [...byDevice.values()].reduce((s, w) => s + w, 0) + unknown;
  const noId = g.reports.filter((r) => !r.dev && ageWeight(r.at, now, c) > 0).length;
  why.push(`${plural(live, 'report')} in the last ${c.fadeDays} days` + (devices ? ` from ${plural(devices, 'phone')}` : '') +
    (noId ? `${devices ? ', plus ' : ', '}${plural(noId, 'report')} sent before phones had an install id` : ''));
  if (live < g.reports.length) why.push(`${plural(g.reports.length - live, 'older report')} no longer counted`);
  if (near) why.push(`${plural(near, 'report')} sent from within ${c.nearM} m of the spot`);

  // map-help evidence
  let gpsPts = 0;
  const days = heat?.days || 0;
  const runIds = [...new Set(g.reports.map((r) => r.run).filter((v) => Number.isInteger(v)))];
  if (!heat) why.push('No map-help counts available');
  else if (OFF_RUN_KINDS.has(g.kind)) {
    const sq = offRunNear(heat.cells || {}, g.x, g.y, c.offRunRadiusM);
    if (sq.length >= c.offRunCellsStrong) { gpsPts = c.offRunPoints; why.push(`Map help: ${plural(sq.length, 'square')} off the mapped runs within ${c.offRunRadiusM} m skied on ${K_ANON}+ days (up to ${Math.max(...sq)} days)`); }
    else if (sq.length) { gpsPts = c.offRunPoints / 2; why.push(`Map help: ${plural(sq.length, 'square')} off the mapped runs within ${c.offRunRadiusM} m skied on ${K_ANON}+ days`); }
    else why.push(`Map help: no squares off the runs near the spot reached ${K_ANON} ski days (${plural(days, 'ski day')} at this mountain in all)`);
  } else if (RUN_ABSENCE_KINDS.has(g.kind)) {
    if (!runIds.length) why.push('Map help: the report was not on a known run, so its ski days cannot be checked');
    else {
      const skied = runIds.map((id) => heat.runs?.[id] || 0);
      const top = Math.max(...skied);
      if (top >= K_ANON) { gpsPts = c.skiedPoints; why.push(`Map help: the run was skied on ${top} days, so it looks real`); }
      else if (days >= c.absenceMinDays) { gpsPts = c.absencePoints; why.push(`Map help: no published ski days on the run (fewer than ${K_ANON}) out of ${days} map-help ski days at this mountain`); }
      else why.push(`Map help: too few ski days at this mountain to tell (${days} of the ${c.absenceMinDays} needed)`);
    }
  } else if (g.kind === 'wrong_rating') why.push('Ratings are never judged from GPS: check against the resort\'s own trail list');

  const score = Math.round(Math.max(0, reportPts + gpsPts) * 100) / 100;
  const level = score >= c.levels.high ? 'high' : score >= c.levels.medium ? 'medium' : 'low';
  const newest = g.reports.reduce((a, r) => (r.at > a.at ? r : a), g.reports[0]);
  const named = [...g.reports].reverse().find((r) => r.name);
  const placed = [...g.reports].reverse().find((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  return {
    kind: g.kind, x: Math.round(g.x), y: Math.round(g.y),
    lat: placed?.lat ?? null, lon: placed?.lon ?? null,
    name: named?.name || '', runs: runIds,
    score, level,
    parts: { reports: Math.round(reportPts * 100) / 100, gps: gpsPts },
    reports: g.reports.map((r) => r.id), phones: devices, near, latest: newest.at,
    why,
  };
}

/** Every open problem at one mountain, highest score first. Reports past fadeDays are left out entirely. */
export function scoreProblems(reports, heat, now = Date.now(), c = CONFIDENCE) {
  const live = reports.filter((r) => (r.status || 'open') === 'open' && ageWeight(r.at, now, c) > 0);
  return groupReports(live, c).map((g) => scoreGroup(g, heat, now, c)).sort((a, b) => b.score - a.score || b.latest - a.latest);
}
