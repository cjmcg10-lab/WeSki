// Suggested map fixes from skiers' evidence, each with a confidence and an explicit safety class. Pure logic, unit tested
// (tests/map-evidence.test.js). Issue #112, step 3.
//
// Why here (worker/) and not in tools/: the daily email (worker/digest.js, inside the Worker) and the weekly tool
// (tools/map_fixes.mjs, Node) must give the same answer, and both can import a plain JavaScript module; a Python copy
// would drift. The module never edits anything: it only says what to change. The weekly tool turns "safe" suggestions
// into config changes (tools/resorts/<id>.json "way_pts"/"extra_trails" through tools/align_trails.py, and
// tools/official/<id>.json "hide"), which the Python pipeline (build_data.py, build_zones.py, verify_exists.py) applies
// at the next rebuild. Maps only change on the live site when a person rebuilds, previews and pushes them.
//
// Safety classes:
// - "safe": may be written into the configs by the weekly tool without a person deciding each one (the pull request it
//   opens is still reviewed). Two kinds only:
//   * move_line: a run's line moved a few metres onto the strip many ski days follow, and only when the aerial-photo
//     check (tools/align_trails.py, with its own safety rules) finds the cut run in the same place. Until that check has
//     run, the suggestion says check: 'photo' and nothing is written.
//   * hide_piece: hide a connecting piece that is not on the resort's trail list and that nobody skied over a whole
//     season of map help on the current map, while the runs next to it were skied.
// - "review": a person decides. Adding a whole missing run, hiding a run on the resort's list, joining runs, names, and
//   ratings. Ratings are never changed from GPS or from reports: a wrong, easier rating can send someone onto terrain
//   above their level, so they go to a person and the resort's own list.
import { K_ANON } from './evidence.js';
import { KIND_NAMES } from './confidence.js';

export const FIXES = {
  // move_line (safe once the photo agrees)
  moveMinSquares: 6,       // the strip beside the run has at least this many off-run squares...
  moveMinDays: 10,         // ...skied on at least this many days each (median)
  moveMinM: 10,            // ...lies at least this far from the drawn line (closer is inside GPS error and run width)
  moveMaxM: 60,            // ...and at most this far (tools/align_trails.py never moves more than 70 m: beyond it the strip
                           //    can be the neighbouring run)
  moveMinCover: 0.3,       // ...and is at least this share of the run's length long
  photoAgreeM: 20,         // the photo's cut run must lie within this of the skiers' strip (median), or nothing is moved

  // hide_piece (safe)
  hideMinDays: 300,        // map-help ski days at the mountain on the current map (days with an on-map share), at least
  hideMinSpanDays: 90,     // those days must span at least this many days (a whole season, not one busy week)
  hideMinLenM: 40,         // pieces shorter than this are left alone (too short to be skied through reliably by GPS)
  hideNeighbourM: 30,      // a run with a point this close to either end of the piece is its neighbour...
  hideNeighbourDays: 20,   // ...and at least one neighbour must have been skied on this many days (people are there)

  // add_run (always needs review)
  missingMinDays: 20,      // a line away from the runs, skied on at least this many days (most-skied square)...
  missingMinLengthM: 100,  // ...and at least this long

  reviewMinLevel: 'medium', // map-mistake problems at this confidence or higher become "needs review" suggestions
  maxSuggestions: 30,
};

const LEVELS = { low: 0, medium: 1, high: 2 };
const DAY = 86400e3;

/** Aerial photos tools/align_trails.py can read, by the region text in public/data/index.json. */
export function photoSource(region = '') {
  const r = String(region);
  if (/USA$/.test(r)) return 'naip';
  if (/Switzerland$/.test(r)) return 'swiss';
  if (/France$/.test(r)) return 'ign';
  if (/Austria$/.test(r)) return 'at';
  if (/Japan$/.test(r)) return 'gsi';
  return null;
}

/** Days with an on-map share after `since` (YYYY-MM-DD, the day the map went live, left out): {days, first, last, spanDays}. */
export function seasonSince(onMap = [], since = null) {
  const rows = onMap.filter((d) => !since || d.day > since);
  if (!rows.length) return { days: 0, first: null, last: null, spanDays: 0 };
  const first = rows[0].day, last = rows[rows.length - 1].day;
  return { days: rows.reduce((s, d) => s + d.days, 0), first, last, spanDays: Math.round((Date.parse(last) - Date.parse(first)) / DAY) };
}

