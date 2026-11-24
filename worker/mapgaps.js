// Where do skiers leave the drawn map? Pure logic, unit tested (tests/map-evidence.test.js). Issue #112.
//
// Input: the public map-help counts (worker/evidence.js publicTotals: only 20 m squares skied OFF the shown runs on at
// least K_ANON different ski days), the mountain's map (resort.json: trails in map metres, and "proj" to turn map
// metres into lat/lon) and the scored problems (worker/confidence.js). Output: groups of neighbouring off-run squares
// ("places"), each with its size, its ski days, whether it forms a line (likely a missing run, or a run drawn off its
// real line), the nearest shown run and how far it is, map-mistake problems nearby, and a lat/lon with a map link.
//
// Used by the daily email (worker/digest.js) and by the weekly tool tools/map_fixes.mjs (through worker/mapfixes.js).
// Every number that decides anything is in GAPS.
import { CELL_M } from './evidence.js';

export const GAPS = {
  linkCells: 2,          // squares at most this many squares apart (each way) belong to one place: GPS points are a
                         // second or more apart, so a fast skier leaves gaps of a square between the squares skied
  minCells: 3,           // a place needs at least this many squares (fewer is GPS noise beside a run)
  lineMinLengthM: 80,    // a place is a "line" when it is at least this long...
  lineRatio: 2.5,        // ...and this many times longer than it is wide
  reportM: 100,          // a missing / wrong-place / no-connection problem within this of any square is "nearby"
  nearRunSearchM: 400,   // runs further than this from every square are not looked at for "nearest run"
  alongsideM: 60,        // a line whose squares lie (median) within this of one run, running the same way...
  alongsideDeg: 30,      // ...within this angle, looks like that run drawn off its real line ("wrong place")
  centrelineStepM: 40,   // the place's middle line has a point every this many metres
  maxPlaces: 50,         // at most this many places are returned (the biggest first)
};

const REPORT_KINDS = new Set(['missing', 'wrong_place', 'no_connection']);

// ---------------------------------------------------------------- map helpers
const basis = (a, b) => [1, a, b, a * a, a * b, b * b, a * a * a, a * a * b, a * b * b, b * b * b];
const dot = (c, v) => c.reduce((s, k, i) => s + k * v[i], 0);

/** Map metres -> [lat, lon] with resort.json's fitted "proj" (the same sums as src/geo.js), or null without one. */
export function toLatLon(proj, x, y) {
  if (!proj?.clat) return null;
  const v = basis(x - proj.xm, y - proj.ym);
  return [proj.lat0 + dot(proj.clat, v), proj.lon0 + dot(proj.clon, v)];
}

