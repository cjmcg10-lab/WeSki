// Directions over the verified network: trails (downhill only), lifts (uphill only),
// and walking connections. Honors the skier's maximum difficulty and confirmed closures.
import { nearestOnLine, lineLength, sliceLine } from './geo.js';

export const DIFF_NAMES = ['Green', 'Blue', 'Black', 'Double black'];
const SKI_SPEED = [6, 8, 7, 5];     // m/s by difficulty (harder terrain is skied slower)
const WALK_SPEED = 1.2;
const LINK_SPEED = 2.5;             // short skate/slide between adjacent trails or off a lift
const LIFT_WAIT = 150;              // seconds of queueing + loading
export const SNAP_MAX = 250;        // further than this from every trail/lift/walkway = off the network

export class Router {
  constructor(resort) {
    this.resort = resort;
    this.nodes = resort.graph.nodes;
    this.edges = resort.graph.edges;
    this.out = this.nodes.map(() => []);
    this.edges.forEach((e, i) => {
      this.out[e.a].push({ e: i, to: e.b, rev: false });
      if (e.bi) this.out[e.b].push({ e: i, to: e.a, rev: true });
    });
  }

  /** Why an edge can't be used, or null. opts: {maxDiff, closed:Set<'t12'|'l3'>} */
  blocked(e, opts) {
    if (e.k === 'p') {
      const t = this.resort.trails[e.r];
      if (opts.closed?.has('t' + e.r)) return 'closed';
      if (t.d > (opts.maxDiff ?? 3)) return 'difficulty';
    } else if (e.k === 'l' && opts.closed?.has('l' + e.r)) return 'closed';
    return null;
  }

  /** Seconds to traverse `len` metres of an edge. */
  time(e, len) {
    if (e.k === 'p') return len / SKI_SPEED[this.resort.trails[e.r].d];
    if (e.k === 'l') return LIFT_WAIT + this.resort.lifts[e.r].dur * (len / e.len);
    if (e.k === 'w') return len / WALK_SPEED;
    return len / LINK_SPEED;
  }

  /** Nearest point on the network (lifts excluded: you can't board mid-span). */
  snap(x, y) {
    let best = null;
    for (let i = 0; i < this.edges.length; i++) {
      const e = this.edges[i];
      if (e.k === 'l') continue;
      const n = nearestOnLine(e.pts, x, y);
      if (!best || n.d < best.d) best = { e: i, d: n.d, along: n.along, x: n.x, y: n.y };
    }
    return best && best.d <= SNAP_MAX ? best : null;
  }

  /**
   * Route between two places. Each place is {x,y} (snapped to the network) or {node}.
   * Returns {ok:true, time, dist, pts, steps, vertDown, vertUp} or {ok:false, reason}.
   * reason: 'from_off_network' | 'to_off_network' | 'no_route' | 'no_route_limits'
   */
  route(from, to, opts = {}) {
    const res = this._route(from, to, opts);
    if (res.ok || res.reason !== 'no_route') return res;
    // Would it work without the skier's limits? Then say the limits are the reason.
    const free = this._route(from, to, { maxDiff: 3, closed: new Set() });
    return free.ok ? { ok: false, reason: 'no_route_limits' } : res;
  }

