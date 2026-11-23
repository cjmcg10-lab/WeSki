// Group members riding together: who shares which chair or cabin. Pure functions (no three.js), so they can be
// tested on their own. Display only: worked out on each phone from the positions the group already shares.
//
// - Riders on the same lift, going the same way, close together along the line share a carrier, up to the lift's
//   capacity (seats per chair, people per cabin). Each carrier is filled before the next one gets anyone: 6 on a
//   4-seat chair ride 4 + 2, 9 ride 4 + 4 + 1, and two half-full chairs close together become one full one.
// - "Close together" is three quarters of the spacing between two carriers on the map, at least 15 m and at most
//   60 m. A tram or a train has one cabin or car each way, so everyone on it going the same way shares it.
// - Once together, people stay together until they are more than twice that apart (GPS wanders by a few metres from
//   one report to the next), so nobody is moved between carriers from one position update to the next.

/** People per carrier when OpenStreetMap does not say (aerialway:occupancy). */
export const RIDE_DEFAULTS = { chair: 4, gondola: 8, tram: 80, train: 100, funicular: 100, tbar: 2, platter: 1, rope: 1, carpet: 1 };

/**
 * How many people ride one carrier of lift `l`. `drawnSeats`: the seat count the map draws a chair with (the
 * nearest of 1, 2, 3, 4, 6, 8 to the lift's own figure), so the riders always fit the chair that is drawn.
 */
export function liftCapacity(l, drawnSeats) {
  const n = l.seats || 0;
  switch (l.kind) {
    case 'chair': return drawnSeats || (n >= 1 && n <= 8 ? n : RIDE_DEFAULTS.chair);
    case 'gondola': return n >= 1 && n <= 40 ? n : RIDE_DEFAULTS.gondola;
    case 'tram': return n >= 10 && n <= 250 ? n : RIDE_DEFAULTS.tram;
    case 'train': case 'funicular': return n >= 10 && n <= 400 ? n : RIDE_DEFAULTS[l.kind];
    case 'surface': {
      const style = l.style || 'tbar';
      if (style !== 'tbar') return 1;                  // platter (one person a disc), rope tow (everyone on their own)
      return n === 1 || n === 2 ? n : RIDE_DEFAULTS.tbar;
    }
    default: return 1;                                 // magic carpet: no carriers
  }
}

/** Largest distance (metres along the line) between people put in the same carrier. */
export function joinGap(spacing, one = false) {
  if (one) return Infinity;
  return Math.max(15, Math.min(60, 0.75 * (spacing || 48)));
}

/**
 * Keeps track of who rides with whom. update() takes everyone on a lift and returns the carriers to draw.
 * riders: [{ id, lift: { id, frac (0 bottom .. 1 top), down } }]
 * info(liftId): { len (metres), cap (people per carrier), spacing (metres between carriers on the map), one (a
 *   single cabin or car each way: tram, train, funicular) } or null for a lift that is not drawn.
 * Returns [{ key, lift (lift id), down, ids (front first), frac (where to draw the carrier) }]. Keys stay the same for
 * as long as a carrier keeps at least one of its riders.
 */
export class RideGroups {
  constructor() { this.cars = new Map(); this.next = 1; }

