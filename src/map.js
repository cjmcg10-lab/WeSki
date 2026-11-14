// The resort map: low-poly 3D mountain built from the LiDAR grid, with a one-tap
// top-down 2D mode. Trails, lifts, buildings, POIs, friends, routes and tracks are
// all placed at their real coordinates.
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import * as M from './models.js';

export const COLORS = {
  diff: ['#1fa750', '#2b7de9', '#16181d', '#a3122f'],
  slow: '#ffd21f',
  park: '#b455ff',
  lift: '#e03131',
  route: '#00d5ff',
  closed: '#8d949e',
  me: '#0a84ff',
};
const POI_STYLE = {
  lodge: ['#14365f', 'L', 0], lift: ['#e03131', '↑', 1], food: ['#c7641a', 'F', 3], peak: ['#5d6875', '▲', 2],
  service: ['#59636e', '•', 4], parking: ['#3b6ea8', 'P', 4], shelter: ['#59636e', '•', 4], lifttop: ['#e03131', '', 9],
};

export class SkiMap {
  constructor(container, resort, geo) {
    this.el = container;
    this.resort = resort;
    this.geo = geo;
    this.mode = '3d';
    this.friends = new Map();   // id -> {data, obj}
    this.closed = new Set();
    this.hits = [];
    this.tapHandlers = [];
    this.units = 'imperial';
    this.clock = new THREE.Clock();
    this.t = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(r.domElement);
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'map-overlay';
    container.appendChild(this.overlay);
    this.ctx = this.overlay.getContext('2d');

    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color('#b9d7f0');
    s.fog = new THREE.Fog('#b9d7f0', 6000, 22000);
    s.add(new THREE.HemisphereLight('#ffffff', '#7f93a8', 1.15));
    const sun = new THREE.DirectionalLight('#fff3df', 1.9);
    sun.position.set(-0.6, 0.8, 0.45);
    s.add(sun);

    this.cam3 = new THREE.PerspectiveCamera(42, 1, 8, 40000);
    this.cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
    this.cam2.up.set(0, 0, -1);
    this.camera = this.cam3;
    this.zoom2 = 0.09; // px per metre in 2D
    this.center2 = new THREE.Vector3();

    this.buildTerrain();
    this.buildTrees();
    this.buildTrails();
    this.buildLifts();
    this.buildBuildings();
    this.buildMarkers();

    const c = (this.controls = new MapControls(this.cam3, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.maxPolarAngle = THREE.MathUtils.degToRad(80);
    c.minDistance = 120;
    c.maxDistance = 9500;
    c.zoomSpeed = 1.2;
    // Opening view: the whole mountain from the east (base areas in front, summit behind).
    const mid = this.world(geo.W * 0.5, geo.H * 0.5, 0);
    c.target.set(mid.x, this.groundY(mid.x, mid.z), mid.z);
    this.cam3.position.set(mid.x + 3900, c.target.y + 2500, mid.z - 2300);
    c.update();

    this.bind2D();
    this.bindTap();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.running = true;
    document.addEventListener('visibilitychange', () => { this.running = document.visibilityState === 'visible'; if (this.running) this.loop(); });
    this.loop();
  }

  // ---------- coordinates
  world(x, y, lift = 0) {
    return new THREE.Vector3(x - this.geo.W / 2, this.geo.elev(x, y) - this.resort.grid.zmin + lift, -(y - this.geo.H / 2));
  }
  local(wx, wz) { return [wx + this.geo.W / 2, this.geo.H / 2 - wz]; }
  groundY(wx, wz) { const [x, y] = this.local(wx, wz); return this.geo.elev(x, y) - this.resort.grid.zmin; }

  // ---------- scene building
  buildTerrain() {
    const { nx, ny, cell, zmin } = this.resort.grid, h = this.geo.h, geo = this.geo;
    // Snow mask: groomed trails, lift lines and base areas are open snow, the rest is forest.
    const mask = new Float32Array(nx * ny);
    const stamp = (x, y, rad, v) => {
      const r = Math.ceil(rad / cell), ci = Math.round(x / cell), cj = Math.round(y / cell);
      for (let j = Math.max(0, cj - r); j <= Math.min(ny - 1, cj + r); j++)
        for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
          const d = Math.hypot(i * cell - x, j * cell - y);
          if (d <= rad) mask[j * nx + i] = Math.max(mask[j * nx + i], v * Math.min(1, 1.6 - d / rad));
        }
    };
    for (const t of this.resort.trails) for (let i = 0; i < t.pts.length; i += 2) stamp(t.pts[i], t.pts[i + 1], t.glade ? 12 : t.d === 0 ? 30 : 24, t.glade ? 0.45 : 1);
    for (const b of this.resort.buildings) stamp(b.pts[0], b.pts[1], 34, 0.8);
    for (const l of this.resort.lifts) {
      const n = Math.ceil(l.len / 12);
      for (let k = 0; k <= n; k++) {
        const f = k / n, x = l.pts[0] + (l.pts[l.pts.length - 2] - l.pts[0]) * f, y = l.pts[1] + (l.pts[l.pts.length - 1] - l.pts[1]) * f;
        stamp(x, y, 12, 0.55);
      }
    }
    this.snowMask = mask;
    const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3);
    const snow = new THREE.Color('#f4f8fc'), f1 = new THREE.Color('#1f4a34'), f2 = new THREE.Color('#34704b'), rime = new THREE.Color('#9fb9b4'), rock = new THREE.Color('#6f7780');
    const c = new THREE.Color();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = j * nx + i, z = h[o] / 10;
      pos[o * 3] = i * cell - geo.W / 2; pos[o * 3 + 1] = z; pos[o * 3 + 2] = -(j * cell - geo.H / 2);
      const noise = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
      c.copy(f1).lerp(f2, Math.abs(noise));
      const alt = z + zmin;
      if (alt > 950) c.lerp(rime, Math.min(1, (alt - 950) / 220) * 0.8);
      if (i > 0 && i < nx - 1 && j > 0 && j < ny - 1) {
        const sl = Math.hypot(h[o + 1] - h[o - 1], h[o + nx] - h[o - nx]) / 10 / (2 * cell);
        if (sl > 0.75) c.lerp(rock, Math.min(1, (sl - 0.75) * 3));
      }
      c.lerp(snow, Math.min(1, mask[o]));
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    let k = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = e; idx[k++] = a; idx[k++] = e; idx[k++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.scene.add(this.terrain);
    // skirt so the model reads as a solid block
    const base = new THREE.Mesh(new THREE.BoxGeometry(geo.W, 60, geo.H), new THREE.MeshLambertMaterial({ color: '#56616e' }));
    base.position.y = -31;
    this.scene.add(base);
  }

  buildTrees() {
    const { nx, ny, cell } = this.resort.grid, mask = this.snowMask;
    // only plant near the ski terrain (keeps the instance count phone-friendly)
    const q = 6, qx = Math.ceil(nx / q), qy = Math.ceil(ny / q), near = new Uint8Array(qx * qy);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (mask[j * nx + i] > 0.3) {
      const ci = (i / q) | 0, cj = (j / q) | 0;
      for (let b = Math.max(0, cj - 5); b <= Math.min(qy - 1, cj + 5); b++) for (let a = Math.max(0, ci - 5); a <= Math.min(qx - 1, ci + 5); a++) near[b * qx + a] = 1;
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots = [];
    for (let j = 1; j < ny - 1; j += 2) for (let i = 1; i < nx - 1; i += 2) {
      if (!near[((j / q) | 0) * qx + ((i / q) | 0)] || mask[j * nx + i] > 0.25) continue;
      if (rnd() < 0.42) spots.push([(i + rnd() * 1.6 - 0.8) * cell, (j + rnd() * 1.6 - 0.8) * cell, rnd()]);
    }
    const mesh = new THREE.InstancedMesh(M.treeGeometry(), new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
    spots.forEach(([x, y, r], i) => {
      const p = this.world(x, y, -0.5), s = 2.3 + r * 1.6;
      m.compose(p, qn, sc.set(s * 1.25, s, s * 1.25));
      mesh.setMatrixAt(i, m);
      const alt = p.y + this.resort.grid.zmin;
      c.set('#234f37').lerp(new THREE.Color('#3f7d55'), r).lerp(new THREE.Color('#c9d8d6'), alt > 980 ? Math.min(0.7, (alt - 980) / 250) : 0);
      mesh.setColorAt(i, c);
    });
    this.trees = mesh;
    this.scene.add(mesh);
  }

  /** flat [x,y,...] polyline -> segment-pair world positions at `lift` metres above the snow */
  segs(pts, lift, out = []) {
    let prev = null;
    for (let i = 0; i < pts.length; i += 2) {
      const p = this.world(pts[i], pts[i + 1], lift);
      if (prev) out.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
    return out;
  }

  fatLine(positions, color, width, opts = {}) {
    const g = new LineSegmentsGeometry();
    g.setPositions(positions.length ? positions : [0, -500, 0, 0, -500, 0]);
    if (opts.colors) g.setColors(opts.colors);
    const mat = new LineMaterial({
      color: opts.colors ? '#ffffff' : color, linewidth: width, vertexColors: !!opts.colors,
      transparent: true, opacity: opts.opacity ?? 1,
      depthTest: !opts.overlay, depthWrite: false, worldUnits: !!opts.world,
      dashed: !!opts.dash, dashSize: opts.dash?.[0] ?? 1, gapSize: opts.dash?.[1] ?? 1,
    });
    const line = new LineSegments2(g, mat);
    if (opts.dash) line.computeLineDistances();
    line.renderOrder = opts.order ?? 1;
    line.frustumCulled = false;
    return line;
  }

  buildTrails() {
    if (this.trailGroup) { this.scene.remove(this.trailGroup); this.trailGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    const G = (this.trailGroup = new THREE.Group());
    const R = this.resort, closed = this.closed;
    const slow = [], casing = [], shut = [];
    const byStyle = {};
    for (const t of R.trails) {
      if (t.slow) this.segs(t.pts, 2, slow);
      if (closed.has('t' + t.id)) { this.segs(t.pts, 3.2, shut); continue; }
      if (!t.glade) this.segs(t.pts, 2.7, casing);
      const key = t.d + (t.glade ? 'g' : '');
      this.segs(t.pts, 3.2, (byStyle[key] ||= []));
    }
    for (const a of R.areas) this.segs(a.pts.concat(a.pts.slice(0, 2)), 3.2, (byStyle[a.d + 'g'] ||= []));
    // Zone overlays sit under the trail lines: wide translucent bands in their own colours.
    G.add(this.fatLine(slow, COLORS.slow, 38, { opacity: 0.45, order: 1, world: true }));
    const park = [];
    for (const p of R.parks) this.segs(p.pts, 2.3, park);
    G.add(this.fatLine(park, COLORS.park, 34, { opacity: 0.78, order: 2, world: true }));
    G.add(this.fatLine(casing, '#ffffff', 5.5, { order: 3 }));
    for (const [key, pos] of Object.entries(byStyle)) {
      const glade = key.endsWith('g');
      G.add(this.fatLine(pos, COLORS.diff[+key[0]], glade ? 2.6 : 3.2, { order: 4, dash: glade ? [16, 11] : null }));
    }
    G.add(this.fatLine(shut, COLORS.closed, 3, { order: 4, dash: [8, 10] }));
    this.scene.add(G);
    // label anchors: one per trail name (longest segment)
    const best = new Map();
    for (const t of R.trails) if (t.name && (!best.has(t.name) || best.get(t.name).len < t.len)) best.set(t.name, t);
    this.trailLabels = [...best.values()].map((t) => {
      const i = Math.floor(t.pts.length / 4) * 2;
      return { t, p: this.world(t.pts[i], t.pts[i + 1], 14) };
    });
    for (const a of R.areas) if (a.name) this.trailLabels.push({ t: { name: a.name, d: a.d, id: -1, len: 400 }, p: this.world(a.pts[0], a.pts[1], 14) });
    this.parkLabels = [];
    const seen = new Set();
    for (const p of R.parks) if (!seen.has(p.name)) {
      seen.add(p.name);
      const i = Math.floor(p.pts.length / 4) * 2;
      this.parkLabels.push({ name: p.name, p: this.world(p.pts[i], p.pts[i + 1], 14) });
    }
  }

  buildLifts() {
    const R = this.resort;
    this.liftPaths = [];
    const cable = [], towerMats = [], stationGeos = [];
    let chairCount = 0;
    for (const l of R.lifts) {
      const n = l.pts.length / 2, th = l.kind === 'tram' ? 26 : l.kind === 'carpet' ? 0.6 : 9.5;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const end = i === 0 || i === n - 1;
        pts.push(this.world(l.pts[i * 2], l.pts[i * 2 + 1], end ? Math.min(th, l.kind === 'tram' ? 12 : 4.2) : th));
      }
      const cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const path = { l, pts, cum, L: cum[n - 1], chairs: 0, first: chairCount };
      for (let i = 1; i < n; i++) cable.push(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z);
      const dir = pts[n - 1].clone().sub(pts[0]).setY(0).normalize(), yaw = Math.atan2(dir.x, dir.z);
      if (l.kind !== 'carpet') {
        for (let i = 1; i < n - 1; i++) towerMats.push({ p: this.world(l.pts[i * 2], l.pts[i * 2 + 1], 0), yaw, h: th, arm: l.kind === 'tram' ? 12 : 6 });
        for (const e of [0, n - 1]) {
          const g = M.stationGeometry(l.kind, l.kind === 'tram' ? 0 : 0x8b2f2f);
          const base = this.world(l.pts[e * 2], l.pts[e * 2 + 1], 0);
          g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(base.x - dir.x * (e ? -3 : 3), base.y - 1, base.z - dir.z * (e ? -3 : 3)));
          stationGeos.push(g);
        }
      }
      if (l.kind === 'chair') { path.chairs = Math.max(4, Math.floor((2 * path.L) / (l.name.includes('Express') ? 70 : 48))); chairCount += path.chairs; }
      this.liftPaths.push(path);
    }
    this.liftLine = this.fatLine(cable, COLORS.lift, 2.6, { order: 5 });
    this.scene.add(this.liftLine);
    // towers: group by height so each height is one instanced mesh
    for (const [h, arm] of [[9.5, 6], [26, 12]]) {
      const list = towerMats.filter((t) => t.h === h);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(M.towerGeometry(h, arm), M.vcMat(), list.length);
      const m = new THREE.Matrix4();
      list.forEach((t, i) => { m.makeRotationY(t.yaw).setPosition(t.p.x, t.p.y - 1, t.p.z); mesh.setMatrixAt(i, m); });
      this.scene.add(mesh);
    }
    for (const g of stationGeos) this.scene.add(new THREE.Mesh(g, M.vcMat()));
    this.chairs = new THREE.InstancedMesh(M.chairGeometry(4), M.vcMat(), Math.max(1, chairCount));
    this.chairs.frustumCulled = false;
    this.scene.add(this.chairs);
    const tram = this.liftPaths.find((p) => p.l.kind === 'tram');
    this.tram = tram ? { path: tram, cabins: [new THREE.Mesh(M.tramGeometry(0xd32f2f), M.vcMat()), new THREE.Mesh(M.tramGeometry(0x2e8b57), M.vcMat())] } : null;
    if (this.tram) for (const c of this.tram.cabins) { c.scale.setScalar(1.5); this.scene.add(c); }
    this.liftLabels = this.liftPaths.map((p) => ({ l: p.l, p: this.pathPoint(p, p.L * 0.5, 0).pos.clone().add(new THREE.Vector3(0, 10, 0)) }));
  }

  /** Position + yaw at distance d along a lift cable, shifted sideways by `side` metres. */
  pathPoint(path, d, side) {
    const { pts, cum } = path;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const pos = pts[i - 1].clone().lerp(pts[i], Math.min(1, Math.max(0, f)));
    const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z, len = Math.hypot(dx, dz) || 1;
    pos.x += (-dz / len) * side; pos.z += (dx / len) * side;
    return { pos, yaw: Math.atan2(dx, dz) };
  }

  animateLifts(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1.6, 1.6, 1.6), up = new THREE.Vector3(0, 1, 0);
    for (const p of this.liftPaths) {
      if (!p.chairs) continue;
      const running = !this.closed.has('l' + p.l.id);
      const speed = (p.l.name.includes('Express') ? 5 : 2.4) * 2.5; // sped up a little so motion reads at map scale
      const loop = 2 * p.L, gap = loop / p.chairs;
      for (let i = 0; i < p.chairs; i++) {
        const u = (i * gap + (running ? t * speed : 0)) % loop, upward = u < p.L;
        const { pos, yaw } = this.pathPoint(p, upward ? u : loop - u, upward ? 2.3 : -2.3);
        q.setFromAxisAngle(up, upward ? yaw : yaw + Math.PI);
        this.chairs.setMatrixAt(p.first + i, m.compose(pos, q, s));
      }
    }
    this.chairs.instanceMatrix.needsUpdate = true;
    if (this.tram) {
      const p = this.tram.path, running = !this.closed.has('l' + p.l.id);
      const ride = 70, dwell = 10, cyc = 2 * (ride + dwell), ph = running ? t % cyc : 0;
      const tri = ph < ride ? ph / ride : ph < ride + dwell ? 1 : ph < 2 * ride + dwell ? 1 - (ph - ride - dwell) / ride : 0;
      const e = tri * tri * (3 - 2 * tri);
      this.tram.cabins.forEach((c, i) => {
        const { pos, yaw } = this.pathPoint(p, p.L * (i ? 1 - e : e), i ? -5 : 5);
        c.position.copy(pos); c.rotation.y = yaw;
      });
    }
  }

  buildBuildings() {
    const out = { pos: [], col: [] };
    const walls = ['#c9b79c', '#b89f7f', '#d8cdb9', '#a98a69'].map((c) => new THREE.Color(c));
    const roofs = ['#4c5563', '#6b3b33', '#3f4a45'].map((c) => new THREE.Color(c));
    this.resort.buildings.forEach((b, bi) => {
      const ring = [];
      let base = Infinity;
      for (let i = 0; i < b.pts.length; i += 2) {
        const p = this.world(b.pts[i], b.pts[i + 1], 0);
        ring.push([p.x, p.z]); base = Math.min(base, p.y);
      }
      // local y north -> world -z flips the winding; restore counter-clockwise for the roof triangulation
      ring.reverse();
      M.addBuilding(out, ring, base, b.h, walls[bi % walls.length], roofs[bi % roofs.length], b.roof || b.h > 12);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    g.computeVertexNormals();
    this.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
  }

  buildMarkers() {
    this.meObj = new THREE.Group();
    this.meObj.visible = false;
    this.scene.add(this.meObj);
    this.pinObj = M.makePin('#ff3b30'); this.pinObj.visible = false; this.scene.add(this.pinObj);
    this.meetObj = M.makeFlag('#ff9f0a'); this.meetObj.visible = false; this.scene.add(this.meetObj);
    this.routeLine = null; this.trackLine = null;
    this.playObj = M.makeAvatar('boy-ski', '#ff9f0a'); this.playObj.visible = false; this.scene.add(this.playObj);
  }

  // ---------- public state setters
  setMode(mode) {
    if (mode === this.mode) return;
    const c = this.controls;
    if (mode === '2d') {
      this.center2.copy(c.target);
      const dist = this.cam3.position.distanceTo(c.target);
      this.zoom2 = this.h / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.cam3.fov / 2)));
      c.enabled = false;
      this.camera = this.cam2;
    } else {
      const dist = this.h / (2 * this.zoom2 * Math.tan(THREE.MathUtils.degToRad(this.cam3.fov / 2)));
      const off = this.cam3.position.clone().sub(c.target).setLength(Math.min(9000, Math.max(200, dist)));
      c.target.set(this.center2.x, this.groundY(this.center2.x, this.center2.z), this.center2.z);
      this.cam3.position.copy(c.target).add(off);
      c.enabled = true;
      this.camera = this.cam3;
    }
    this.mode = mode;
    this.trees.visible = mode === '3d';
    this.clamp2();
  }

  setClosures(set) { this.closed = new Set(set); this.buildTrails(); }
  setUnits(u) { this.units = u; }

  setMe(me) {
    // me: {x, y, heading, avatar, color, name} | null
    this.me = me;
    if (!me) { this.meObj.visible = false; return; }
    const key = me.avatar + me.color;
    if (this.meObj.userData.key !== key) {
      this.meObj.clear();
      this.meObj.add(M.makeAvatar(me.avatar, me.color), M.makeRing(COLORS.me));
      this.meObj.userData.key = key;
    }
    this.meObj.position.copy(this.world(me.x, me.y, 0.4));
    if (me.heading != null) this.meObj.rotation.y = Math.PI - me.heading;
  }

  /** friends: [{id, name, avatar, color, x, y, heading, age (s), stale, paused, online}] */
  setFriends(list) {
    const ids = new Set(list.map((f) => f.id));
    for (const [id, f] of this.friends) if (!ids.has(id)) { this.scene.remove(f.obj); this.friends.delete(id); }
    for (const d of list) {
      let f = this.friends.get(d.id);
      const key = d.avatar + d.color + (d.stale ? 's' : '');
      if (!f || f.key !== key) {
        if (f) this.scene.remove(f.obj);
        const obj = new THREE.Group();
        obj.add(M.makeAvatar(d.avatar, d.stale ? '#8d949e' : d.color), M.makeRing(d.stale ? '#8d949e' : d.color));
        this.scene.add(obj);
        f = { obj, key };
        this.friends.set(d.id, f);
      }
      f.data = d;
      f.obj.position.copy(this.world(d.x, d.y, 0.4));
      if (d.heading != null) f.obj.rotation.y = Math.PI - d.heading;
    }
  }

  setPin(p) { this.pin = p; this.pinObj.visible = !!p; if (p) this.pinObj.position.copy(this.world(p.x, p.y, 0)); }
  setMeet(p) { this.meet = p; this.meetObj.visible = !!p; if (p) this.meetObj.position.copy(this.world(p.x, p.y, 0)); }

  setRoute(pts) {
    if (this.routeLine) { for (const l of this.routeLine) { this.scene.remove(l); l.geometry.dispose(); l.material.dispose(); } this.routeLine = null; }
    if (!pts || pts.length < 4) return;
    const pos = this.segs(densify(pts, 12), 6);
    this.routeLine = [this.fatLine(pos, '#06304a', 9, { overlay: true, opacity: 0.85, order: 20 }), this.fatLine(pos, COLORS.route, 5.5, { overlay: true, order: 21 })];
    for (const l of this.routeLine) this.scene.add(l);
  }

  /** Recorded track for playback: points [[t,x,y,z,state,gap],...] */
  setTrack(points) {
    if (this.trackLine) { this.scene.remove(this.trackLine); this.trackLine.geometry.dispose(); this.trackLine.material.dispose(); this.trackLine = null; }
    this.playObj.visible = false;
    if (!points || points.length < 2) return;
    const pos = [], col = [], c = new THREE.Color();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (b[5]) continue;
      const pa = this.world(a[1], a[2], 5), pb = this.world(b[1], b[2], 5);
      pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      c.set(b[4] === 1 ? '#ff7a1a' : b[4] === 2 ? '#c9ced6' : '#ffd9a8');
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    this.trackLine = this.fatLine(pos, '#fff', 4.5, { colors: col, overlay: true, order: 19 });
    this.scene.add(this.trackLine);
  }

  setPlayhead(p) {
    this.playObj.visible = !!p;
    if (!p) return;
    this.playObj.position.copy(this.world(p.x, p.y, 0.4));
    if (p.heading != null) this.playObj.rotation.y = Math.PI - p.heading;
    this.play = p;
  }

  /** Smoothly centre the map on a local point. */
  focus(x, y, dist = 900) {
    const p = this.world(x, y, 0);
    if (this.mode === '2d') { this.center2.copy(p); this.zoom2 = Math.max(this.zoom2, 0.35); this.clamp2(); return; }
    const c = this.controls, off = this.cam3.position.clone().sub(c.target);
    if (off.length() > dist * 2.5 || off.length() < dist * 0.3) off.setLength(dist);
    c.target.copy(p);
    this.cam3.position.copy(p).add(off);
  }

  /** Fit a flat polyline (e.g. a route or a track) in view. */
  fit(pts) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    const span = Math.max(x1 - x0, y1 - y0, 250);
    if (this.mode === '2d') { this.center2.copy(this.world((x0 + x1) / 2, (y0 + y1) / 2, 0)); this.zoom2 = Math.min(1.2, (Math.min(this.w, this.h) * 0.7) / span); this.clamp2(); }
    else {
      const p = this.world((x0 + x1) / 2, (y0 + y1) / 2, 0), c = this.controls;
      const off = this.cam3.position.clone().sub(c.target).setLength(Math.min(9000, span * 1.9 + 300));
      c.target.copy(p); this.cam3.position.copy(p).add(off);
    }
  }

