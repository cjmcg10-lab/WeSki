// GPS run tracking: spike filtering, ski / lift / idle classification, stats.
import { nearestOnLine, lineLength } from './geo.js';

export const ST = { IDLE: 0, SKI: 1, LIFT: 2 };
const MAX_ACC = 60;        // ignore fixes with worse horizontal accuracy (m)
const MAX_SPEED = 42;      // m/s (~150 km/h): anything faster is a GPS spike
const MAX_ACCEL = 8;       // m/s^2 sustained jump = spike
const GAP_S = 30;          // a pause in fixes longer than this is not counted as travel
const WINDOW_S = 14;       // classification window
const CONFIRM_S = 6;       // a new state must persist this long before it is applied
const MIN_RUN_VERT = 15, MIN_RUN_DIST = 100, MIN_LIFT_VERT = 8;

/**
 * Works out whether someone is riding a lift, from positions alone, so it runs all the
 * time (with or without stats tracking or directions).
 *  - Getting on: several seconds of steady progress up a lift line, staying close to it.
 *    Skiing down underneath a lift never counts (wrong direction), except on two-way lifts.
 *  - Staying on: once riding you stay "on the lift" until you reach the far station, leave
 *    the line, or head back down it - so a stopped lift, or ground that dips under the
 *    chair, does not end the ride.
 */
const SENSE_NEAR = 35, SENSE_LEAVE = 45, SENSE_MIN_S = 5, SENSE_WINDOW_S = 10, SENSE_MAX_SPEED = 13;
export class LiftSense {
  /** @param lifts resort.lifts  @param geo optional terrain, used to ignore traverses that drop */
  constructor(lifts, geo = null) {
    this.lifts = lifts.map((l) => ({ pts: l.pts, len: lineLength(l.pts) || 1, both: !!l.both }));
    this.geo = geo;
    this.buf = [];      // recent [t, x, y]
    this.on = null;     // {id, frac, down, along, best}
  }

  /** Feed one position; returns {id, frac (0 bottom .. 1 top), down} while riding, else null. */
  update(x, y, t) {
    const buf = this.buf, last = buf[buf.length - 1];
    if (last && t - last[0] > 120000) { buf.length = 0; this.on = null; }
    buf.push([t, x, y]);
    while (buf.length > 1 && t - buf[0][0] > SENSE_WINDOW_S * 1000) buf.shift();
    if (this.on) {
      const o = this.on, l = this.lifts[o.id], n = nearestOnLine(l.pts, x, y);
      const ahead = o.down ? o.best - n.along : n.along - o.best;
      if (ahead > 0) o.best = n.along;
      const arrived = o.down ? n.along < 12 : n.along > l.len - 12;
      if (n.d > SENSE_LEAVE || arrived || ahead < -30) { this.on = null; buf.length = 0; return null; }
      o.along = n.along; o.frac = n.along / l.len;
      return o;
    }
    const a = buf[0], dt = (t - a[0]) / 1000;
    if (dt < SENSE_MIN_S) return null;
    // net movement over the window, not the wiggly point-to-point path: on a slow chair GPS
    // wobble is as big as the real movement between fixes
    const path = Math.hypot(x - a[1], y - a[2]);
    if (path < 10 || path / dt > SENSE_MAX_SPEED) return null;
    for (let id = 0; id < this.lifts.length; id++) {
      const l = this.lifts[id], nb = nearestOnLine(l.pts, x, y);
      if (nb.d > SENSE_NEAR || nb.along > l.len - 12) continue;
      const na = nearestOnLine(l.pts, a[1], a[2]);
      if (na.d > SENSE_NEAR) continue;
      const prog = nb.along - na.along;
      if (Math.abs(prog) < Math.max(10, 0.7 * path) || (prog < 0 && !l.both)) continue;
      // a trail that runs beside a lift for a moment goes downhill; a lift does not
      if (this.geo && !l.both && this.geo.elev(x, y) < this.geo.elev(a[1], a[2]) - 4) continue;
      this.on = { id, frac: nb.along / l.len, down: prog < 0, along: nb.along, best: nb.along };
      return this.on;
    }
    return null;
  }
}

export class Tracker {
  /** @param geo Geo  @param lifts resort.lifts (for lift-line proximity) */
  constructor(geo, lifts = []) {
    this.geo = geo;
    this.lifts = lifts;
    this.points = [];      // [t(ms), x, y, z, state, gap(0|1)]
    this.rejected = 0;
    this.spikeRun = 0;
    this.state = ST.IDLE;
    this.cand = null;      // {state, since, idx}
    this.speed = 0;        // current smoothed speed, m/s
    this.sense = new LiftSense(lifts, geo);
    this.riding = null;    // {id, frac, down} while on a lift
  }

  /** Add a fix {lat, lon, acc, alt, t}. Returns {ok, reason}. */
  add(fix) {
    if (!(fix.acc <= MAX_ACC)) { this.rejected++; return { ok: false, reason: 'accuracy' }; }
    const [x, y] = this.geo.toLocal(fix.lat, fix.lon);
    const z = this.geo.inBounds(x, y) ? this.geo.elev(x, y) : (Number.isFinite(fix.alt) ? fix.alt : 0);
    const P = this.points, last = P[P.length - 1];
    let gap = 0;
    if (last) {
      const dt = (fix.t - last[0]) / 1000;
      if (dt < 0.4) return { ok: false, reason: 'too_soon' };
      const v = Math.hypot(x - last[1], y - last[2]) / dt;
      const spike = v > MAX_SPEED || (v > 15 && (v - this.speed) / dt > MAX_ACCEL);
      if (spike && this.spikeRun < 3) {
        // A single wild jump: drop it. Several in a row means we really did move (e.g. GPS was off).
        this.spikeRun++; this.rejected++;
        return { ok: false, reason: 'spike' };
      }
      if (spike || dt > GAP_S) gap = 1;
    }
    this.spikeRun = 0;
    this.riding = this.sense.update(x, y, fix.t);
    P.push([fix.t, x, y, z, this.state, gap]);
    this._classify();
    this.speed = gap ? 0 : this._speedAt(P.length - 1);
    return { ok: true };
  }

