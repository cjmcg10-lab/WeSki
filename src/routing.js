// Directions over the verified network: trails (downhill, or a short way back up), lifts,
// walking connections and short cut-acrosses between neighbouring trails. Honors the skier's maximum difficulty and confirmed closures.
import { nearestOnLine, lineLength, sliceLine } from './geo.js';

export const DIFF_NAMES = ['Green', 'Blue', 'Black', 'Double black'];
const SKI_SPEED = [6, 8, 7, 5];     // m/s by difficulty (harder terrain is skied slower)
const WALK_SPEED = 1.2;
const LINK_SPEED = 2.5;             // short skate/slide between adjacent trails or off a lift
const LIFT_WAIT = 150;              // seconds of queueing + loading
const OVER_PENALTY = 30;            // trails above the skier's limit cost 30x: used only to get off them, or when nothing else works
export const SNAP_MAX = 250;        // further than this from every trail/lift/walkway = off the network
export const WALK_MAX = 1000;       // directions walk off the trails this far, to a building, a pin or a friend
const OFF_SLACK = 20;               // closer than this to a trail is GPS error, not a walk
const WALK_CLIMB = 6;               // seconds per metre climbed on foot
const WALK_COST = 2;                // a walk in ski boots counts double, so the route keeps to the trails where it can

// ---- self-powered moves: going back up a trail, or cutting across to a neighbouring one ----
// Every such move is scored in effort-time: real seconds times a multiplier that grows with
// steepness, with the rating of the trail you are on, and with how steep the hill falls away
// beside a traverse. The tolerance setting scales the multipliers and moves the cut-offs.
const UP_BANDS = [0.03, 0.08, 0.15, 0.20];   // uphill grade (rise / run) band limits
const UP_SPEED = [2, 1, 0.4, 0.3];           // m/s: glide or skate, pole hard, sidestep, boot-pack
export const TOLERANCE = {
  low:    { label: 'Low',    mult: [1.5, 4, Infinity, Infinity], side: 20, cap: 10, rate: [1, 1, 1.5, Infinity] },
  normal: { label: 'Normal', mult: [1, 2, 3, Infinity],          side: 25, cap: 25, rate: [1, 1, 1.5, 2] },
  high:   { label: 'High',   mult: [1, 1.5, 2, 3],               side: 30, cap: 50, rate: [1, 1, 1.5, 2] },
};
// 'none' is the old behaviour (downhill only), kept for comparison in tests
TOLERANCE.none = { label: 'Off', mult: [Infinity, Infinity, Infinity, Infinity], side: -1, cap: 0, rate: [1, 1, 1, 1] };
export const GRADE_NAMES = ['easy skate', 'moderate climb', 'steep sidestep', 'short boot-pack'];
const JUNCTION_RISE = 2;     // steeper than the cut-off is still fine for a step or two up to a junction
const DOWN_MAX = 0.25;       // a cut-across never drops steeper than this (unmapped ground)
const PIECE = 40;            // trails are split into pieces about this long so moves can start mid-trail
const CROSS_MAX = 70;        // furthest gap between two trails that a cut-across may bridge
const ROUGH_MAX = 5;         // a gully or ridge this far off the straight line rules a cut-across out
const NEAR_START = 45;       // other trails this close to where you stand can be started on directly

/** Effort of one self-powered stretch: {t: seconds, c: effort-seconds, up: metres climbed, band} or null if not offered. */
function effort(len, rise, T) {
  if (len <= 0) return { t: 0, c: 0, up: 0, band: -1 };
  const g = rise / len;
  if (g <= 0) { const t = len / LINK_SPEED; return { t, c: t, up: 0, band: -1 }; }
  let band = UP_BANDS.findIndex((b) => g < b);
  if (band < 0) band = 3;
  let mult = g >= UP_BANDS[3] ? Infinity : T.mult[band];
  if (!isFinite(mult)) {
    if (rise > JUNCTION_RISE) return null;
    mult = 4;
  }
  const t = len / UP_SPEED[band];
  return { t, c: t * mult, up: rise, band };
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = [k[0], v[0]], key = k.pop(), val = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = key; v[i] = val;
    }
    return top;
  }
}