  onTap(fn) { this.tapHandlers.push(fn); }

  // ---------- interaction
  bind2D() {
    const el = this.renderer.domElement, ptrs = new Map();
    let last = null;
    const state = () => {
      const p = [...ptrs.values()];
      if (p.length === 1) return { x: p[0].x, y: p[0].y, d: 0 };
      return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
    };
    el.addEventListener('pointerdown', (e) => { if (this.mode !== '2d') return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = state(); });
    el.addEventListener('pointermove', (e) => {
      if (this.mode !== '2d' || !ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = state();
      if (last) {
        if (s.d && last.d) this.zoomAt(s.x, s.y, s.d / last.d);
        this.center2.x -= (s.x - last.x) / this.zoom2;
        this.center2.z -= (s.y - last.y) / this.zoom2;
        this.clamp2();
      }
      last = s;
    });
    const up = (e) => { ptrs.delete(e.pointerId); last = ptrs.size ? state() : null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    el.addEventListener('wheel', (e) => { if (this.mode !== '2d') return; e.preventDefault(); const r = el.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }

  zoomAt(sx, sy, k) {
    const z0 = this.zoom2, z1 = Math.min(2.5, Math.max(this.minZoom2(), z0 * k));
    // keep the point under the fingers fixed
    const dx = sx - this.w / 2, dy = sy - this.h / 2;
    this.center2.x += dx / z0 - dx / z1;
    this.center2.z += dy / z0 - dy / z1;
    this.zoom2 = z1;
    this.clamp2();
  }
  minZoom2() { return Math.min(this.w / this.geo.W, this.h / this.geo.H) * 0.85; }
  clamp2() {
    this.zoom2 = Math.max(this.zoom2, this.minZoom2());
    this.center2.x = Math.min(this.geo.W / 2, Math.max(-this.geo.W / 2, this.center2.x));
    this.center2.z = Math.min(this.geo.H / 2, Math.max(-this.geo.H / 2, this.center2.z));
  }

  bindTap() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), multi: false } : (down && (down.multi = true), down); });
    el.addEventListener('pointerup', (e) => {
      if (!down || !e.isPrimary) return;
      const ok = !down.multi && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 9 && performance.now() - down.t < 450;
      down = null;
      if (!ok) return;
      const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      let best = null;
      for (const h of this.hits) { const d = Math.hypot(h.x - sx, h.y - sy); if (d < h.r && (!best || d - h.r < best.s)) best = { h, s: d - h.r }; }
      let ev;
      if (best) ev = best.h.ev;
      else { const g = this.pickGround(sx, sy); if (!g) return; ev = { type: 'ground', x: g[0], y: g[1] }; }
      for (const fn of this.tapHandlers) fn(ev);
    });
  }

  /** Screen point -> local ground coords by marching a ray over the heightfield. */
  pickGround(sx, sy) {
    const ndc = new THREE.Vector3((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5);
    if (this.mode === '2d') {
      const x = this.center2.x + (sx - this.w / 2) / this.zoom2, z = this.center2.z + (sy - this.h / 2) / this.zoom2;
      const l = this.local(x, z);
      return this.geo.inBounds(l[0], l[1]) ? l : null;
    }
    const o = this.cam3.position.clone(), d = ndc.unproject(this.cam3).sub(o).normalize();
    for (let t = 20, step = 12; t < 30000; t += step, step *= 1.02) {
      const p = o.clone().addScaledVector(d, t), l = this.local(p.x, p.z);
      if (!this.geo.inBounds(l[0], l[1])) { if (p.y < -50) return null; continue; }
      if (p.y <= this.groundY(p.x, p.z)) return l;
    }
    return null;
  }

  // ---------- frame
  resize() {
    const w = (this.w = this.el.clientWidth || 1), h = (this.h = this.el.clientHeight || 1);
    this.renderer.setSize(w, h);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.overlay.width = w * dpr; this.overlay.height = h * dpr;
    this.overlay.style.width = w + 'px'; this.overlay.style.height = h + 'px';
    this.dpr = dpr;
    this.cam3.aspect = w / h; this.cam3.updateProjectionMatrix();
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    this.t += Math.min(0.1, this.clock.getDelta());
    this.frame();
  }

  frame() {
    const c = this.controls;
    if (this.mode === '3d') {
      c.update();
      // keep the orbit target on the snow and the camera above the terrain
      const tx = Math.min(this.geo.W / 2, Math.max(-this.geo.W / 2, c.target.x)), tz = Math.min(this.geo.H / 2, Math.max(-this.geo.H / 2, c.target.z));
      const ty = this.groundY(tx, tz), dy = (ty - c.target.y) * 0.2;
      this.cam3.position.x += tx - c.target.x; this.cam3.position.z += tz - c.target.z; this.cam3.position.y += dy;
      c.target.set(tx, c.target.y + dy, tz);
      const [lx, ly] = this.local(this.cam3.position.x, this.cam3.position.z);
      if (this.geo.inBounds(lx, ly)) this.cam3.position.y = Math.max(this.cam3.position.y, this.groundY(this.cam3.position.x, this.cam3.position.z) + 25);
      this.cam3.lookAt(c.target);
    } else {
      const cam = this.cam2;
      cam.left = -this.w / 2; cam.right = this.w / 2; cam.top = this.h / 2; cam.bottom = -this.h / 2;
      cam.zoom = this.zoom2;
      cam.position.set(this.center2.x, 6000, this.center2.z);
      cam.lookAt(this.center2.x, 0, this.center2.z);
      cam.updateProjectionMatrix();
    }
    this.animateLifts(this.t);
    // Avatars and markers are scaled with distance so they stay readable at mountain scale.
    const is3 = this.mode === '3d';
    const scaleFor = (obj, k) => {
      const s = is3 ? Math.max(2.2, this.cam3.position.distanceTo(obj.position) * k) : 14 / this.zoom2 / 3;
      obj.scale.setScalar(s);
    };
    if (this.me) { this.meObj.visible = is3; scaleFor(this.meObj, 0.02); }
    for (const f of this.friends.values()) { f.obj.visible = is3; scaleFor(f.obj, 0.02); }
    if (this.pin) scaleFor(this.pinObj, 0.014);
    if (this.meet) scaleFor(this.meetObj, 0.016);
    if (this.playObj.visible) scaleFor(this.playObj, 0.02);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
  }

  project(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.z < -1) return null;
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h, dist: this.mode === '3d' ? this.cam3.position.distanceTo(v) : 1 / this.zoom2 };
  }

  drawOverlay() {
    const ctx = this.ctx, w = this.w, h = this.h, is3 = this.mode === '3d';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.hits = [];
    const boxes = [];
    const free = (x, y, bw, bh) => {
      if (x < -20 || y < 40 || x + bw > w + 20 || y + bh > h - 20) return false;
      for (const b of boxes) if (x < b[0] + b[2] && x + bw > b[0] && y < b[1] + b[3] && y + bh > b[1]) return false;
      boxes.push([x, y, bw, bh]);
      return true;
    };
    // "closeness": 1 = whole mountain in view, larger = zoomed in
    const near = is3 ? 5000 / this.cam3.position.distanceTo(this.controls.target) : this.zoom2 / 0.09;
    const text = (s, x, y, fill, size = 11, weight = 600, align = 'center') => {
      ctx.font = `${weight} ${size}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineJoin = 'round';
      ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y);
    };
    const label = (s, p, fill, size, weight) => {
      ctx.font = `${weight || 600} ${size}px -apple-system, system-ui, sans-serif`;
      const tw = ctx.measureText(s).width;
      if (!free(p.x - tw / 2 - 3, p.y - size / 2 - 2, tw + 6, size + 4)) return false;
      text(s, p.x, p.y, fill, size, weight);
      return true;
    };

    // people first: they always win label space
    const people = [];
    if (this.me) people.push({ ...this.me, id: 'me', name: 'You', me: true, obj: this.meObj });
    for (const f of this.friends.values()) people.push({ ...f.data, obj: f.obj });
    for (const d of people) {
      const p = this.project(d.obj.position);
      if (!p) continue;
      const col = d.stale ? COLORS.closed : d.color;
      let ly;
      if (is3) { const top = this.project(d.obj.position.clone().add(new THREE.Vector3(0, 2.4 * d.obj.scale.y, 0))); ly = (top ? top.y : p.y) - 9; }
      else {
        ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, 7); ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = d.me ? COLORS.me : '#fff'; if (d.stale) ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '700 12px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.fillText((d.name || '?').slice(0, 1).toUpperCase(), p.x, p.y + 0.5);
        ly = p.y + 24;
      }
      const tag = d.me ? 'You' : d.name + (d.paused ? ' · paused' : d.stale ? ` · ${fmtAge(d.age)}` : '');
      ctx.font = '700 12px -apple-system, system-ui, sans-serif';
      const tw = ctx.measureText(tag).width + 14;
      ctx.fillStyle = col; roundRect(ctx, p.x - tw / 2, ly - 9, tw, 18, 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tag, p.x, ly + 0.5);
      boxes.push([p.x - tw / 2, ly - 9, tw, 18]);
      if (!d.me) this.hits.push({ x: p.x, y: is3 ? (p.y + ly) / 2 : p.y, r: 30, ev: { type: 'friend', id: d.id } });
    }
    const marker = (pt, obj, color, name, ev) => {
      const p = this.project(obj.position);
      if (!p) return;
      if (!is3) { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      text(name, p.x, p.y + (is3 ? 12 : 18), color, 11, 700);
      this.hits.push({ x: p.x, y: p.y - (is3 ? 10 : 0), r: 28, ev });
    };
    if (this.pin) marker(this.pin, this.pinObj, '#d92d20', 'Pin', { type: 'pin' });
    if (this.meet) marker(this.meet, this.meetObj, '#c96f00', this.meet.name || 'Meet here', { type: 'meet' });
    if (this.playObj.visible && !is3) {
      const p = this.project(this.playObj.position);
      if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 7); ctx.fillStyle = '#ff7a1a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    }

    // POIs
    const pois = this.poiPts ||= this.resort.pois.map((p) => ({ p, v: this.world(p.x, p.y, p.kind === 'peak' ? 6 : 16) }));
    for (const { p, v } of pois) {
      const st = POI_STYLE[p.kind] || POI_STYLE.service;
      if (st[2] > 1 + near * 1.3 || p.kind === 'lifttop') continue;
      const s = this.project(v);
      if (!s || s.x < -20 || s.x > w + 20 || s.y < 30 || s.y > h) continue;
      if (!free(s.x - 9, s.y - 9, 18, 18)) continue;
      ctx.beginPath(); ctx.arc(s.x, s.y, 8.5, 0, 7); ctx.fillStyle = st[0]; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = '700 10px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(st[1], s.x, s.y + 0.5);
      this.hits.push({ x: s.x, y: s.y, r: 20, ev: { type: 'poi', id: p.id } });
      if (near > 1.6 || st[2] === 0) {
        const name = p.name.replace(' (base)', '');
        ctx.font = '600 10.5px -apple-system, system-ui, sans-serif';
        const tw = ctx.measureText(name).width;
        if (free(s.x - tw / 2 - 2, s.y + 10, tw + 4, 13)) text(name, s.x, s.y + 16.5, '#1c2733', 10.5, 600);
      }
    }
    // zone + lift + trail names
    if (near > 1.5) for (const z of this.parkLabels) { const s = this.project(z.p); if (s) label('⬣ ' + z.name, s, '#7b22c9', 11, 700); }
    if (near > 1.15) for (const z of this.liftLabels) {
      const s = this.project(z.p);
      if (s) label(z.l.name + (this.closed.has('l' + z.l.id) ? ' (closed)' : ''), s, this.closed.has('l' + z.l.id) ? '#6b7280' : '#b01d1d', 11, 700);
    }
    if (near > 1.7) {
      const sym = ['●', '■', '◆', '◆◆'];
      for (const z of this.trailLabels) {
        if (z.t.len < 2600 / near && near < 5) continue;
        const s = this.project(z.p);
        if (!s) continue;
        const shut = this.closed.has('t' + z.t.id);
        label(`${sym[z.t.d]} ${z.t.name}${shut ? ' (closed)' : ''}`, s, shut ? '#6b7280' : COLORS.diff[z.t.d], 10.5, 600);
      }
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function fmtAge(s) {
  if (s == null) return 'no location';
  if (s < 10) return 'just now';
  if (s < 90) return `${Math.round(s / 10) * 10}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function densify(pts, step) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  return out;
}