  _route(from, to, opts) {
    const N = this.nodes.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Array(N).fill(null); // {from, e, rev} or {start:[edgeIdx, a0, a1]}
    const sFrom = from.node == null ? this.snap(from.x, from.y) : null;
    const sTo = to.node == null ? this.snap(to.x, to.y) : null;
    if (from.node == null && !sFrom) return { ok: false, reason: 'from_off_network' };
    if (to.node == null && !sTo) return { ok: false, reason: 'to_off_network' };

    if (sFrom) {
      // You may always leave the edge you are standing on, even if it is above your limit or closed.
      const e = this.edges[sFrom.e];
      dist[e.b] = this.time(e, e.len - sFrom.along);
      prev[e.b] = { start: [sFrom.e, sFrom.along, e.len] };
      if (e.bi) {
        dist[e.a] = this.time(e, sFrom.along);
        prev[e.a] = { start: [sFrom.e, sFrom.along, 0] };
      }
    } else dist[from.node] = 0;

    const done = new Uint8Array(N);
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const o of this.out[u]) {
        const e = this.edges[o.e];
        if (this.blocked(e, opts)) continue;
        const d = best + this.time(e, e.len);
        if (d < dist[o.to]) { dist[o.to] = d; prev[o.to] = { from: u, e: o.e, rev: o.rev }; }
      }
    }

    // Finish: either at a node, or part-way along the destination edge.
    let end = null; // {node, time, tail:[edgeIdx, a0, a1]}
    if (sTo) {
      const e = this.edges[sTo.e];
      const ok = !this.blocked(e, opts);
      if (sFrom && sFrom.e === sTo.e && (e.bi || sTo.along >= sFrom.along)) {
        const t = this.time(e, Math.abs(sTo.along - sFrom.along));
        end = { node: -1, time: t, tail: [sTo.e, sFrom.along, sTo.along] };
      }
      if (ok && dist[e.a] + this.time(e, sTo.along) < (end?.time ?? Infinity)) {
        end = { node: e.a, time: dist[e.a] + this.time(e, sTo.along), tail: [sTo.e, 0, sTo.along] };
      }
      if (ok && e.bi && dist[e.b] + this.time(e, e.len - sTo.along) < (end?.time ?? Infinity)) {
        end = { node: e.b, time: dist[e.b] + this.time(e, e.len - sTo.along), tail: [sTo.e, e.len, sTo.along] };
      }
    } else if (dist[to.node] < Infinity) end = { node: to.node, time: dist[to.node], tail: null };
    if (!end || !(end.time < Infinity)) return { ok: false, reason: 'no_route' };

    // Walk back through prev to build the list of [edgeIdx, fromAlong, toAlong] parts.
    const parts = [];
    if (end.tail) parts.push(end.tail);
    let n = end.node;
    while (n >= 0 && prev[n]) {
      const p = prev[n];
      if (p.start) { parts.push(p.start); break; }
      const e = this.edges[p.e];
      parts.push(p.rev ? [p.e, e.len, 0] : [p.e, 0, e.len]);
      n = p.from;
    }
    parts.reverse();
    return this._describe(parts, end.time);
  }

  _describe(parts, time) {
    const pts = [];
    const steps = [];
    let dist = 0, vertDown = 0, vertUp = 0;
    for (const [ei, a0, a1] of parts) {
      const e = this.edges[ei];
      const total = lineLength(e.pts) || 1;
      const k = total / (e.len || total); // edge len vs geometric length
      let seg = sliceLine(e.pts, Math.min(a0, a1) * k, Math.max(a0, a1) * k);
      if (a1 < a0) seg = reversePts(seg);
      if (seg.length < 4) continue;
      const len = Math.abs(a1 - a0);
      const za = this._z(e, a0), zb = this._z(e, a1);
      if (zb < za) vertDown += za - zb; else vertUp += zb - za;
      for (let i = pts.length ? 2 : 0; i < seg.length; i++) pts.push(seg[i]);
      dist += len;
      const kind = e.k === 'x' ? (steps.length ? steps[steps.length - 1].kind : 'link') : e.k === 'p' ? 'ski' : e.k === 'l' ? 'lift' : 'walk';
      const ref = e.k === 'p' || e.k === 'l' ? e.r : -1;
      const name = e.k === 'p' ? this.resort.trails[e.r].name || 'Connector trail' : e.k === 'l' ? this.resort.lifts[e.r].name : null;
      const last = steps[steps.length - 1];
      const t = this.time(e, len) - (e.k === 'l' && len < e.len ? 0 : 0);
      if (last && last.kind === kind && last.name === name) { last.dist += len; last.time += t; last.end = [seg[seg.length - 2], seg[seg.length - 1]]; }
      else if (e.k === 'x' && last) { last.dist += len; last.time += t; }
      else steps.push({ kind, ref, name, d: e.k === 'p' ? this.resort.trails[e.r].d : -1, dist: len, time: t, start: [seg[0], seg[1]], end: [seg[seg.length - 2], seg[seg.length - 1]] });
    }
    // Fold tiny leftover fragments into their neighbours so the list reads cleanly.
    const tidy = steps.filter((s) => s.kind === 'ski' || s.kind === 'lift' || s.dist >= 15 || steps.length === 1);
    return { ok: true, time, dist, pts, steps: tidy.length ? tidy : steps, vertDown, vertUp };
  }

  _z(e, along) {
    const za = this.nodes[e.a][2], zb = this.nodes[e.b][2];
    return za + (zb - za) * (e.len ? along / e.len : 0);
  }
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