export class Router {
  /** @param resort parsed resort.json  @param geo optional terrain (enables cut-across moves between trails) */
  constructor(resort, geo = null) {
    this.resort = resort;
    this.geo = geo;
    this.nodes = resort.graph.nodes.map((n) => n.slice());
    this.edges = [];
    for (const e of resort.graph.edges) this._addPieces(e);
    if (geo) this._addCrossings();
    this.out = this.nodes.map(() => []);
    this.edges.forEach((e, i) => {
      this.out[e.a].push({ e: i, to: e.b, rev: false });
      this.out[e.b].push({ e: i, to: e.a, rev: true });   // whether a reverse move is allowed is decided by leg()
    });
  }

  /** Split a trail edge into short pieces so climbing back or cutting across can start part-way down it. */
  _addPieces(e) {
    const total = lineLength(e.pts);
    if (e.k !== 'p' || total < PIECE * 1.5) { this.edges.push(e); return; }
    const n = Math.round(total / PIECE), k = e.len / total;
    let a = e.a, from = 0;
    for (let i = 1; i <= n; i++) {
      const to = i === n ? total : (total * i) / n;
      const pts = sliceLine(e.pts, from, to);
      let b = e.b;
      if (i < n) {
        const x = pts[pts.length - 2], y = pts[pts.length - 1];
        const za = this.nodes[e.a][2], zb = this.nodes[e.b][2];
        b = this.nodes.push([x, y, this.geo ? this.geo.elev(x, y) : za + (zb - za) * (to / total)]) - 1;
      }
      this.edges.push({ a, b, k: 'p', r: e.r, len: (to - from) * k, bi: false, pts });
      a = b; from = to;
    }
  }

