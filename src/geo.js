// Projection (lat/lon <-> local metres) and LiDAR terrain sampling.
const basis = (a, b) => [1, a, b, a * a, a * b, b * b, a * a * a, a * a * b, a * b * b, b * b * b];
const dot = (c, v) => { let s = 0; for (let i = 0; i < c.length; i++) s += c[i] * v[i]; return s; };

export class Geo {
  /** @param resort parsed resort.json  @param heights Uint16Array (decimetres above zmin, row 0 = south) */
  constructor(resort, heights) {
    this.p = resort.proj;
    this.g = resort.grid;
    this.h = heights;
    this.W = (this.g.nx - 1) * this.g.cell;
    this.H = (this.g.ny - 1) * this.g.cell;
  }

  toLocal(lat, lon) {
    const v = basis(lon - this.p.lon0, lat - this.p.lat0);
    return [dot(this.p.cx, v), dot(this.p.cy, v)];
  }

  toLatLon(x, y) {
    const v = basis(x - this.p.xm, y - this.p.ym);
    return [this.p.lat0 + dot(this.p.clat, v), this.p.lon0 + dot(this.p.clon, v)];
  }

  inBounds(x, y, pad = 0) {
    return x >= pad && y >= pad && x <= this.W - pad && y <= this.H - pad;
  }

  /** Bilinear ground elevation in metres (clamped to the grid edge). */
  elev(x, y) {
    const { nx, ny, cell, zmin } = this.g;
    const fx = Math.min(Math.max(x / cell, 0), nx - 1.001);
    const fy = Math.min(Math.max(y / cell, 0), ny - 1.001);
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * nx + i, h = this.h;
    return zmin + (h[o] * (1 - u) * (1 - v) + h[o + 1] * u * (1 - v) + h[o + nx] * (1 - u) * v + h[o + nx + 1] * u * v) / 10;
  }
}

/** Distance from point to a flat [x0,y0,x1,y1,...] polyline; returns {d, i, t, x, y, along}. */
export function nearestOnLine(pts, x, y) {
  let best = { d: Infinity, i: 0, t: 0, x: pts[0], y: pts[1], along: 0 };
  let acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py), l = Math.sqrt(l2);
    if (d < best.d) best = { d, i, t, x: px, y: py, along: acc + l * t };
    acc += l;
  }
  return best;
}

export function lineLength(pts) {
  let s = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) s += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
  return s;
}

/** Sub-polyline between two distances along a flat polyline. */
export function sliceLine(pts, from, to) {
  const out = [];
  let acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const l = Math.hypot(bx - ax, by - ay);
    if (acc + l >= from && acc <= to && l > 0) {
      const t0 = Math.max(0, (from - acc) / l), t1 = Math.min(1, (to - acc) / l);
      if (!out.length) out.push(ax + (bx - ax) * t0, ay + (by - ay) * t0);
      out.push(ax + (bx - ax) * t1, ay + (by - ay) * t1);
    }
    acc += l;
  }
  return out;
}

/** Point at a distance along a flat polyline -> [x, y, headingRadians]. */
export function pointAlong(pts, dist) {
  let acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const l = Math.hypot(bx - ax, by - ay);
    if (acc + l >= dist && l > 0) {
      const t = (dist - acc) / l;
      return [ax + (bx - ax) * t, ay + (by - ay) * t, Math.atan2(bx - ax, by - ay)];
    }
    acc += l;
  }
  const n = pts.length;
  return [pts[n - 2], pts[n - 1], n >= 4 ? Math.atan2(pts[n - 2] - pts[n - 4], pts[n - 1] - pts[n - 3]) : 0];
}
