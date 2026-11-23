// How lift carriers move: pure functions (no three.js), so they can be tested on their own.
//
// - Detachable chairs and gondola cabins let go of the cable in the stations: they slow right
//   down, bunch up while people get on and off, and speed back up before rejoining the line.
// - Fixed-grip chairs stay clamped to the cable and go round at one speed.
// - An aerial tram shuttles: two cabins, one climbing while the other comes down, each easing
//   out of its station, cruising, and easing into the other one, then waiting there.

/**
 * A loop made of stretches, each with a speed that changes evenly with distance from v0 to v1
 * (metres a second). Returns { T, at(tau), len }: T is the time for one lap, at(tau) the distance
 * round the loop at time tau (any number; it wraps). After at(), `acc` holds the acceleration
 * there (m/s², negative while braking). Nothing is allocated per call.
 */
export function loopTimer(segs) {
  const t0 = [0], s0 = [0];
  for (const g of segs) {
    const { len, v0, v1 } = g;
    // time over a stretch whose speed grows evenly with distance: len * ln(v1 / v0) / (v1 - v0)
    g.dt = Math.abs(v1 - v0) < 1e-9 ? len / v0 : (len * Math.log(v1 / v0)) / (v1 - v0);
    g.k = (v1 - v0) / len;
    t0.push(t0[t0.length - 1] + g.dt); s0.push(s0[s0.length - 1] + len);
  }
  const T = t0[t0.length - 1], len = s0[s0.length - 1];
  const timer = {
    T, len, acc: 0,
    at(tau) {
      let t = tau % T;
      if (t < 0) t += T;
      let i = 0;
      while (i < segs.length - 1 && t >= t0[i + 1]) i++;
      const g = segs[i], u = t - t0[i];
      if (Math.abs(g.k) < 1e-12) { timer.acc = 0; return s0[i] + g.v0 * u; }
      // ds/dt = v0 + k s  =>  s = v0 (e^(k t) - 1) / k, speed v0 e^(k t), acceleration k v
      const e = Math.exp(g.k * u), v = g.v0 * e;
      timer.acc = g.k * v;
      return s0[i] + Math.min(g.len, (g.v0 * (e - 1)) / g.k);
    },
  };
  return timer;
}

/**
 * The stretches round a detachable lift's loop, starting where the carriers leave the bottom
 * station on the uphill side (the same start as SkiMap.loopPoint): L is the length of the line,
 * r the bullwheel radius, V the line speed, v the speed in the stations, dock how far the slow
 * track reaches in from each end of the line, ramp the length of the speeding-up and slowing-down
 * stretches. Short lifts get shorter stations so the line always keeps some full-speed part.
 */
export function detachSegments(L, r, V, v, dock = 14, ramp = 16) {
  const fit = Math.min(1, (L * 0.4) / (dock + ramp));
  const d = dock * fit, a = ramp * fit, run = Math.max(1, L - 2 * (d + a)), turn = Math.PI * r;
  const S = (len, v0, v1 = v0) => ({ len, v0, v1 });
  return [
    S(d, v), S(a, v, V), S(run, V), S(a, V, v), S(d, v),       // up the line
    S(turn, v),                                                // round the top bullwheel
    S(d, v), S(a, v, V), S(run, V), S(a, V, v), S(d, v),       // down the line
    S(turn, v),                                                // round the bottom bullwheel
  ];
}

/**
 * A jig-back tram's two cabins. t: seconds; ride: seconds from one station to the other; dwell:
 * seconds waiting in each; ease: share of the ride spent speeding up (the same share slowing down).
 * Returns the first cabin's place along the line, 0 at the bottom to 1 at the top (the second
 * cabin is at 1 - f), its speed in line lengths a second (signed: + climbing), and its
 * acceleration in the same units. Speed rises evenly, cruises, and falls evenly: no jolts.
 */
