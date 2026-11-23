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