const ends = (t) => [[t.pts[0], t.pts[1]], [t.pts[t.pts.length - 2], t.pts[t.pts.length - 1]]];
function nearLine(pts, x, y, r) {
  for (let i = 0; i < pts.length; i += 2) if (Math.abs(pts[i] - x) < r && Math.abs(pts[i + 1] - y) < r && Math.hypot(pts[i] - x, pts[i + 1] - y) <= r) return true;
  return false;
}

const runLabel = (t) => t.name || `unnamed piece (OSM way ${t.osm})`;

/**
 * Suggestions for one mountain. `ctx`: {id, heat (public totals), map (resort.json or null), problems (scored),
 * places (findGaps), photo (photoSource or null), mapSince (YYYY-MM-DD the live map was last rebuilt, or null when not
 * known: then nothing can be hidden safely)}. Returns [{key, action, safety, check?, confidence, title, target, change?,
 * evidence: [...], reasons: [...]}], safe ones first.
 */
export function suggestFixes(ctx, f = FIXES) {
  const { id, heat, map, problems = [], places = [], photo = null, mapSince = null } = ctx;
  const out = [];
  const runs = heat?.runs || {};
  const trails = (map?.trails || []).filter((t) => t.pts?.length >= 4);
  const byId = new Map(trails.map((t) => [t.id, t]));
  const used = new Set();   // problems already behind a GPS suggestion (by their first report id): not listed twice

  // 1. lines of off-run squares: a run drawn off its real line, or a missing run
  for (const p of places) {
    if (p.guess === 'wrong_place') {
      for (const r of p.reports) used.add(r.reports[0]);
      const t = byId.get(p.nearest.id);
      const evidence = [
        `${p.squares} squares off the drawn runs, ${p.lengthM} m long, skied on up to ${p.days.max} days (median ${p.days.median})`,
        `They run alongside ${t ? runLabel(t) : 'a run'} about ${p.nearest.distM} m from its drawn line (angle ${p.nearest.angleDeg}°)`,
        ...(t && Number.isFinite(runs[t.id]) ? [`The drawn run itself was skied on ${runs[t.id]} days`] : []),
        ...p.reports.map((r) => `${KIND_NAMES[r.kind] || r.kind} problem ${r.distM} m away (${r.level}, reports ${r.reports.map((n) => '#' + n).join(', ')})`),
      ];
      const reasons = [];
      if (!t) reasons.push('the run is not on the current map');
      if (p.squares < f.moveMinSquares) reasons.push(`fewer than ${f.moveMinSquares} squares`);
      if (p.days.median < f.moveMinDays) reasons.push(`squares skied on fewer than ${f.moveMinDays} days (median)`);
      if (p.nearest.distM < f.moveMinM) reasons.push(`closer than ${f.moveMinM} m: within GPS error and run width`);
      if (p.nearest.distM > f.moveMaxM) reasons.push(`more than ${f.moveMaxM} m away: may be a neighbouring run`);
      if (t?.len && p.lengthM < f.moveMinCover * t.len) reasons.push(`covers less than ${Math.round(f.moveMinCover * 100)}% of the run`);
      if (t?.glade || /glade|woods|trees|forest|wald/i.test(t?.name || '')) reasons.push('glade or tree run: strips nearby are other runs');
      if (t && !t.traced && !(t.osm < 9e9)) reasons.push('a piece made by the build, not an OpenStreetMap way: cannot be moved by config');
      if (!photo) reasons.push('no aerial photos for this country in tools/align_trails.py');
      const safe = !reasons.length;
      out.push({
        key: `move:${t?.osm ?? p.nearest.id}`, action: 'move_line', safety: safe ? 'safe' : 'review', ...(safe ? { check: 'photo' } : {}),
        confidence: safe ? (p.reports.length ? 'high' : 'medium') : 'low',
        title: `Move ${t ? runLabel(t) : 'a run'} about ${p.nearest.distM} m onto the line skiers follow`,
        target: { run: p.nearest.id, osm: t?.osm ?? null, name: t?.name || '', traced: !!t?.traced, photo, gpsLine: p.line_xy, distM: p.nearest.distM },
        ...(safe ? { change: { file: `tools/resorts/${id}.json`, key: t.traced ? 'extra_trails' : 'way_pts', how: `tools/align_trails.py ${id} ${photo} --only ${t.traced ? JSON.stringify(t.name) : 'osm:' + t.osm} --write${t.traced ? '' : ' --osm'}` } } : {}),
        evidence, reasons: safe ? ['Safe once the aerial-photo check finds the cut run within ' + f.photoAgreeM + ' m of the skiers\' strip'] : reasons,
        where: { lat: p.lat, lon: p.lon, link: p.link },
      });
    } else if (p.guess === 'missing' && p.days.max >= f.missingMinDays && p.lengthM >= f.missingMinLengthM) {
      for (const r of p.reports) used.add(r.reports[0]);
      out.push({
        key: `add:${p.x},${p.y}`, action: 'add_run', safety: 'review', confidence: p.reports.length ? 'high' : 'medium',
        title: `A run may be missing: a ${p.lengthM} m line skied on up to ${p.days.max} days`,
        target: { line_ll: p.line_ll, nearest: p.nearest },
        evidence: [
          `${p.squares} squares off the drawn runs in a line ${p.lengthM} m long, skied on up to ${p.days.max} days (median ${p.days.median})`,
          p.nearest ? `Nearest shown run: ${p.nearest.name || '(no name)'}, ${p.nearest.distM} m away` : 'No shown run nearby',
          ...p.reports.map((r) => `${KIND_NAMES[r.kind] || r.kind} problem ${r.distM} m away (${r.level})`),
        ],
        reasons: ['Adding a whole run always needs a person: check the resort\'s trail map; if it is a real run, trace it as extra_trails (rating from the resort\'s list, never from GPS)'],
        where: { lat: p.lat, lon: p.lon, link: p.link },
      });
    }
  }

  // 2. connecting pieces nobody skis (safe), and listed runs reported as not real (review)
  const season = seasonSince(heat?.onMap || [], mapSince);
  for (const t of trails) {
    if (t.hide || !t.unl || (t.len || 0) < f.hideMinLenM) continue;
    if ((runs[t.id] || 0) >= K_ANON) continue;
    const neighbours = trails.filter((o) => o !== t && !o.hide && ends(t).some(([x, y]) => nearLine(o.pts, x, y, f.hideNeighbourM)));
    const busy = neighbours.filter((o) => (runs[o.id] || 0) >= f.hideNeighbourDays);
    if (!busy.length) continue;
    const reported = problems.find((p) => ['not_real', 'closed_for_good'].includes(p.kind) && (p.runs || []).includes(t.id));
    const reasons = [];
    if (!mapSince) reasons.push('the date of the live map is not known, so the counts may mix two map builds');
    if (season.days < f.hideMinDays) reasons.push(`only ${season.days} map-help ski days with counts on the current map (needs ${f.hideMinDays})`);
    if (season.spanDays < f.hideMinSpanDays) reasons.push(`those days span ${season.spanDays} days (needs ${f.hideMinSpanDays}: a whole season)`);
    if (!(t.osm < 9e9)) reasons.push('not an OpenStreetMap way: cannot be hidden by way id');
    // only suggest once the season is long enough to say anything, or when a skier reported it
    if (reasons.length && !reported && season.days < f.hideMinDays) continue;
    const safe = !reasons.length;
    if (reported) used.add(reported.reports[0]);
    out.push({
      key: `hide:${t.osm}`, action: 'hide_piece', safety: safe ? 'safe' : 'review', confidence: safe ? (reported ? 'high' : 'medium') : 'low',
      title: `Hide ${runLabel(t)} (${t.len} m): not on the resort's list and nobody skis it`,
      target: { run: t.id, osm: t.osm, name: t.name || '', len: t.len },
      ...(safe ? { change: { file: `tools/official/${id}.json`, key: 'hide', name: `way ${t.osm}`, value: `nobody skied it on ${season.days} map-help ski days from ${season.first} to ${season.last} while ${busy.map(runLabel).slice(0, 3).join(', ')} next to it ${busy.length === 1 ? 'was' : 'were'} skied (tools/map_fixes.mjs)` } } : {}),
      evidence: [
        `Not on the resort's trail list; shown only as a connecting piece`,
        `Skied on fewer than ${K_ANON} days (nothing published) out of ${season.days} counted ski days from ${season.first || '-'} to ${season.last || '-'}`,
        `Next to it: ${busy.map((o) => `${runLabel(o)} (${runs[o.id]} days)`).slice(0, 4).join(', ')}`,
        ...(reported ? [`${KIND_NAMES[reported.kind]} problem (${reported.level}, reports ${reported.reports.map((n) => '#' + n).join(', ')})`] : []),
      ],
      reasons: safe ? ['Safe: an unlisted piece nobody uses over a whole season; the rebuild\'s connection checks must still pass'] : reasons,
    });
  }

  // 3. map-mistake problems with enough confidence: always for a person
  const ACTIONS = {
    wrong_rating: ['check_rating', 'Check the rating against the resort\'s own trail list (tools/official/<id>.json). Ratings are never changed from GPS or reports'],
    not_real: ['hide_run', 'Check the resort\'s trail map; hide it with "hide" in tools/official/<id>.json only if the resort does not show it'],
    closed_for_good: ['hide_run', 'Check the resort\'s trail list or news; hide it with "hide" in tools/official/<id>.json if it is closed for good'],
    missing: ['add_run', 'Check the resort\'s trail map; trace it as extra_trails / extra_lifts if it is real'],
    wrong_place: ['move_line', 'Look at the aerial photo (tools/align_trails.py --debug) and the trail map'],
    no_connection: ['join', 'Look at the spot: a join is a "links" entry in tools/resorts/<id>.json (at most 80 m, never uphill)'],
    wrong_name: ['rename', 'Check the resort\'s list; fix with "rename" in tools/resorts/<id>.json'],
    other: ['look', 'Read the skiers\' notes'],
  };
  for (const p of problems) {
    if (LEVELS[p.level] < LEVELS[f.reviewMinLevel]) continue;
    const [action, how] = ACTIONS[p.kind] || ACTIONS.other;
    if (used.has(p.reports[0])) continue;   // listed with its GPS suggestion above
    const listed = p.runs?.length ? byId.get(p.runs[0]) : null;
    out.push({
      key: `problem:${p.kind}:${p.reports[0]}`, action, safety: 'review', confidence: p.level,
      title: `${KIND_NAMES[p.kind] || p.kind}${p.name ? `: ${p.name}` : ''}${p.should ? ` (should be ${p.should.name})` : ''}`,
      target: { name: p.name, ref: p.ref, runs: p.runs, listed: listed ? !!listed.ok : null },
      evidence: p.why,
      reasons: [how.replace('<id>', id), ...(action === 'hide_run' && listed?.ok ? ['It is on the resort\'s trail list: hiding a listed run always needs a person'] : [])],
      where: Number.isFinite(p.lat) ? { lat: p.lat, lon: p.lon } : { x: p.x, y: p.y },
    });
  }

  const rank = (s) => (s.safety === 'safe' ? 0 : 1) * 10 + (2 - LEVELS[s.confidence]);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, f.maxSuggestions);
}

