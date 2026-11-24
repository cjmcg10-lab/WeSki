// How sure are we that a reported map mistake is real? Pure logic, unit tested (tests/map-reports.test.js).
// Issue #112, step 2. The daily digest shows these scores; later, automatic fixes (step 3) will read them, so every
// number that decides anything is in CONFIDENCE below, and every problem carries the reasons for its score.
//
// What a score is made of (nothing here identifies a person):
// - Reports are grouped into problems by what they are about (groupReports): a report about a run or lift joins the
//   other reports of the same kind about that run or lift, wherever on it they were sent from; a report about no run
//   or lift (a missing run, runs that do not connect, something else off the runs) joins reports of its kind near the
//   same spot.
// - Each phone counts once per problem (phones send a random install id; the server keeps only a per-mountain hash
//   of it). Reports from before install ids existed count as CONFIDENCE.unknownDevice each.
// - A report fades in a straight line to nothing at CONFIDENCE.fadeDays old.
// - A report sent from near the spot (the phone's GPS within CONFIDENCE.nearM of the spot it reported) counts more.
// - Map help adds or takes away points, using only the public counts (squares and runs reached by at least K_ANON
//   ski days; see worker/evidence.js). Fewer than K_ANON days reads as "no published ski days", never as a number.
// - Wrong ratings: phones that agree on what the rating should be add up in full; a phone that names a different
//   rating counts for less (it agrees the rating is wrong, not on the fix). A rating is never judged from GPS.
import { CELL_M, K_ANON, RATING_SCALES } from './evidence.js';

export const CONFIDENCE = {
  // Grouping. Reports about a run or lift (they carry its OSM id or name) are one problem per kind and run or lift,
  // however far apart they were sent: a wrong rating or a run that does not exist is about the whole run, which can be
  // kilometres long. Only reports about no run or lift are grouped by spot:
  spotM: 60,              // spot reports of one kind closer than this (metres on the map) are one problem
  missingM: 150,          // ...but "a run or lift is missing" uses this wider radius: a missing run is a line, not a point

  fadeDays: 60,           // a report's weight falls in a straight line from 1 (today) to 0 at this age
  unknownDevice: 0.5,     // weight of a report with no install id (sent before phones sent one): repeats cannot be told apart
  nearM: 200,             // the reporter's GPS was within this many metres of the spot it reported when sent...
  nearFactor: 1.5,        // ...so the report counts this many times as much

  // Map help ("Help improve the maps"): only squares and runs with at least K_ANON ski days are ever used.
  offRunRadiusM: 60,      // off-run squares within this of a reported spot count for "missing" and "wrong place"
  offRunCellsStrong: 3,   // this many such squares is strong evidence; fewer (but at least one) is some evidence
  offRunPoints: 1.5,      // points for strong evidence (half for some)
  absenceMinDays: 50,     // the mountain needs this many map-help ski days before a run nobody skis means anything
  absencePoints: 1,       // "does not exist" / "closed for good" on a run with no published ski days
  skiedPoints: -1,        // "does not exist" / "closed for good" on a run skied on K_ANON or more days

  // Replies to a known problem (#112, step 5): "This spot is fine" and "It's been fixed, thanks" (kinds fine, fixed).
  // Each phone's newest reply takes away up to this many points from the problem it answers, fading and counting more
  // from near the spot like a report. One phone counts once per problem, so one person cannot cancel several phones.
  counterPoints: { fine: 1, fixed: 1 },

  ratingOtherFactor: 0.5, // wrong rating: a phone naming a different "should be" than the most-voted one counts this much

  levels: { medium: 1.5, high: 3 }, // score at or above which a problem is "medium" or "high" confidence
};

// Which kinds map-help evidence can speak to. A wrong rating is never judged from GPS: it goes to a person and the
// resort's own trail list (a wrong, easier rating can send someone onto terrain above their level).
const OFF_RUN_KINDS = new Set(['missing', 'wrong_place']);
const RUN_ABSENCE_KINDS = new Set(['not_real', 'closed_for_good']);
// Kinds that are about a place, never about the run the pin happens to sit on, with the CONFIDENCE key of their radius.
const SPOT_KINDS = { missing: 'missingM', no_connection: 'spotM' };
// Replies to a problem, not problems (worker/evidence.js COUNTER_KINDS). They carry `about`: the problem's kind.
const COUNTER_KINDS = new Set(['fine', 'fixed']);
const DAY = 86400e3;