  /** Mean speed over the last ~3 segments (smooths single-fix jitter). */
  _speedAt(i) {
    return smoothSpeed(this.points, i);
  }

  _classify() {
    const P = this.points, n = P.length, now = P[n - 1];
    let j = n - 1, path = 0;
    while (j > 0 && now[0] - P[j - 1][0] <= WINDOW_S * 1000 && !P[j][5]) {
      path += Math.hypot(P[j][1] - P[j - 1][1], P[j][2] - P[j - 1][2]);
      j--;
    }
    const dt = (now[0] - P[j][0]) / 1000;
    if (dt < 5) return;
    const hs = path / dt, vz = (now[3] - P[j][3]) / dt;
    let c;
    if (this.riding) c = ST.LIFT;            // includes a lift that has stopped with you on it
    else if (hs < 0.6) c = ST.IDLE;
    else if (vz > 0.25 || this._ridingLift(P[j], now, path)) c = ST.LIFT;
    else if ((vz < -0.15 && hs > 1.2) || hs > 2.5) c = ST.SKI;
    else c = this.state === ST.SKI && hs > 1.2 ? ST.SKI : ST.IDLE;

    if (c === this.state) { this.cand = null; return; }
    if (!this.cand || this.cand.state !== c) this.cand = { state: c, since: now[0], idx: j };
    if (now[0] - this.cand.since >= CONFIRM_S * 1000) {
      // Apply retroactively from where the new behaviour began.
      for (let k = Math.max(this.cand.idx + 1, 0); k < n; k++) P[k][4] = c;
      this.state = c;
      this.cand = null;
    }
  }

  /**
   * Following a lift line from bottom towards top. Needed because the ground under a
   * chair can dip, so "am I gaining elevation" alone would split one ride in two.
   */
  _ridingLift(a, b, path) {
    for (const l of this.lifts) {
      const nb = nearestOnLine(l.pts, b[1], b[2]);
      if (nb.d > 30) continue;
      const na = nearestOnLine(l.pts, a[1], a[2]);
      if (na.d <= 30 && nb.along - na.along > 0.7 * path) return true;
    }
    return false;
  }

  get stats() {
    return { ...computeStats(this.points), speed: this.speed, state: this.state, rejected: this.rejected };
  }
}

export function smoothSpeed(P, i) {
  let d = 0, t = 0;
  for (let k = i; k > 0 && k > i - 3; k--) {
    if (P[k][5]) break;
    d += Math.hypot(P[k][1] - P[k - 1][1], P[k][2] - P[k - 1][2]);
    t += (P[k][0] - P[k - 1][0]) / 1000;
  }
  return t > 0 ? d / t : 0;
}

/** Stats for a list of points. Lift rides are kept out of every skiing number. */
export function computeStats(P) {
  const s = {
    skiDist: 0, skiTime: 0, vert: 0, topSpeed: 0, avgSpeed: 0, runs: [], runCount: 0,
    liftDist: 0, liftTime: 0, liftVert: 0, lifts: [], liftCount: 0,
    duration: P.length ? (P[P.length - 1][0] - P[0][0]) / 1000 : 0,
  };
  let run = null, lift = null;
  const endRun = () => { if (run && run.vert >= MIN_RUN_VERT && run.dist >= MIN_RUN_DIST) s.runs.push(run); run = null; };
  const endLift = () => { if (lift && lift.vert >= MIN_LIFT_VERT) s.lifts.push(lift); lift = null; };
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], st = b[4];
    if (b[5]) { endRun(); endLift(); continue; }
    const d = Math.hypot(b[1] - a[1], b[2] - a[2]), dt = (b[0] - a[0]) / 1000, dz = b[3] - a[3];
    if (st === ST.SKI) {
      endLift();
      if (!run) run = { i0: i - 1, i1: i, t0: a[0], t1: b[0], dist: 0, vert: 0, time: 0, top: 0 };
      const v = smoothSpeed(P, i);
      run.i1 = i; run.t1 = b[0]; run.dist += d; run.time += dt; run.top = Math.max(run.top, v);
      if (dz < 0) run.vert -= dz;
    } else if (st === ST.LIFT) {
      endRun();
      if (!lift) lift = { i0: i - 1, i1: i, t0: a[0], t1: b[0], dist: 0, vert: 0, time: 0 };
      lift.i1 = i; lift.t1 = b[0]; lift.dist += d; lift.time += dt;
      if (dz > 0) lift.vert += dz;
    } else if (lift) endLift(); // idle: a run may continue after a stop, a lift ride may not
  }
  endRun(); endLift();
  for (const r of s.runs) { s.skiDist += r.dist; s.skiTime += r.time; s.vert += r.vert; s.topSpeed = Math.max(s.topSpeed, r.top); }
  for (const l of s.lifts) { s.liftDist += l.dist; s.liftTime += l.time; s.liftVert += l.vert; }
  s.runCount = s.runs.length;
  s.liftCount = s.lifts.length;
  s.avgSpeed = s.skiTime > 0 ? s.skiDist / s.skiTime : 0;
  return s;
}
