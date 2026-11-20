// Put a run line where the ground lets a skier go: keep the run's top and bottom, and find the line closest to
// the drawn one that never climbs (a shortest path over the 1 m terrain, 5 m cells, where climbing costs a lot
// and straying from the drawn line costs a little). For runs drawn on open ground (bowls, above the treeline)
// where an aerial photo shows no cut strip, and that tools/check_downhill.mjs reports as climbing.
//   node tools/fit_terrain.mjs <id> <osm id,...> [--write] [--pic DIR] [--corridor 180]
// --write: hand-drawn runs (ids 9e9 + k) get new points in the config's extra_trails; OpenStreetMap runs get a
// "way_pts" entry (build_data.py moves the way, keeping its end nodes). --pic writes a picture per run
// (hillshade, other runs yellow, drawn line red, fitted line cyan) as .ppm.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Geo, pointAlong, lineLength, nearestOnLine } from '../src/geo.js';

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const WRITE = flag('--write'), TRIM = flag('--trim'), PIC = opt('--pic', null), CORR = +opt('--corridor', 180);
const [id, list] = args;
const resort = JSON.parse(readFileSync(`public/data/${id}/resort.json`, 'utf8'));
const buf = readFileSync(`public/data/${id}/terrain.bin`);
const geo = new Geo(resort, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));
const CELL = 5, CLIMB = 60, STRAY = 1 / 80;   // cost: per metre climbed; per metre walked per metre from the line

function climbOf(pts) {
  const L = lineLength(pts), z = [];
  for (let s = 0; s <= L; s += 10) { const p = pointAlong(pts, s); z.push(geo.elev(p[0], p[1])); }
  if (z[0] < z[z.length - 1]) z.reverse();
  const sm = z.map((_, i) => (z[Math.max(0, i - 1)] + z[i] + z[Math.min(z.length - 1, i + 1)]) / 3);
  let low = sm[0], c = 0;
  for (let i = 1; i < sm.length; i++) { c = Math.max(c, sm[i] - low); low = Math.min(low, sm[i]); }
  return c;
}

// --trim: a hand-drawn run whose end was put across a gully or over a rise keeps only the part from its
// highest point down to the lowest point after it (the build joins the new end to the nearest run)
function trimmed(pts) {
  const L = lineLength(pts), s = [];
  for (let d = 0; d <= L; d += 10) { const p = pointAlong(pts, d); s.push([p[0], p[1], geo.elev(p[0], p[1])]); }
  let hi = 0; for (let i = 1; i < s.length; i++) if (s[i][2] > s[hi][2]) hi = i;
  let lo = hi; for (let i = hi + 1; i < s.length; i++) if (s[i][2] < s[lo][2]) lo = i;
  if (hi === 0 && lo === s.length - 1) return pts;
  const out = [];
  for (let i = hi; i <= lo; i += 2) out.push(s[i][0], s[i][1]);
  if ((lo - hi) % 2) out.push(s[lo][0], s[lo][1]);
  return out;
}

function fit(t) {
  let pts = t.pts.slice();
  const n = pts.length;
  if (geo.elev(pts[0], pts[1]) < geo.elev(pts[n - 2], pts[n - 1])) {   // work from the top
    const r = []; for (let i = n - 2; i >= 0; i -= 2) r.push(pts[i], pts[i + 1]); pts = r;
  }
  if (TRIM && t.traced) pts = trimmed(pts);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  x0 -= CORR; y0 -= CORR; x1 += CORR; y1 += CORR;
  const nx = Math.ceil((x1 - x0) / CELL) + 1, ny = Math.ceil((y1 - y0) / CELL) + 1, N = nx * ny;
  const Z = new Float32Array(N), D = new Float32Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * CELL, y = y0 + j * CELL, k = j * nx + i;
    Z[k] = geo.elev(x, y); D[k] = nearestOnLine(pts, x, y).d;
  }
  const cellOf = (x, y) => Math.round((y - y0) / CELL) * nx + Math.round((x - x0) / CELL);
  const s = cellOf(pts[0], pts[1]), e = cellOf(pts[pts.length - 2], pts[pts.length - 1]);
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  // binary heap
  const hk = [], hv = [];
  const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const k = hk[0], v = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < hk.length && hv[a] < hv[m]) m = a; if (b < hk.length && hv[b] < hv[m]) m = b; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return [k, v]; };
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  dist[s] = 0; push(s, 0);
  while (hk.length) {
    const [k, v] = pop();
    if (v > dist[k]) continue;
    if (k === e) break;
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of NB) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const q = b * nx + a;
      if (D[q] > CORR) continue;
      const len = Math.hypot(di, dj) * CELL, dz = Z[q] - Z[k];
      const c = len * (1 + D[q] * STRAY) + CLIMB * Math.max(0, dz);
      if (v + c < dist[q]) { dist[q] = v + c; prev[q] = k; push(q, v + c); }
    }
  }
  if (prev[e] < 0) return null;
  const path = [];
  for (let k = e; k >= 0; k = prev[k]) { path.push([x0 + (k % nx) * CELL, y0 + ((k / nx) | 0) * CELL]); if (k === s) break; }
  path.reverse();
  // smooth (keep the ends) and thin to about every 20 m
  const sm = path.map((p, i) => {
    if (i < 2 || i > path.length - 3) return p;
    let sx = 0, sy = 0, c = 0;
    for (let d = -3; d <= 3; d++) { const q = path[Math.min(path.length - 1, Math.max(0, i + d))]; sx += q[0]; sy += q[1]; c++; }
    return [sx / c, sy / c];
  });
  const flat = sm.flat(), L = lineLength(flat), out = [];
  for (let d = 0; d < L; d += 20) { const p = pointAlong(flat, d); out.push(p[0], p[1]); }
  out.push(flat[flat.length - 2], flat[flat.length - 1]);
  let shift = 0, m = 0;
  for (let i = 0; i < out.length; i += 2) { shift += nearestOnLine(pts, out[i], out[i + 1]).d; m++; }
  return { pts: out, from: pts, shift: shift / m, max: Math.max(...Array.from({ length: m }, (_, i) => nearestOnLine(pts, out[2 * i], out[2 * i + 1]).d)) };
}