export function shuttle(t, ride, dwell, ease = 0.18, out = { f: 0, v: 0, a: 0 }) {
  const cyc = 2 * (ride + dwell);
  let ph = t % cyc;
  if (ph < 0) ph += cyc;
  const up = ph < ride + dwell;
  const k = up ? ph : ph - ride - dwell;
  if (k >= ride) { out.f = up ? 1 : 0; out.v = 0; out.a = 0; return out; }
  const ta = Math.max(1e-6, Math.min(0.5, ease) * ride), vmax = 1 / (ride - ta);
  let f, v, a;
  if (k < ta) { f = (0.5 * vmax * k * k) / ta; v = (vmax * k) / ta; a = vmax / ta; }
  else if (k < ride - ta) { f = 0.5 * vmax * ta + vmax * (k - ta); v = vmax; a = 0; }
  else { const q = ride - k; f = 1 - (0.5 * vmax * q * q) / ta; v = (vmax * q) / ta; a = -vmax / ta; }
  out.f = up ? f : 1 - f; out.v = up ? v : -v; out.a = up ? a : -a;
  return out;
}

/** Swing of a hanging carrier (radians, about the axis across the cable): a gentle sway, plus a lean
 * against the change of speed (braking swings the cabin forward). acc in m/s². */
export function swing(t, phase, acc = 0, amp = 0.025) {
  const lean = Math.max(-0.12, Math.min(0.12, acc * 0.12));
  return amp * Math.sin(t * 1.1 + phase) + 0.4 * amp * Math.sin(t * 2.3 + phase * 1.7) + lean;
}

/** How long a tram takes from one station to the other on the map: the real time where it is known (sped
 * up by 2, like every lift on the map), otherwise about 10 m/s, and never shorter than 30 s or longer
 * than 150 s, so a long ride does not leave the cabins standing still to the eye. */
export function tramRide(len, dur) {
  return Math.max(30, Math.min(150, (dur || len / 10) / 2));
}

/**
 * Lift ends that land on a mapped building would otherwise be drawn twice: the lift's own terminal model plus the
 * OpenStreetMap building of the real station. Decide which one to keep for each end:
 *  - a station-sized building (under `bigArea` m²) in or within `near` metres of the end is left out: the terminal
 *    model shows it (with its bullwheel and housing);
 *  - a big building (a base lodge or hall the lift starts inside) is kept and that end's terminal model is left out.
 * `buildings`: [{ pts: [x, y, ...] }] in local metres; `ends`: [[x, y], ...] in the same metres.
 * Returns { skipBuildings: Set of building indexes, skipEnds: Set of end indexes }.
 */
export function stationClashes(buildings, ends, { near = 6, bigArea = 2500 } = {}) {
  const skipBuildings = new Set(), skipEnds = new Set();
  const info = buildings.map((b) => {
    const P = b.pts;
    let area = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
      area += P[j] * P[i + 1] - P[i] * P[j + 1];
      x0 = Math.min(x0, P[i]); y0 = Math.min(y0, P[i + 1]); x1 = Math.max(x1, P[i]); y1 = Math.max(y1, P[i + 1]);
    }
    return { area: Math.abs(area) / 2, box: [x0 - near, y0 - near, x1 + near, y1 + near] };
  });
  ends.forEach(([x, y], e) => {
    buildings.forEach((b, i) => {
      const { box, area } = info[i];
      if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return;
      if (!(polyHas(b.pts, x, y) || polyEdge(b.pts, x, y) <= near)) return;
      if (area < bigArea) skipBuildings.add(i); else skipEnds.add(e);
    });
  });
  return { skipBuildings, skipEnds };
}

function polyHas(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
    const xi = P[i], yi = P[i + 1], xj = P[j], yj = P[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function polyEdge(P, x, y) {
  let best = Infinity;
  for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
    const ax = P[j], ay = P[j + 1], dx = P[i] - ax, dy = P[i + 1] - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