/**
 * Does the aerial-photo check agree with the skiers? `found`: the cut run's middle line found by tools/align_trails.py
 * ([[x, y], ...] map metres, its --json "found"); `gpsLine`: the skiers' strip (suggestion target.gpsLine). True when the
 * photo line, where it runs beside the strip, lies within photoAgreeM of it (median).
 */
export function photoAgrees(found, gpsLine, f = FIXES) {
  if (!found?.length || !gpsLine?.length) return false;
  const flat = gpsLine.flat();
  const d = [];
  for (const [x, y] of found) {
    let best = Infinity;
    for (let i = 0; i + 1 < flat.length; i += 2) {
      if (i + 3 < flat.length) {
        const ax = flat[i], ay = flat[i + 1], vx = flat[i + 2] - ax, vy = flat[i + 3] - ay, L = vx * vx + vy * vy;
        const t = L ? ((x - ax) * vx + (y - ay) * vy) / L : 0;
        if (t < -0.25 || t > 1.25) continue;      // beyond the strip's ends: not beside it
        const tc = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(ax + vx * tc - x, ay + vy * tc - y));
      } else if (flat.length === 2) best = Math.hypot(flat[0] - x, flat[1] - y);
    }
    if (Number.isFinite(best)) d.push(best);
  }
  if (d.length < 2) return false;
  d.sort((a, b) => a - b);
  return d[d.length >> 1] <= f.photoAgreeM;
}