  update(riders, info) {
    // riders by lift and direction, the one furthest along first (the top for going up, the bottom going down)
    const buckets = new Map();
    for (const r of riders) {
      const I = r.lift && info(r.lift.id);
      if (!I) continue;
      const b = `${r.lift.id}:${r.lift.down ? 1 : 0}`;
      if (!buckets.has(b)) buckets.set(b, { lift: r.lift.id, down: !!r.lift.down, I, gap: joinGap(I.spacing, I.one), list: [] });
      buckets.get(b).list.push({ id: r.id, s: Math.min(1, Math.max(0, r.lift.frac)) * I.len, frac: r.lift.frac });
    }
    const ahead = (B) => (a, c) => (B.down ? a.s - c.s : c.s - a.s);
    for (const B of buckets.values()) B.list.sort(ahead(B));
    const out = new Map();          // bucket -> [{ key, members }]
    const placed = new Set();
    // 1. carriers from last time keep the riders still with them (still on that lift and close enough)
    for (const [key, car] of this.cars) {
      const B = buckets.get(car.bucket);
      if (!B) continue;
      let members = B.list.filter((m) => car.ids.includes(m.id));
      while (members.length > 1 && spread(members) > 2 * B.gap) {
        // the one furthest from the middle has drifted away (or got off and on again): let them go
        const mid = members.reduce((k, m) => k + m.s, 0) / members.length;
        let far = 0;
        members.forEach((m, i) => { if (Math.abs(m.s - mid) > Math.abs(members[far].s - mid)) far = i; });
        members = members.filter((_, i) => i !== far);
      }
      members = members.slice(0, B.I.cap);
      if (!members.length) continue;
      for (const m of members) placed.add(m.id);
      if (!out.has(car.bucket)) out.set(car.bucket, []);
      out.get(car.bucket).push({ key, members, rank: car.rank });
    }
    // 2. everyone else, front first: into the nearest carrier with room that they are close to, or a new one
    for (const [b, B] of buckets) {
      const cars = out.get(b) || [];
      for (const m of B.list) {
        if (placed.has(m.id)) continue;
        let best = null, bestD = Infinity;
        for (const c of cars) {
          if (c.members.length >= B.I.cap) continue;
          const d = Math.max(...c.members.map((o) => Math.abs(o.s - m.s)));
          if (d <= B.gap && d < bestD) { best = c; bestD = d; }
        }
        if (best) best.members.push(m);
        else cars.push({ key: 'c' + this.next++, members: [m] });
        placed.add(m.id);
      }
      out.set(b, cars);
    }
    // 2b. fill each carrier before the next one gets anyone (owner, 2026-11-23): where two carriers of the same group are
    // close together and the front one has room, the people at the front of the one behind move up into it, so two
    // half-full chairs become one full chair and the rest. Carriers are taken in their order along the line from last
    // time (new ones by where they are), and people already riding never move into a carrier that has just appeared,
    // so GPS wander still reshuffles nobody.
    for (const [b, cars] of out) {
      const B = buckets.get(b), sort = ahead(B), avg = (c) => c.members.reduce((k, m) => k + m.s, 0) / c.members.length;
      for (const c of cars) c.members.sort(sort);
      const order = cars.filter((c) => c.rank != null).sort((x, y) => x.rank - y.rank);
      for (const c of cars.filter((k) => k.rank == null).sort((x, y) => (B.down ? avg(x) - avg(y) : avg(y) - avg(x)))) {
        const i = order.findIndex((k) => (B.down ? avg(k) > avg(c) : avg(k) < avg(c)));
        order.splice(i < 0 ? order.length : i, 0, c);
      }
      for (let i = 0; i < order.length; i++) {
        const front = order[i];
        for (let j = i + 1; j < order.length && front.members.length < B.I.cap; j++) {
          const rear = order[j];
          if (front.rank == null && rear.rank != null) continue;
          while (rear.members.length && front.members.length < B.I.cap
            && Math.max(...front.members.map((o) => Math.abs(o.s - rear.members[0].s))) <= B.gap) {
            front.members.push(rear.members.shift());
          }
        }
      }
      out.set(b, order.filter((c) => c.members.length));
    }
    // 3. where to draw each carrier: at its riders' average place, and never on top of the carrier in front, so the
    // second carrier of an over-full group rides one carrier behind the first
    this.cars = new Map();
    const result = [];
    for (const [b, cars] of out) {
      const B = buckets.get(b), sort = ahead(B), dir = B.down ? -1 : 1, step = Math.max(1, B.I.spacing || 0);
      for (const c of cars) { c.members.sort(sort); c.s = c.members.reduce((k, m) => k + m.s, 0) / c.members.length; }
      // carriers keep their order along the line from last time (GPS wander must not swap them round); new ones
      // go in by where they are
      const kept = cars.filter((c) => c.rank != null).sort((a, c) => a.rank - c.rank);
      for (const c of cars.filter((k) => k.rank == null).sort((a, k) => (B.down ? a.s - k.s : k.s - a.s))) {
        const i = kept.findIndex((k) => (B.down ? k.s > c.s : k.s < c.s));
        kept.splice(i < 0 ? kept.length : i, 0, c);
      }
      cars.splice(0, cars.length, ...kept);
      let prev = null;
      cars.forEach((c, rank) => {
        if (prev != null && !B.I.one && (prev - c.s) * dir < step) c.s = prev - dir * step;
        prev = c.s;
        const ids = c.members.map((m) => m.id);
        this.cars.set(c.key, { bucket: b, ids, rank });
        result.push({ key: c.key, lift: B.lift, down: B.down, ids, frac: Math.min(1, Math.max(0, c.s / (B.I.len || 1))) });
      });
    }
    return result;
  }
}

function spread(members) {
  let lo = Infinity, hi = -Infinity;
  for (const m of members) { lo = Math.min(lo, m.s); hi = Math.max(hi, m.s); }
  return hi - lo;
}