export const osmLink = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=17/${lat.toFixed(5)}/${lon.toFixed(5)}`;

/** Distance from (x, y) to a flat [x0, y0, x1, y1, ...] line, and the line's direction (radians) at the nearest point. */
export function lineDist(pts, x, y) {
  let best = Infinity, dir = 0;
  if (pts.length < 4) return { d: pts.length >= 2 ? Math.hypot(pts[0] - x, pts[1] - y) : Infinity, dir };
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], vx = pts[i + 2] - ax, vy = pts[i + 3] - ay;
    const L = vx * vx + vy * vy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0;
    const d = Math.hypot(ax + vx * t - x, ay + vy * t - y);
    if (d < best) { best = d; dir = Math.atan2(vy, vx); }
  }
  return { d: best, dir };
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((p, q) => p - q), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The runs a skier sees: not hidden (verify_exists.py marks "hide"). Each with its bounding box. */
export function shownRuns(map) {
  return (map?.trails || []).filter((t) => !t.hide && t.pts?.length >= 2).map((t) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < t.pts.length; i += 2) {
      x0 = Math.min(x0, t.pts[i]); x1 = Math.max(x1, t.pts[i]); y0 = Math.min(y0, t.pts[i + 1]); y1 = Math.max(y1, t.pts[i + 1]);
    }
    return { t, box: [x0, y0, x1, y1] };
  });
}

// ---------------------------------------------------------------- grouping squares into places
/** Groups of neighbouring squares: [[{i, j, n}, ...], ...]. `cells` is {"i,j": ski days}. */
export function groupCells(cells, g = GAPS) {
  const all = new Map();
  for (const [k, n] of Object.entries(cells || {})) {
    const [i, j] = k.split(',').map(Number);
    if (Number.isInteger(i) && Number.isInteger(j)) all.set(k, { i, j, n });
  }
  const seen = new Set(), groups = [];
  for (const [k, c] of all) {
    if (seen.has(k)) continue;
    seen.add(k);
    const group = [c], stack = [c];
    while (stack.length) {
      const p = stack.pop();
      for (let di = -g.linkCells; di <= g.linkCells; di++) for (let dj = -g.linkCells; dj <= g.linkCells; dj++) {
        const kk = `${p.i + di},${p.j + dj}`;
        const q = all.get(kk);
        if (q && !seen.has(kk)) { seen.add(kk); group.push(q); stack.push(q); }
      }
    }
    groups.push(group);
  }
  return groups;
}

/** The shape of a group of squares: centre, main direction, length and width (metres), and its middle line. */
export function shapeOf(group, g = GAPS) {
  const P = group.map((c) => [(c.i + 0.5) * CELL_M, (c.j + 0.5) * CELL_M]);
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of P) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  const dir = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(dir), uy = Math.sin(dir);
  const along = P.map(([x, y]) => (x - cx) * ux + (y - cy) * uy);
  const across = P.map(([x, y]) => -(x - cx) * uy + (y - cy) * ux);
  const lengthM = Math.max(...along) - Math.min(...along) + CELL_M;
  const widthM = Math.max(...across) - Math.min(...across) + CELL_M;
  // middle line: squares binned along the main direction, the mean position of each bin
  const lo = Math.min(...along), bins = new Map();
  P.forEach((p, k) => {
    const b = Math.floor((along[k] - lo) / g.centrelineStepM);
    const e = bins.get(b) || bins.set(b, [0, 0, 0]).get(b);
    e[0] += p[0]; e[1] += p[1]; e[2]++;
  });
  const line = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => [Math.round(e[0] / e[2]), Math.round(e[1] / e[2])]);
  return { x: cx, y: cy, dir, lengthM, widthM, line, points: P };
}

/** The shown run nearest to a place: {t, distM (median over its squares), minM, alongside, angleDeg} or null. */
export function nearestRun(points, dir, runs, g = GAPS) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const R = g.nearRunSearchM;
  let best = null;
  for (const { t, box } of runs) {
    if (box[0] > x1 + R || box[2] < x0 - R || box[1] > y1 + R || box[3] < y0 - R) continue;
    const ds = points.map(([x, y]) => lineDist(t.pts, x, y));
    const distM = median(ds.map((q) => q.d));
    if (distM > R || (best && distM >= best.distM)) continue;
    // angle between the place's main direction and the run's direction where it is closest (lines have no arrow)
    const runDir = ds.reduce((a, q) => (q.d < a.d ? q : a), ds[0]).dir;
    let ang = Math.abs(((runDir - dir) * 180) / Math.PI) % 180;
    if (ang > 90) ang = 180 - ang;
    best = { t, distM, minM: Math.min(...ds.map((q) => q.d)), angleDeg: ang };
  }
  return best;
}

/**
 * Places where skiers leave the map, biggest first. `heat`: public map-help totals ({cells, k}); `map`: resort.json
 * (or null: then no nearest run and no lat/lon); `problems`: scored problems from worker/confidence.js (optional).
 */
export function findGaps(heat, map, problems = [], g = GAPS) {
  const runs = shownRuns(map);
  const nearbyKinds = (problems || []).filter((p) => REPORT_KINDS.has(p.kind));
  const places = [];
  for (const group of groupCells(heat?.cells, g)) {
    if (group.length < g.minCells) continue;
    const s = shapeOf(group, g);
    const days = group.map((c) => c.n);
    const line = s.lengthM >= g.lineMinLengthM && s.lengthM / s.widthM >= g.lineRatio;
    const near = runs.length ? nearestRun(s.points, s.dir, runs, g) : null;
    const alongside = !!(line && near && near.distM <= g.alongsideM && near.angleDeg <= g.alongsideDeg);
    const reports = nearbyKinds.map((p) => {
      const d = Math.min(...s.points.map(([x, y]) => Math.hypot(x - p.x, y - p.y)));
      return d <= g.reportM ? { kind: p.kind, level: p.level, score: p.score, distM: Math.round(d), reports: p.reports } : null;
    }).filter(Boolean);
    const ll = toLatLon(map?.proj, s.x, s.y);
    places.push({
      squares: group.length,
      lengthM: Math.round(s.lengthM), widthM: Math.round(s.widthM),
      days: { max: Math.max(...days), median: median(days) },
      line,
      // what it most likely is: a run drawn off its line (a line alongside a shown run), a missing run (a line away from
      // the runs), or not clear (a patch: a wide slope, a meeting spot, a line too short to say)
      guess: alongside ? 'wrong_place' : line ? 'missing' : 'unclear',
      x: Math.round(s.x), y: Math.round(s.y),
      lat: ll ? Math.round(ll[0] * 1e5) / 1e5 : null, lon: ll ? Math.round(ll[1] * 1e5) / 1e5 : null,
      link: ll ? osmLink(ll[0], ll[1]) : null,
      line_xy: s.line,
      line_ll: map?.proj ? s.line.map(([x, y]) => toLatLon(map.proj, x, y)).map(([la, lo]) => [Math.round(lo * 1e6) / 1e6, Math.round(la * 1e6) / 1e6]) : null,
      nearest: near ? {
        id: near.t.id, osm: near.t.osm ?? null, name: near.t.name || '', unl: !!near.t.unl, traced: !!near.t.traced,
        glade: !!near.t.glade, len: near.t.len ?? null, distM: Math.round(near.distM), minM: Math.round(near.minM), angleDeg: Math.round(near.angleDeg),
      } : null,
      reports,
    });
  }
  // lines first, then by squares times ski days
  places.sort((a, b) => (b.line - a.line) || (b.squares * b.days.median - a.squares * a.days.median));
  return places.slice(0, g.maxPlaces);
}

/** One line of text for a place, for the email and the weekly report. */
export function placeText(p) {
  const what = p.guess === 'wrong_place' ? `alongside ${p.nearest.name || 'an unnamed run'}: maybe drawn off its real line`
    : p.guess === 'missing' ? 'a line away from the runs: maybe a missing run' : 'a patch, not a line';
  const near = p.nearest ? `nearest shown run ${p.nearest.name || '(no name)'} ${p.nearest.distM} m away` : 'nearest run not known';
  const reps = p.reports.length ? `; ${p.reports.length} map-mistake ${p.reports.length === 1 ? 'problem' : 'problems'} nearby (${p.reports.map((r) => r.kind).join(', ')})` : '';
  return `${p.squares} squares, ${p.lengthM} m long, ${what}; skied on up to ${p.days.max} days (median ${p.days.median}); ${near}${reps}`;
}