function picture(t, r) {
  const all = [...r.pts, ...r.from];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < all.length; i += 2) { x0 = Math.min(x0, all[i]); x1 = Math.max(x1, all[i]); y0 = Math.min(y0, all[i + 1]); y1 = Math.max(y1, all[i + 1]); }
  x0 -= 250; y0 -= 250; x1 += 250; y1 += 250;
  const sc = Math.max(1, Math.max(x1 - x0, y1 - y0) / 900), W = Math.ceil((x1 - x0) / sc), H = Math.ceil((y1 - y0) / sc);
  const img = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i * sc, y = y1 - j * sc, z = geo.elev(x, y);
    const dx = geo.elev(x + 3, y) - geo.elev(x - 3, y), dy = geo.elev(x, y + 3) - geo.elev(x, y - 3);
    let v = 150 + (-dx + dy) * 9; v = Math.max(20, Math.min(240, v));
    const c = ((z / 20) | 0) % 2 ? 0 : 12;            // contour bands every 20 m
    const o = (j * W + i) * 3; img[o] = img[o + 1] = img[o + 2] = v - c;
  }
  const line = (p, rgb, w) => {
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = (p[i] - x0) / sc, ay = (y1 - p[i + 1]) / sc, bx = (p[i + 2] - x0) / sc, by = (y1 - p[i + 3]) / sc;
      const n = Math.ceil(Math.hypot(bx - ax, by - ay)) + 1;
      for (let k = 0; k <= n; k++) {
        const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n);
        for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) { const X = x + a, Y = y + b; if (X >= 0 && Y >= 0 && X < W && Y < H) { const o = (Y * W + X) * 3; img[o] = rgb[0]; img[o + 1] = rgb[1]; img[o + 2] = rgb[2]; } }
      }
    }
  };
  for (const u of resort.trails) if (u !== t) line(u.pts, [230, 200, 0], 0);
  for (const u of resort.lifts) line(u.pts, [200, 40, 40], 0);
  line(r.from, [255, 0, 0], 1); line(r.pts, [0, 230, 255], 1);
  mkdirSync(PIC, { recursive: true });
  writeFileSync(`${PIC}/${(t.name || t.osm + '').replace(/[\/ ]/g, '_')}_${t.osm}.ppm`, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), img]));
}

const want = new Set(list.split(','));
const cfgf = `tools/resorts/${id}.json`, cfg = JSON.parse(readFileSync(cfgf, 'utf8'));
let changed = 0;
for (const t of resort.trails.filter((u) => want.has(String(u.osm)))) {
  const before = climbOf(t.pts), r = fit(t);
  if (!r) { console.log(`${t.name} (${t.osm}): no downhill line found within ${CORR} m`); continue; }
  const after = climbOf(r.pts);
  // the fitted line may have slid into another mapped run's gully: then it is that run, not this one
  let on = 0, tot = 0, who = {};
  for (let i = 0; i < r.pts.length; i += 2) {
    tot++;
    for (const u of resort.trails) {
      if (u === t || (u.name && u.name === t.name)) continue;
      if (nearestOnLine(u.pts, r.pts[i], r.pts[i + 1]).d < 20) { on++; who[u.name || '#'] = (who[u.name || '#'] || 0) + 1; break; }
    }
  }
  const taken = on >= 0.4 * tot ? Object.keys(who).sort((a, b) => who[b] - who[a])[0] : null;
  if (taken) console.log(`  the fitted line follows the mapped run ${taken} for ${Math.round(100 * on / tot)}% of its length: not written`);
  console.log(`${t.name}${t.traced ? ' [traced]' : ''} (${t.osm}): climbs ${before.toFixed(0)} m -> ${after.toFixed(0)} m; moved ${r.shift.toFixed(0)} m on average, ${r.max.toFixed(0)} m at most`);
  if (PIC) picture(t, r);
  if (!WRITE || after >= before || taken) continue;
  const ll = []; for (let i = 0; i < r.pts.length; i += 2) { const [lat, lon] = geo.toLatLon(r.pts[i], r.pts[i + 1]); ll.push([+lon.toFixed(5), +lat.toFixed(5)]); }
  if (t.traced) {
    const k = t.osm - 9e9, e = cfg.extra_trails[k];
    if (!e || e.name !== t.name) { console.log('  not written: extra_trails entry not found'); continue; }
    e.pts = ll; e.fitted = `terrain: never climbs, moved ${r.shift.toFixed(0)} m on average`;
  } else {
    cfg.way_pts = cfg.way_pts || {}; cfg.way_pts[String(t.osm)] = { pts: ll, len: Math.round(lineLength(t.pts)), why: `terrain: the drawn line climbs ${before.toFixed(0)} m` };
  }
  changed++;
}
if (changed) { writeFileSync(cfgf, JSON.stringify(cfg, null, 1) + '\n'); console.log(`${changed} runs written to ${cfgf}`); }