  /** Terrain along a straight line: climb pieces, steepest side slope (degrees) and how far it strays from an even grade. */
  _profile(x0, y0, x1, y1) {
    const geo = this.geo, len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / 8)), ux = (x1 - x0) / (len || 1), uy = (y1 - y0) / (len || 1);
    const z = [];
    let side = 0, rough = 0;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      z.push(geo.elev(x, y));
      side = Math.max(side, Math.abs(geo.elev(x - uy * 7, y + ux * 7) - geo.elev(x + uy * 7, y - ux * 7)) / 14);
    }
    for (let i = 0; i <= n; i++) rough = Math.max(rough, Math.abs(z[i] - (z[0] + ((z[n] - z[0]) * i) / n)));
    return { len, z, side: (Math.atan(side) * 180) / Math.PI, rough };
  }

  /** Effort of crossing open ground along a profile, in the given direction. */
  _crossEffort(prof, rev, T) {
    if (prof.side > T.side || prof.rough > ROUGH_MAX) return null;
    const n = prof.z.length - 1, piece = prof.len / n;
    let t = 0, c = 0, up = 0, band = -1;
    for (let i = 0; i < n; i++) {
      const rise = rev ? prof.z[i] - prof.z[i + 1] : prof.z[i + 1] - prof.z[i];
      if (rise / piece < -DOWN_MAX && piece > 0) return null;
      const m = effort(piece, rise, T);
      if (!m) return null;
      t += m.t; c += m.c; up += m.up; band = Math.max(band, m.band);
    }
    // a traverse across a steep face is hard work even when it is level
    return { t, c: c * (1 + prof.side / 25), up, band };
  }

  /** Add cut-across links between neighbouring trails wherever the ground between them allows it. */
  _addCrossings() {
    const T = TOLERANCE.high, cell = CROSS_MAX, grid = new Map(), trailOf = new Map();
    const key = (r) => this.resort.trails[r].name || `#${r}`;
    for (const e of this.edges) if (e.k === 'p') for (const n of [e.a, e.b]) {
      if (!trailOf.has(n)) trailOf.set(n, new Set());
      trailOf.get(n).add(e.r);
    }
    for (const n of trailOf.keys()) {
      const g = `${Math.floor(this.nodes[n][0] / cell)},${Math.floor(this.nodes[n][1] / cell)}`;
      if (!grid.has(g)) grid.set(g, []);
      grid.get(g).push(n);
    }
    const linked = new Set(this.edges.map((e) => (e.a < e.b ? `${e.a},${e.b}` : `${e.b},${e.a}`)));
    for (const [n, refs] of trailOf) {
      const [x, y] = this.nodes[n], mine = new Set([...refs].map(key));
      const best = new Map();   // neighbouring trail name -> nearest node on it
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
        for (const o of grid.get(`${Math.floor(x / cell) + gx},${Math.floor(y / cell) + gy}`) || []) {
          if (o === n) continue;
          const d = Math.hypot(this.nodes[o][0] - x, this.nodes[o][1] - y);
          if (d > CROSS_MAX || d < 3) continue;
          const names = [...trailOf.get(o)].map(key);
          if (names.some((nm) => mine.has(nm))) continue;   // same trail: just ski it
          for (const nm of names) if (!best.has(nm) || d < best.get(nm).d) best.set(nm, { o, d });
        }
      }
      for (const { o } of best.values()) {
        const id = n < o ? `${n},${o}` : `${o},${n}`;
        if (linked.has(id)) continue;
        linked.add(id);
        const prof = this._profile(x, y, this.nodes[o][0], this.nodes[o][1]);
        if (!this._crossEffort(prof, false, T) && !this._crossEffort(prof, true, T)) continue;
        const d = Math.max(...[...refs, ...trailOf.get(o)].map((r) => this.level(r)));
        this.edges.push({ a: n, b: o, k: 'v', r: -1, d, len: prof.len, bi: true, prof, pts: [x, y, this.nodes[o][0], this.nodes[o][1]] });
      }
    }
  }

  /** Confirmed closures are the only hard block. opts: {maxDiff, closed:Set<'t12'|'l3'>, tol} */
  blocked(e, opts) {
    if (e.k === 'p' && opts.closed?.has('t' + e.r)) return 'closed';
    if (e.k === 'l' && opts.closed?.has('l' + e.r)) return 'closed';
    return null;
  }

  /**
   * The level a trail counts as against the skier's limit. A run with no rating in the map data
   * (its drawn level is a guess) counts one level harder, so a guess never sends anyone down
   * something above their limit.
   */
  level(r) {
    const t = this.resort.trails[r];
    if (t.bb) return t.d + 0.5;                 // blue-black: above a blue skier's limit, below a black
    return t.u ? Math.min(3, t.d + 1) : t.d;
  }

  /** Is this edge a trail harder than the skier's chosen maximum? */
  over(e, opts) {
    return e.k === 'p' && this.level(e.r) > (opts.maxDiff ?? 3);
  }

  /**
   * One move along `len` metres of an edge, forwards or (rev) backwards:
   * {t: seconds, c: search cost, up: metres climbed under your own power, band} or null when not possible.
   * Trails above the limit are never forbidden (someone standing on a black still needs a way
   * down) but are heavily penalised, so a route leaves them as soon as possible.
   */
  leg(e, rev, len, opts) {
    const T = TOLERANCE[opts.tol] || TOLERANCE.normal;
    if (e.k === 'l') {
      if (rev && !e.bi) return null;
      const t = LIFT_WAIT + this.resort.lifts[e.r].dur * (len / e.len);
      return { t, c: t, up: 0, band: -1 };
    }
    if (e.k === 'w') { const t = len / WALK_SPEED; return { t, c: t, up: 0, band: -1 }; }
    if (e.k === 'v') {
      const key = (opts.tol || 'normal') + (rev ? 'r' : 'f');
      e.memo ??= {};
      if (!(key in e.memo)) {
        const m = this._crossEffort(e.prof, rev, T), rate = T.rate[e.d];
        e.memo[key] = m && isFinite(rate) ? { ...m, c: m.c * rate } : null;
      }
      return e.memo[key];
    }
    const za = this.nodes[e.a][2], zb = this.nodes[e.b][2];
    if (e.k === 'x') {
      if (!rev || e.bi) { const t = len / LINK_SPEED; return { t, c: t, up: 0, band: -1 }; }
      return effort(len, ((za - zb) * len) / (e.len || 1), T);
    }
    // a trail
    const d = this.resort.trails[e.r].d, levels = this.level(e.r) - (opts.maxDiff ?? 3);
    // Each extra level above the limit costs far more, so a blue is taken before a black.
    const pen = levels > 0 ? OVER_PENALTY * 4 ** (levels - 1) : 1;
    if (!rev) { const t = len / SKI_SPEED[d]; return { t, c: t * pen, up: 0, band: -1 }; }
    const m = effort(len, ((za - zb) * len) / (e.len || 1), T);
    if (!m || !isFinite(T.rate[d])) return null;
    return { ...m, c: m.c * T.rate[d] * pen };
  }

  /** Nearest point on the network (lifts excluded: you can't board mid-span). */
  snap(x, y) {
    return this._snaps(x, y, 0)[0] || null;
  }

  /** The nearest edge, plus other trails within `near` metres (best point on each trail), nearest first. */
  _snaps(x, y, near, max = SNAP_MAX) {
    const all = [];
    for (let i = 0; i < this.edges.length; i++) {
      const e = this.edges[i];
      if (e.k === 'l' || e.k === 'v') continue;
      const n = nearestOnLine(e.pts, x, y);
      if (n.d > max) continue;
      const total = lineLength(e.pts) || 1;
      all.push({ e: i, d: n.d, along: (n.along * e.len) / total, x: n.x, y: n.y });
    }
    all.sort((a, b) => a.d - b.d);
    if (!all.length) return [];
    const out = [all[0]], seen = new Set([this._trailKey(all[0].e)]);
    for (const s of all) {
      if (s.d > near || out.length >= 6) break;
      const k = this._trailKey(s.e);
      if (this.edges[s.e].k !== 'p' || seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  _trailKey(ei) {
    const e = this.edges[ei];
    return e.k === 'p' ? this.resort.trails[e.r].name || `#${e.r}` : `e${ei}`;
  }

  /**
   * Route between two places. Each place is {x,y} (snapped to the network), {node}, or for
   * the start {lift, frac, down} when the person is riding a lift.
   * opts: {maxDiff, closed, tol: 'low'|'normal'|'high'}
   * Returns {ok:true, time, dist, pts, steps, vertDown, vertUp, climb, over, overNow} or {ok:false, reason}.
   *   climb:   metres gained under your own power (lifts excluded)
   *   over:    steps on trails above opts.maxDiff (empty when the route stays within the limit)
   *   overNow: the route starts on such a trail (the skier is standing on it)
   * reason: 'from_off_network' | 'to_off_network' | 'no_route' | 'no_route_closures'
   */
  route(from, to, opts = {}) {
    const res = this._route(from, to, opts);
    if (res.ok || res.reason !== 'no_route') return res;
    // Would it work if nothing were closed? Then say the closures are the reason.
    const free = this._route(from, to, { ...opts, closed: new Set() });
    return free.ok ? { ok: false, reason: 'no_route_closures' } : res;
  }

  /** The straight hop between where someone actually stands and a nearby trail (free for the nearest one: that is GPS error). */
  _hop(place, s, first, toTrail, T) {
    if (first && s.d > OFF_SLACK) return this._walkOff(place, s, toTrail);
    if (first || !this.geo) return first ? { t: 0, c: 0, up: 0, band: -1, pts: null } : null;
    const prof = toTrail ? this._profile(place.x, place.y, s.x, s.y) : this._profile(s.x, s.y, place.x, place.y);
    const m = this._crossEffort(prof, false, T);
    return m && { ...m, len: prof.len, pts: toTrail ? [place.x, place.y, s.x, s.y] : [s.x, s.y, place.x, place.y] };
  }

  /** A walk on foot between a place off the trails (a building, a pin, a friend) and the nearest trail. */
  _walkOff(place, s, toTrail) {
    const len = Math.hypot(place.x - s.x, place.y - s.y);
    const za = this.geo ? this.geo.elev(place.x, place.y) : 0, zb = this.geo ? this.geo.elev(s.x, s.y) : 0;
    const up = Math.max(0, toTrail ? zb - za : za - zb);
    const t = len / WALK_SPEED + up * WALK_CLIMB;
    return { t, c: t * WALK_COST, up: 0, climbOnFoot: up, band: -1, len, walk: true,
      pts: toTrail ? [place.x, place.y, s.x, s.y] : [s.x, s.y, place.x, place.y] };
  }

  _route(from, to, opts) {
    const N = this.nodes.length, T = TOLERANCE[opts.tol] || TOLERANCE.normal;
    const dist = new Float64Array(N).fill(Infinity), climb = new Float64Array(N);
    const prev = new Array(N).fill(null); // {from, e, rev} or {start:[edgeIdx, a0, a1], hop}
    // Riding a lift: the route starts where it lets you off (falls back to your position if the lift is unknown).
    const ride = from.lift != null ? this.edges.findIndex((e) => e.k === 'l' && e.r === from.lift) : -1;
    const sFrom = ride >= 0 || from.node != null ? null : this._snaps(from.x, from.y, NEAR_START, WALK_MAX);
    const sTo = to.node == null || to.node < 0 ? this._snaps(to.x, to.y, NEAR_START, WALK_MAX) : null;
    if (sFrom && !sFrom.length) return { ok: false, reason: 'from_off_network' };
    if (sTo && !sTo.length) return { ok: false, reason: 'to_off_network' };
    const heap = new Heap();
    const seed = (n, c, up, p) => { if (c < dist[n] && up <= T.cap) { dist[n] = c; climb[n] = up; prev[n] = p; heap.push(c, n); } };

    const starts = [];   // {s, hop} usable start points, kept for the same-edge shortcut below
    if (sFrom) {
      sFrom.forEach((s, i) => {
        const hop = this._hop(from, s, i === 0, true, T);
        if (!hop) return;
        starts.push({ s, hop });
        // You may always leave the edge you are standing on, even if it is above your limit or closed.
        const e = this.edges[s.e];
        const f = this.leg(e, false, e.len - s.along, opts), b = this.leg(e, true, s.along, opts);
        if (f) seed(e.b, hop.c + f.c, hop.up + f.up, { start: [s.e, s.along, e.len], hop });
        if (b) seed(e.a, hop.c + b.c, hop.up + b.up, { start: [s.e, s.along, 0], hop });
      });
    } else if (ride >= 0) {
      const e = this.edges[ride], at = e.len * Math.min(1, Math.max(0, from.frac ?? 0)), down = !!from.down && e.bi;
      const left = this.resort.lifts[e.r].dur * ((down ? at : e.len - at) / e.len);
      seed(down ? e.a : e.b, left, 0, { start: [ride, at, down ? 0 : e.len, true], hop: { pts: null } });
    } else seed(from.node, 0, 0, null);

    const done = new Uint8Array(N);
    while (heap.size) {
      const [best, u] = heap.pop();
      if (done[u] || best > dist[u]) continue;
      done[u] = 1;
      for (const o of this.out[u]) {
        if (done[o.to]) continue;
        const e = this.edges[o.e];
        if (this.blocked(e, opts)) continue;
        const m = this.leg(e, o.rev, e.len, opts);
        if (!m) continue;
        const d = best + m.c, up = climb[u] + m.up;
        if (d < dist[o.to] && up <= T.cap) { dist[o.to] = d; climb[o.to] = up; prev[o.to] = { from: u, e: o.e, rev: o.rev }; heap.push(d, o.to); }
      }
    }

    // Finish: either at a node, or part-way along a trail beside the destination.
    let end = null; // {node, cost, tail:[edgeIdx, a0, a1], hop, start}
    const offer = (c) => { if (c.cost < (end?.cost ?? Infinity) && c.up <= T.cap) end = c; };
    if (sTo) {
      sTo.forEach((s, i) => {
        const hop = this._hop(to, s, i === 0, false, T);
        if (!hop) return;
        const e = this.edges[s.e];
        for (const st of starts) {   // start and finish on the same piece of trail
          if (st.s.e !== s.e) continue;
          const m = this.leg(e, s.along < st.s.along, Math.abs(s.along - st.s.along), opts);
          if (m) offer({ node: -1, cost: st.hop.c + m.c + hop.c, up: st.hop.up + m.up + hop.up, tail: [s.e, st.s.along, s.along], hop, start: st.hop });
        }
        if (this.blocked(e, opts)) return;
        const f = this.leg(e, false, s.along, opts), b = this.leg(e, true, e.len - s.along, opts);
        if (f) offer({ node: e.a, cost: dist[e.a] + f.c + hop.c, up: climb[e.a] + f.up + hop.up, tail: [s.e, 0, s.along], hop });
        if (b) offer({ node: e.b, cost: dist[e.b] + b.c + hop.c, up: climb[e.b] + b.up + hop.up, tail: [s.e, e.len, s.along], hop });
      });
    } else if (dist[to.node] < Infinity) end = { node: to.node, cost: dist[to.node], tail: null };
    if (!end || !(end.cost < Infinity)) return { ok: false, reason: 'no_route' };

    // Walk back through prev to build the list of parts: [edgeIdx, fromAlong, toAlong] or {hop}.
    const parts = [];
    if (end.hop?.pts) parts.push({ hop: end.hop });
    if (end.tail) parts.push(end.tail);
    if (end.start?.pts) parts.push({ hop: end.start });
    let n = end.node;
    while (n >= 0 && prev[n]) {
      const p = prev[n];
      if (p.start) { parts.push(p.start); if (p.hop.pts) parts.push({ hop: p.hop }); break; }
      const e = this.edges[p.e];
      parts.push(p.rev ? [p.e, e.len, 0] : [p.e, 0, e.len]);
      n = p.from;
    }
    parts.reverse();
    return this._describe(parts, opts);
  }

  _describe(parts, opts) {
    const pts = [];
    const steps = [];
    let dist = 0, vertDown = 0, vertUp = 0, time = 0, climb = 0;
    const walk = [];   // the parts done on foot, drawn in their own colour
    const add = (seg) => { for (let i = pts.length ? 2 : 0; i < seg.length; i++) pts.push(seg[i]); };
    let at = 0;   // index in pts where the piece being added starts
    const push = (kind, name, ref, d, len, m, seg) => {
      const last = steps[steps.length - 1], end = [seg[seg.length - 2], seg[seg.length - 1]];
      if (last && last.kind === kind && last.name === name) { last.dist += len; last.time += m.t; last.climb += m.up; last.grade = Math.max(last.grade, m.band); last.end = end; }
      else steps.push({ kind, ref, name, d, dist: len, time: m.t, climb: m.up, grade: m.band, start: [seg[0], seg[1]], end, i0: at });
    };
    for (const part of parts) {
      if (part.hop) {
        const h = part.hop;
        at = Math.max(0, pts.length - 2); add(h.pts); dist += h.len; time += h.t; climb += h.up;
        if (h.walk) { walk.push(h.pts.slice()); push('offwalk', null, -1, -1, h.len, { ...h, up: h.climbOnFoot }, h.pts); }
        else push('cross', null, -1, -1, h.len, h, h.pts);
        continue;
      }
      const [ei, a0, a1, riding] = part;
      const e = this.edges[ei], rev = a1 < a0;
      const total = lineLength(e.pts) || 1;
      const k = total / (e.len || total); // edge len vs geometric length
      let seg = sliceLine(e.pts, Math.min(a0, a1) * k, Math.max(a0, a1) * k);
      if (rev) seg = reversePts(seg);
      if (seg.length < 4) continue;
      const len = Math.abs(a1 - a0);
      const za = this._z(e, a0), zb = this._z(e, a1);
      if (zb < za) vertDown += za - zb; else vertUp += zb - za;
      at = Math.max(0, pts.length - 2);
      add(seg);
      dist += len;
      let m = this.leg(e, rev, len, opts) || { t: len / LINK_SPEED, up: 0, band: -1 };
      if (riding) m = { ...m, t: m.t - LIFT_WAIT };   // already on it: no queue
      time += m.t; climb += m.up;
      const last = steps[steps.length - 1];
      if (e.k === 'v') push('cross', null, -1, -1, len, m, seg);
      else if (e.k === 'p' && rev) push('up', this.resort.trails[e.r].name || 'the trail', e.r, this.resort.trails[e.r].d, len, m, seg);
      else if (e.k === 'x' && m.up > 1) push('up', null, -1, -1, len, m, seg);
      else if (e.k === 'x' && last) { last.dist += len; last.time += m.t; last.end = [seg[seg.length - 2], seg[seg.length - 1]]; }
      else if (e.k === 'x') push('link', null, -1, -1, len, m, seg);
      else if (e.k === 'p') push('ski', this.resort.trails[e.r].name || 'Connector trail', e.r, this.resort.trails[e.r].d, len, m, seg);
      else if (e.k === 'l') push('lift', this.resort.lifts[e.r].name, e.r, -1, len, m, seg);
      else { walk.push(seg.slice()); push('walk', null, -1, -1, len, m, seg); }
    }
    // Fold tiny leftover fragments into their neighbours so the list reads cleanly.
    const tidy = steps.filter((s) => ((s.kind === 'ski' || s.kind === 'lift' || s.kind === 'offwalk') && s.dist >= 3) || s.dist >= 15 || s.climb >= 2 || steps.length === 1);
    const list = tidy.length ? tidy : steps, max = opts.maxDiff ?? 3;
    list.forEach((s, i) => {
      s.over = (s.kind === 'ski' || s.kind === 'up') && (s.ref >= 0 ? this.level(s.ref) : s.d) > max;
      // a cut-across is described by the trail (or lift) it brings you to
      if (s.kind === 'cross') s.to = list.slice(i + 1).find((n) => n.name)?.name || null;
      // a walk off the trails at the start leads to the first trail or lift; at the end it leads to the destination
      if (s.kind === 'offwalk') s.to = i === list.length - 1 ? null : list.slice(i + 1).find((n) => n.name)?.name || null;
      s.turn = i ? turnAt(pts, s.i0) : 0;   // degrees, + = right, - = left
    });
    const over = list.filter((s) => s.over);
    return { ok: true, time, dist, pts, walk, steps: list, vertDown, vertUp, climb, over, overNow: !!list[0]?.over };
  }

  _z(e, along) {
    const za = this.nodes[e.a][2], zb = this.nodes[e.b][2];
    return za + (zb - za) * (e.len ? along / e.len : 0);
  }
}

/** Change of heading (degrees, + = right) where a route line passes index i: ~30 m in, ~40 m out. */
function turnAt(pts, i) {
  const walk = (dir, want) => {
    let j = i, acc = 0;
    while (j + 2 * dir >= 0 && j + 2 * dir < pts.length - 1 && acc < want) { acc += Math.hypot(pts[j + 2 * dir] - pts[j], pts[j + 2 * dir + 1] - pts[j + 1]); j += 2 * dir; }
    return j;
  };
  const a = walk(-1, 30), b = walk(1, 40);
  if (a === i || b === i) return 0;
  const hin = Math.atan2(pts[i] - pts[a], pts[i + 1] - pts[a + 1]), hout = Math.atan2(pts[b] - pts[i], pts[b + 1] - pts[i + 1]);
  let d = ((hout - hin) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return Math.round(d);
}

function reversePts(p) {
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) { out[p.length - 2 - i] = p[i]; out[p.length - 1 - i] = p[i + 1]; }
  return out;
}

/**
 * Pick a shared meeting point: the POI (lodge / lift base / summit) that minimises the
 * later arrival of the two parties. Either origin may be null (unknown / off the network).
 */
export function suggestMeetingPoint(router, me, friend, opts, friendOpts = { maxDiff: 0, closed: opts.closed }) {
  const cands = router.resort.pois.filter((p) => ['lodge', 'lift', 'food'].includes(p.kind));
  let best = null;
  for (const p of cands) {
    const a = me ? router.route(me, { node: p.n }, opts) : { ok: true, time: 0 };
    if (!a.ok) continue;
    // The friend's limits are unknown, so assume green trails only for them.
    const b = friend ? router.route(friend, { node: p.n }, friendOpts) : { ok: true, time: 0 };
    const worst = Math.max(a.time, b.ok ? b.time : a.time + 3600);
    const score = worst + (p.kind === 'lodge' ? 0 : 120) + (b.ok ? 0 : 1800);
    if (!best || score < best.score) best = { poi: p, score, myTime: a.time, friendTime: b.ok ? b.time : null };
  }
  return best;
}