export const KIND_NAMES = {
  missing: 'Run or lift missing', not_real: 'Run does not exist', wrong_rating: 'Wrong rating',
  wrong_place: 'Drawn in the wrong place', closed_for_good: 'Closed for good', wrong_name: 'The name is wrong',
  no_connection: 'Runs or lifts don\'t connect here', other: 'Something else',
  fine: 'Reply: this spot is fine', fixed: 'Reply: it has been fixed',
};

/** The name of a "should be" rating: 'Black', or for a colour resort 'Red'. */
export const ratingName = (scale, v) => (RATING_SCALES[scale || 'us'] || RATING_SCALES.us)[v] ?? String(v);

/**
 * What a report is about, as keys that identify its run or lift: the OSM id (`ref`) and the name. Empty for kinds that
 * are always about a spot, and for reports on no run or lift. Run numbers (`run`) are never used: they change between
 * map builds. Phones before 2026-11-24 sent the run number as `ref` when a run had no OSM id; such a small number is
 * skipped (OSM way ids of ski runs are far larger) and the name still groups those reports.
 */
export function thingKeys(r) {
  // a reply ("fine", "fixed") is about what its problem is about, so it is keyed by the problem's kind
  if (SPOT_KINDS[r.about || r.kind]) return [];
  const keys = [];
  const ref = String(r.ref || '').trim();
  const lift = ref.startsWith('lift:');
  if (lift) keys.push(ref.toLowerCase());
  else if (/^\d+$/.test(ref)) { if (Number(ref) >= 100000) keys.push('osm:' + ref); }
  else if (ref) keys.push('ref:' + ref.toLowerCase());
  const name = String(r.name || '').trim().toLowerCase();
  if (name) keys.push((lift ? 'liftname:' : 'name:') + name);
  return keys;
}

/** 1 for a report sent now, falling to 0 at fadeDays old. */
export function ageWeight(at, now, c = CONFIDENCE) {
  const days = Math.max(0, (now - at) / DAY);
  return Math.max(0, 1 - days / c.fadeDays);
}

/**
 * Problems from reports, oldest first so groups are stable:
 * - about a run or lift: same kind and the same run or lift (any shared key from thingKeys, the OSM id or the name, so
 *   a run OpenStreetMap draws as several ways with one name is still one run);
 * - otherwise: same kind, within the kind's radius (CONFIDENCE.missingM or spotM) of the group's running centre.
 */
