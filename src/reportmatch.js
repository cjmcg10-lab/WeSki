// "N other skiers reported this" and the quick replies on a pin (issue #112, step 5). Pure, unit tested in
// tests/map-reports.test.js. The problems come from the server's public list (GET /api/reports/<id>/problems,
// worker/confidence.js); matching uses the server's own thingKeys, so the phone finds exactly the problem a report or
// reply from here would join: same kind and the same run or lift (OSM id or name), or, for a problem about a spot,
// within that problem's radius.
import { thingKeys } from '../worker/confidence.js';

/** Does a report of `kind` about `ref`/`name` at (x, y) join problem `p`? */
export function joins(p, { kind, ref, name, x, y }) {
  if (!p || p.kind !== kind) return false;
  const keys = thingKeys({ kind, ref, name });
  if (keys.length) return p.by === 'thing' && keys.some((k) => (p.keys || []).includes(k));
  return p.by === 'spot' && Math.hypot(p.x - x, p.y - y) <= (p.radius || 60);
}

/** The open problem a new report would join, or null. Only problems someone still counts for (people > 0). */
export function matchProblem(problems, target) {
  return (problems || []).find((p) => p.people > 0 && joins(p, target)) || null;
}

/** Problems a reply from the pin would answer: any kind, about the run or lift at the pin, or a spot problem near it.
 *  Most certain first, at most `max`. */
export function problemsAt(problems, { ref, name, x, y }, max = 3) {
  return (problems || []).filter((p) => p.people > 0 && joins(p, { kind: p.kind, ref, name, x, y })).slice(0, max);
}

/** Did this phone already send a matching report? `mine`: [{kind, ref, name, x, y, at}] kept on the phone only. */
export function sentByMe(mine, problem, maxAgeMs = 60 * 86400e3, now = Date.now()) {
  return (mine || []).some((m) => now - (m.at || 0) < maxAgeMs && joins(problem, m));
}