export function groupReports(reports, c = CONFIDENCE) {
  const groups = [];
  const centre = (g) => {
    g.x = g.reports.reduce((s, q) => s + q.x, 0) / g.reports.length;
    g.y = g.reports.reduce((s, q) => s + q.y, 0) / g.reports.length;
  };
  for (const r of [...reports].sort((a, b) => a.at - b.at || a.id - b.id)) {
    const keys = thingKeys(r);
    if (keys.length) {
      // one report can show that two groups are the same run (one known by its OSM id, the other by its name)
      const hits = groups.filter((q) => q.by === 'thing' && q.kind === r.kind && keys.some((k) => q.keys.has(k)));
      const g = hits[0] || { kind: r.kind, by: 'thing', keys: new Set(), reports: [] };
      if (!hits.length) groups.push(g);
      for (const o of hits.slice(1)) {
        g.reports.push(...o.reports);
        o.keys.forEach((k) => g.keys.add(k));
        groups.splice(groups.indexOf(o), 1);
      }
      keys.forEach((k) => g.keys.add(k));
      g.reports.push(r);
      g.reports.sort((a, b) => a.at - b.at || a.id - b.id);
      centre(g);
      continue;
    }
    const radius = c[SPOT_KINDS[r.kind] || 'spotM'];
    const g = groups.find((q) => q.by === 'spot' && q.kind === r.kind && Math.hypot(q.x - r.x, q.y - r.y) <= radius);
    if (!g) { groups.push({ kind: r.kind, by: 'spot', radius, x: r.x, y: r.y, reports: [r] }); continue; }
    g.reports.push(r);
    centre(g);
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

/** Off-run squares near any of the given spots, each square once (a problem about a long run has several spots). */
function offRunNearAny(cells, spots, radius) {
  const seen = new Map();
  for (const { x, y } of spots) {
    const i0 = Math.floor((x - radius) / CELL_M), i1 = Math.floor((x + radius) / CELL_M);
    const j0 = Math.floor((y - radius) / CELL_M), j1 = Math.floor((y + radius) / CELL_M);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = `${i},${j}`, n = cells[k];
      if (n && Math.hypot((i + 0.5) * CELL_M - x, (j + 0.5) * CELL_M - y) <= radius) seen.set(k, n);
    }
  }
  return [...seen.values()];
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/**
 * Wrong-rating votes: each phone's newest "should be" (reports without an install id count one each). Returns null when
 * no report in the group carries one, else {scale, top, agree, votes: [[value, phones], ...] most first}.
 */
export function ratingVotes(reports) {
  const latest = new Map();
  let anon = 0;
  for (const r of [...reports].sort((a, b) => a.at - b.at || a.id - b.id)) {
    if (!Number.isInteger(r.should)) continue;
    latest.set(r.dev || `anon${anon++}`, r);
  }
  if (!latest.size) return null;
  const count = new Map();
  for (const r of latest.values()) count.set(r.should, (count.get(r.should) || 0) + 1);
  // most phones first; on a tie the harder rating first (a harder rating is the safer one to look at)
  const votes = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const scale = [...latest.values()].at(-1).scale || 'us';
  return { scale, top: votes[0][0], agree: votes[0][1], votes };
}

/** "3 phones say Black, 1 says Blue" */
export function votesText(v) {
  return v.votes.map(([val, n], i) => `${i === 0 ? plural(n, 'phone') : n} ${n === 1 ? 'says' : 'say'} ${ratingName(v.scale, val)}`).join(', ');
}

/**
 * The replies ("fine", "fixed") that answer one problem: same problem kind (`about`), and the same run or lift (a shared
 * key) for a problem about a run or lift, or within the problem's radius of its centre for a problem about a spot.
 */
export function repliesFor(g, replies) {
  return replies.filter((r) => {
    if (r.about !== g.kind) return false;
    const keys = thingKeys(r);
    if (g.by === 'thing') return keys.some((k) => g.keys.has(k));
    return !keys.length && Math.hypot(g.x - r.x, g.y - r.y) <= g.radius;
  });
}

/** Score one group of reports. `heat` is the public map-help totals ({days, runs, cells}) or null. `replies`: the
 *  "fine"/"fixed" replies that answer it (repliesFor). */
export function scoreGroup(g, heat, now, c = CONFIDENCE, replies = []) {
  const why = [];
  const votes = g.kind === 'wrong_rating' ? ratingVotes(g.reports.filter((r) => ageWeight(r.at, now, c) > 0)) : null;
  // one weight per phone: its strongest report (newest, and near the spot if any was)
  const byDevice = new Map();
  // each phone's newest reply; a phone whose reply is newer than its own report has changed its mind: its report no
  // longer counts. Replies always carry an install id (the server refuses one without).
  const reply = new Map();
  for (const r of replies) {
    if (!r.dev || ageWeight(r.at, now, c) <= 0) continue;
    if (!reply.has(r.dev) || r.at >= reply.get(r.dev).at) reply.set(r.dev, r);
  }
  const lastReport = new Map();
  for (const r of g.reports) if (r.dev) lastReport.set(r.dev, Math.max(lastReport.get(r.dev) || 0, r.at));
  for (const [dev, r] of [...reply]) if ((lastReport.get(dev) || 0) > r.at) reply.delete(dev);
  let unknown = 0, near = 0, live = 0;
  for (const r of g.reports) {
    const w0 = ageWeight(r.at, now, c);
    if (w0 <= 0) continue;
    live++;
    const isNear = Number.isFinite(r.near) && r.near <= c.nearM;
    if (isNear) near++;
    // a wrong-rating report naming another rating than the most-voted one agrees only that the rating is wrong
    const other = votes && Number.isInteger(r.should) && r.should !== votes.top;
    const w = w0 * (isNear ? c.nearFactor : 1) * (other ? c.ratingOtherFactor : 1);
    if (!r.dev) { unknown += w * c.unknownDevice; continue; }
    if (reply.has(r.dev)) continue;
    byDevice.set(r.dev, Math.max(byDevice.get(r.dev) || 0, w));
  }
  const devices = byDevice.size;
  let replyPts = 0;
  const replyCount = { fine: 0, fixed: 0 };
  for (const r of reply.values()) {
    const isNear = Number.isFinite(r.near) && r.near <= c.nearM;
    replyPts += ageWeight(r.at, now, c) * (isNear ? c.nearFactor : 1) * (c.counterPoints[r.kind] || 0);
    replyCount[r.kind] = (replyCount[r.kind] || 0) + 1;
  }
  replyPts = Math.round(replyPts * 100) / 100;
  const reportPts = [...byDevice.values()].reduce((s, w) => s + w, 0) + unknown;
  const noId = g.reports.filter((r) => !r.dev && ageWeight(r.at, now, c) > 0).length;
  why.push(`${plural(live, 'report')} in the last ${c.fadeDays} days` + (devices ? ` from ${plural(devices, 'phone')}` : '') +
    (noId ? `${devices ? ', plus ' : ', '}${plural(noId, 'report')} sent before phones had an install id` : ''));
  if (live < g.reports.length) why.push(`${plural(g.reports.length - live, 'older report')} no longer counted`);
  if (g.by === 'thing' && g.reports.length > 1) {
    const far = Math.max(...g.reports.flatMap((a) => g.reports.map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
    if (far > c.spotM) why.push(`Grouped by the ${[...g.keys].some((k) => k.startsWith('lift')) ? 'lift' : 'run'}: reports sent up to ${Math.round(far)} m apart along it`);
  }
  if (near) why.push(`${plural(near, 'report')} sent from within ${c.nearM} m of the spot`);
  if (reply.size) {
    const said = [replyCount.fine && `${plural(replyCount.fine, 'phone')} ${replyCount.fine === 1 ? 'says' : 'say'} the spot is fine`,
      replyCount.fixed && `${plural(replyCount.fixed, 'phone')} ${replyCount.fixed === 1 ? 'says' : 'say'} it has been fixed`].filter(Boolean);
    why.push(`${said.join(', ')} (-${replyPts})`);
  }
  if (votes) why.push(`It should be ${ratingName(votes.scale, votes.top)}: ${votesText(votes)}`);

  // map-help evidence
  let gpsPts = 0;
  const days = heat?.days || 0;
  const runIds = [...new Set(g.reports.map((r) => r.run).filter((v) => Number.isInteger(v)))];
  if (!heat) why.push('No map-help counts available');
  else if (OFF_RUN_KINDS.has(g.kind)) {
    const sq = offRunNearAny(heat.cells || {}, g.reports, c.offRunRadiusM);
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

  const score = Math.round(Math.max(0, reportPts + gpsPts - replyPts) * 100) / 100;
  const level = score >= c.levels.high ? 'high' : score >= c.levels.medium ? 'medium' : 'low';
  const newest = g.reports.reduce((a, r) => (r.at > a.at ? r : a), g.reports[0]);
  const named = [...g.reports].reverse().find((r) => r.name);
  const placed = [...g.reports].reverse().find((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  const refd = [...g.reports].reverse().find((r) => r.ref);
  return {
    kind: g.kind, by: g.by, x: Math.round(g.x), y: Math.round(g.y),
    lat: placed?.lat ?? null, lon: placed?.lon ?? null,
    name: named?.name || '', ref: g.by === 'thing' ? refd?.ref || '' : '', lift: g.by === 'thing' && [...g.keys].some((k) => k.startsWith('lift')),
    runs: runIds,
    should: votes ? { scale: votes.scale, top: votes.top, name: ratingName(votes.scale, votes.top), agree: votes.agree, votes: votes.votes } : null,
    score, level,
    parts: { reports: Math.round(reportPts * 100) / 100, gps: gpsPts, replies: replyPts ? -replyPts : 0 },
    reports: g.reports.map((r) => r.id), phones: devices, near, latest: newest.at,
    // for the phone's "N other skiers reported this" (src/reportmatch.js): how many phones and older reports still
    // count, what the problem is about (OSM ids and names, already public in the report list) and a spot's radius
    people: devices + noId, keys: g.by === 'thing' ? [...g.keys] : [], radius: g.by === 'spot' ? g.radius : null,
    replies: { fine: replyCount.fine, fixed: replyCount.fixed, ids: replies.map((r) => r.id) },
    why,
  };
}

/** Every open problem at one mountain, highest score first. Reports past fadeDays are left out entirely. */
export function scoreProblems(reports, heat, now = Date.now(), c = CONFIDENCE) {
  const live = reports.filter((r) => (r.status || 'open') === 'open' && ageWeight(r.at, now, c) > 0);
  const replies = live.filter((r) => COUNTER_KINDS.has(r.kind));
  const problems = live.filter((r) => !COUNTER_KINDS.has(r.kind));
  return groupReports(problems, c).map((g) => scoreGroup(g, heat, now, c, repliesFor(g, replies))).sort((a, b) => b.score - a.score || b.latest - a.latest);
}
