// The resort map: low-poly 3D mountain built from the LiDAR grid, with a one-tap
// top-down 2D mode. Trails, lifts, buildings, POIs, friends, routes and tracks are
// all placed at their real coordinates.
import * as THREE from 'three';
import { t } from './i18n.js';
import { placeTr } from './placenames.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import * as M from './models.js';
import { scheme, cls, runColor, runSym } from './rating.js';

const RED_UP = 5;   // metres the red lift line sits above its cables

export const COLORS = {
  diff: ['#1fa750', '#2b7de9', '#16181d', '#a3122f'],
  slow: '#4fe08a',
  park: '#ff8a00',
  track: '#ff2d92',
  lift: '#e03131',
  route: '#00d5ff',
  walk: '#ffb52e',      // the parts of a route done on foot
  closed: '#8d949e',
  me: '#0a84ff',
};
// Zones painted on the snow: tint, symbol, label colour, and what the zone means.
export const ZONES = {
  slow: { rgb: [255, 232, 120], sym: '▽', ink: '#8a6a00', name: 'Slow zone', text: 'Designated slow skiing and riding area.' },
  family: { rgb: [120, 190, 255], sym: '☺', ink: '#1d5fa8', name: 'Family zone', text: 'Family skiing area: gentle terrain, keep speeds down.' },
  learn: { rgb: [150, 232, 178], sym: '◍', ink: '#0b6c34', name: 'Beginner / kids’ area', text: 'Learning area or children’s snow garden.' },
  park: { rgb: [255, 168, 70], sym: '⬣', ink: '#b85a00', name: 'Terrain park', text: 'Jumps, rails, pipes, boardercross and fun slopes.' },
  race: { rgb: [205, 170, 245], sym: '⚑', ink: '#6a2fb5', name: 'Race course', text: 'Race or timed training course; may be closed to the public.' },
  sled: { rgb: [140, 215, 228], sym: '≋', ink: '#0d6c80', name: 'Sledding run', text: 'Toboggan or sledding run. Not a ski run.' },
  extreme: { rgb: [250, 150, 150], sym: '✕', ink: '#a3122f', name: 'Extreme terrain', text: 'Extreme or hike-to terrain, red check pattern. Experts only.' },
  free: { rgb: [168, 178, 190], sym: '≈', ink: '#4a5563', name: 'Freeride / ungroomed', text: 'Ungroomed freeride route or backcountry-style terrain, grey check pattern.' },
};
const POI_STYLE = {
  lodge: ['#14365f', 'L', 0], lift: ['#e03131', '↑', 1], food: ['#c7641a', 'F', 3], peak: ['#5d6875', '▲', 2],
  service: ['#59636e', '•', 4], parking: ['#3b6ea8', 'P', 4], shelter: ['#59636e', '•', 4], lifttop: ['#e03131', '', 9],
};

// Automatic quality steps, best first: pixel ratio cap, share of trees drawn, how far from the
// camera lifts are still animated (metres).
const QUALITY = [
  { pr: 2, trees: 1, lifts: 4500 },
  { pr: 1.5, trees: 0.75, lifts: 3500 },
  { pr: 1.25, trees: 0.5, lifts: 2500 },
  { pr: 1, trees: 0.3, lifts: 1600 },
];

export class SkiMap {
  constructor(container, resort, geo, surroundH = null) {
    this.surroundH = surroundH;
    // European and Japanese maps have red pistes, so their lifts are drawn in slate instead of red
    const sc = scheme(resort);
    COLORS.lift = sc.lift; COLORS.liftInk = sc.liftInk; POI_STYLE.lift[0] = sc.lift; POI_STYLE.lifttop[0] = sc.lift;
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
    this.sky = new THREE.Color('#b9d7f0');
    s.background = this.sky.clone();
    s.fog = new THREE.Fog('#b9d7f0', 7000, 21000);
    s.add(new THREE.HemisphereLight('#ffffff', '#8fa3b8', 0.95));
    const sun = new THREE.DirectionalLight('#fff3df', 2.3);
    sun.position.set(-0.6, 0.8, 0.45);
    s.add(sun);

    this.cam3 = new THREE.PerspectiveCamera(42, 1, 8, 40000);
    this.cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
    // 2D map is turned so the base areas sit at the bottom of the screen and the summit at the top.
    {
      let bx = 0, by = 0, top = null;
      for (const l of resort.lifts) {
        bx += l.pts[0] / resort.lifts.length; by += l.pts[1] / resort.lifts.length;
        if (!top || l.top > top.top) top = l;
      }
      const ux = top.pts[top.pts.length - 2] - bx, uy = top.pts[top.pts.length - 1] - by, len = Math.hypot(ux, uy) || 1;
      this.up2 = new THREE.Vector3(ux / len, 0, -uy / len);            // local +y (north) is world -z
      this.right2 = new THREE.Vector3(-this.up2.z, 0, this.up2.x);
    }
    this.cam2.up.copy(this.up2);
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
    c.maxDistance = 14000;
    c.zoomSpeed = 1.2;
    // Opening view: the whole mountain from the east (base areas in front, summit behind).
    const mid = this.world(geo.W * 0.5, geo.H * 0.5, 0);
    c.target.set(mid.x, this.groundY(mid.x, mid.z), mid.z);
    // Opening view: stand out beyond the base areas looking up at the summit, far enough back
    // that the whole resort fits a tall phone screen (which is narrow side to side).
    const ex = Math.abs(this.right2.x) * geo.W + Math.abs(this.right2.z) * geo.H, ey = Math.abs(this.up2.x) * geo.W + Math.abs(this.up2.z) * geo.H;
    const aspect = (container.clientWidth || 390) / (container.clientHeight || 760), tv = Math.tan(THREE.MathUtils.degToRad(21));
    const back = Math.min(13000, Math.max((ex * 0.36) / (tv * Math.min(1, aspect)), (ey * 0.42) / tv));
    this.cam3.position.set(mid.x - this.up2.x * back * 0.8, c.target.y + back * 0.6, mid.z - this.up2.z * back * 0.8);
    c.update();

    r.domElement.addEventListener('pointerdown', () => { this.lastInput = performance.now(); });
    r.domElement.addEventListener('pointermove', () => { this.lastInput = performance.now(); });
    r.domElement.addEventListener('wheel', () => { this.lastInput = performance.now(); }, { passive: true });
    this.bind2D();
    this.bindTap();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.running = true;
    this.onVis = () => { if (this.dead) return; this.running = document.visibilityState === 'visible'; if (this.running) this.loop(); };
    document.addEventListener('visibilitychange', this.onVis);
    this.loop();
  }

  /** Tear the map down (when switching to another resort) and give its graphics memory back. */
  dispose() {
    this.dead = true; this.running = false;
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.controls.dispose();
    this.scene.traverse((o) => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => x.dispose()); });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---------- coordinates
  world(x, y, lift = 0) {
    return new THREE.Vector3(x - this.geo.W / 2, this.surfaceZ(x, y) - this.resort.grid.zmin + lift, -(y - this.geo.H / 2));
  }
  local(wx, wz) { return [wx + this.geo.W / 2, this.geo.H / 2 - wz]; }
  groundY(wx, wz) { const [x, y] = this.local(wx, wz); return this.surfaceZ(x, y) - this.resort.grid.zmin; }

  /**
   * Elevation of the drawn surface: exactly the flat triangle under (x, y), so trails,
   * buildings and people sit on the facets instead of sinking into or floating over them.
   */
  surfaceZ(x, y) {
    const { nx, ny, cell, zmin } = this.resort.grid, h = this.geo.h;
    const fx = Math.min(Math.max(x / cell, 0), nx - 1.001), fy = Math.min(Math.max(y / cell, 0), ny - 1.001);
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * nx + i;
    const za = h[o], zb = h[o + 1], zd = h[o + nx], ze = h[o + nx + 1];
    return zmin + (u >= v ? za + u * (zb - za) + v * (ze - zb) : za + u * (ze - zd) + v * (zd - za)) / 10;
  }

  // ---------- scene building
  buildTerrain() {
    const { nx, ny, cell, zmin } = this.resort.grid, h = this.geo.h, geo = this.geo;
    // Snow mask: groomed trails, lift lines and base areas are open snow, the rest is forest.
    const mask = new Float32Array(nx * ny);
    const stamp = (x, y, rad, v) => {
      const r = Math.ceil(rad / cell), ci = Math.round(x / cell), cj = Math.round(y / cell);
      for (let j = Math.max(0, cj - r); j <= Math.min(ny - 1, cj + r); j++)
        for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
          if (Math.hypot(i * cell - x, j * cell - y) <= rad) mask[j * nx + i] = Math.max(mask[j * nx + i], v);
        }
    };
    for (const t of this.resort.trails) for (let i = 0; i < t.pts.length; i += 2) stamp(t.pts[i], t.pts[i + 1], t.glade ? 16 : t.d === 0 ? 30 : 25, t.glade ? 0.4 : 1);
    for (const b of this.resort.buildings) stamp(b.pts[0], b.pts[1], 30, 1);
    for (const l of this.resort.lifts) {
      const n = Math.ceil(l.len / 12);
      for (let k = 0; k <= n; k++) {
        const f = k / n, x = l.pts[0] + (l.pts[l.pts.length - 2] - l.pts[0]) * f, y = l.pts[1] + (l.pts[l.pts.length - 1] - l.pts[1]) * f;
        stamp(x, y, 9, 0.4);
      }
    }
    this.snowMask = mask;
    // One flat colour per triangle (no blending between vertices): crisp snow / glade / forest /
    // rock facets. Face normals are baked in, so the shader does no per-pixel flat-shading work.
    const tris = (nx - 1) * (ny - 1) * 2;
    const pos = new Float32Array(tris * 9), col = new Float32Array(tris * 9);
    // Colours go through THREE.Color so they are in the same colour space as the surrounding
    // land (otherwise the detailed map renders visibly paler than what is around it).
    const rgb = (r, g, b) => { const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };
    const SNOW = rgb(246, 250, 253), GLADE = rgb(176, 205, 190), ROCK = rgb(124, 132, 141);
    const F_HIGH = rgb(150, 182, 176), F_MID = rgb(44, 104, 80), F_LOW = rgb(52, 122, 78);
    // zone tints, by code; later codes win where zones overlap
    const ZONE = [null, rgb(...ZONES.free.rgb), rgb(...ZONES.extreme.rgb), rgb(...ZONES.sled.rgb), rgb(...ZONES.race.rgb),
      rgb(...ZONES.learn.rgb), rgb(...ZONES.family.rgb), rgb(...ZONES.slow.rgb), rgb(...ZONES.park.rgb)];
    const CODE = { free: 1, extreme: 2, sled: 3, race: 4, learn: 5, family: 6, slow: 7, park: 8 };
    // three clean elevation bands: valley hardwoods, mid-mountain spruce, rimed summit trees
    // Forest bands hang off the resort's treeline; above it the open mountain is snow and rock.
    const tl = this.resort.treeline || 1300, ALPINE = rgb(226, 234, 240);
    const forest = (alt) => (alt > tl + 60 ? ALPINE : alt > tl - 260 ? F_HIGH : alt > tl - 440 ? F_MID : F_LOW);
    // Zones are painted into the snow itself so nothing floats above the ground to hide
    // trails, lift chairs or people.
    const zone = new Uint8Array(nx * ny), offPiste = new Uint8Array(nx * ny);   // offPiste: may tint outside the groomed snow
    const paint = (pts, rad, v, off = 0) => {
      const r = Math.ceil(rad / cell), reach = Math.max(rad, cell * 0.75);
      for (let q = 0; q < pts.length; q += 2) {
        const ci = Math.round(pts[q] / cell), cj = Math.round(pts[q + 1] / cell);
        for (let j = Math.max(0, cj - r); j <= Math.min(ny - 1, cj + r); j++)
          for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++)
            if (Math.hypot(i * cell - pts[q], j * cell - pts[q + 1]) <= reach && v >= zone[j * nx + i]) { zone[j * nx + i] = v; offPiste[j * nx + i] = off; }
      }
    };
    for (const t of this.resort.trails) {
      const z = t.z || (t.slow ? 'slow' : null);
      if (z) paint(t.pts, z === 'free' || z === 'extreme' ? 20 : 30, CODE[z], z === 'free' || z === 'extreme' ? 1 : 0);
    }
    for (const z of this.resort.zones || []) paint(z.pts, 14, CODE[z.kind], 1);
    for (const p of this.resort.parks) paint(p.pts, 17, CODE.park, p.trail >= 0 ? 0 : 1);
    let k = 0;
    const put = (o, c) => {
      const i = o % nx, j = (o / nx) | 0;
      pos[k] = i * cell - geo.W / 2; pos[k + 1] = h[o] / 10; pos[k + 2] = -(j * cell - geo.H / 2);
      col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
      k += 3;
    };
    const face = (a, b, c) => {
      const m = (mask[a] + mask[b] + mask[c]) / 3, alt = zmin + (h[a] + h[b] + h[c]) / 30;
      const zs = [h[a], h[b], h[c]], relief = (Math.max(...zs) - Math.min(...zs)) / 10 / cell;
      // a zone colours a face when at least two of its corners are in it; freeride and extreme
      // terrain is striped (every other row of cells) so it reads as hatching, not a solid fill
      const za = zone[a], zb = zone[b], zc = zone[c];
      const zn = za === zb || za === zc ? za : zb === zc ? zb : 0;
      const hatch = zn === 1 || zn === 2 ? (((a % nx) + ((a / nx) | 0)) & 1) === 0 : true;
      const colr = zn && hatch && (m >= 0.5 || offPiste[a] || offPiste[b] || offPiste[c]) ? ZONE[zn] : m >= 0.5 ? SNOW : relief > (alt > tl + 60 ? 0.7 : 0.95) ? ROCK : m >= 0.2 ? (alt > tl + 60 ? SNOW : GLADE) : forest(alt);
      put(a, colr); put(b, colr); put(c, colr);
    };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      face(a, b, e); face(a, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.terrain);
    this.buildSurround();
  }

  /**
   * The land around the resort: a coarse 140 m mesh reaching ~10 km out, so the mountain
   * sits in its real landscape instead of on a blank slab. ~50k triangles, no textures.
   */
  buildSurround() {
    const sr = this.resort.surround, sh = this.surroundH, geo = this.geo;
    if (!sr || !sh) return;
    const { nx, ny, cell, x0, y0 } = sr, zmin = this.resort.grid.zmin;
    const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), inside = new Uint8Array(nx * ny);
    const low = new THREE.Color('#6a9a68'), band = new THREE.Color('rgb(52,122,78)'), mid = new THREE.Color('rgb(44,104,80)'), high = new THREE.Color('rgb(150,182,176)'), c = new THREE.Color();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = j * nx + i, x = x0 + i * cell, y = y0 + j * cell;
      const inn = x > 20 && y > 20 && x < geo.W - 20 && y < geo.H - 20;
      inside[o] = inn ? 1 : 0;
      // inside the detailed map the coarse mesh follows the LiDAR surface, so the two meet cleanly at the border
      // Outside, ease from the LiDAR edge height into the coarse data over ~400 m so there is no step at the border.
      const dx = Math.max(0, -x, x - geo.W), dy = Math.max(0, -y, y - geo.H), out = Math.hypot(dx, dy);
      const edgeZ = this.surfaceZ(Math.min(geo.W, Math.max(0, x)), Math.min(geo.H, Math.max(0, y)));
      const w = Math.min(1, out / 420), coarse = sh[o] + sr.zmin;
      const z = inn ? edgeZ - 2.5 : out === 0 ? edgeZ - 1 : edgeZ * (1 - w) + coarse * w;
      pos[o * 3] = x - geo.W / 2; pos[o * 3 + 1] = z - zmin; pos[o * 3 + 2] = -(y - geo.H / 2);
      // same forest bands as the detailed map so the border between the two doesn't show
      const tl = this.resort.treeline || 1300;
      if (z > tl + 60) c.setRGB(0.76, 0.81, 0.85); else if (z > tl - 260) c.copy(high); else if (z > tl - 440) c.copy(mid); else c.copy(band).lerp(low, Math.min(1, Math.max(0, (tl - 820 - z) / 250)));
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      if (inside[a] && inside[b] && inside[d] && inside[e]) continue; // hidden under the detailed map
      idx.push(a, b, e, a, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    // short skirt under the edge of the detailed map hides any sliver between the two meshes
    const { nx: fx, ny: fy, cell: fc } = this.resort.grid, sk = [];
    const edge = (x1, y1, x2, y2) => {
      const a = this.world(x1, y1, 0), b = this.world(x2, y2, 0);
      sk.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y - 40, b.z, a.x, a.y, a.z, b.x, b.y - 40, b.z, a.x, a.y - 40, a.z);
    };
    for (let i = 0; i < fx - 1; i++) { edge(i * fc, 0, (i + 1) * fc, 0); edge(i * fc, geo.H, (i + 1) * fc, geo.H); }
    for (let j = 0; j < fy - 1; j++) { edge(0, j * fc, 0, (j + 1) * fc); edge(geo.W, j * fc, geo.W, (j + 1) * fc); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
    sg.computeVertexNormals(); // without normals the skirt shades as garbage and shows through the haze
    this.scene.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 'rgb(52,122,78)', side: THREE.DoubleSide })));
  }

  buildTrees() {
    const { nx, ny, cell, zmin } = this.resort.grid, mask = this.snowMask, h = this.geo.h, tl = this.resort.treeline || 1300;
    // only plant near the ski terrain (keeps the instance count phone-friendly)
    const q = 6, qx = Math.ceil(nx / q), qy = Math.ceil(ny / q), near = new Uint8Array(qx * qy);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (mask[j * nx + i] > 0.3) {
      const ci = (i / q) | 0, cj = (j / q) | 0;
      for (let b = Math.max(0, cj - 4); b <= Math.min(qy - 1, cj + 4); b++) for (let a = Math.max(0, ci - 4); a <= Math.min(qx - 1, ci + 4); a++) near[b * qx + a] = 1;
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots = [];
    for (let j = 1; j < ny - 1; j += 2) for (let i = 1; i < nx - 1; i += 2) {
      if (!near[((j / q) | 0) * qx + ((i / q) | 0)] || mask[j * nx + i] > 0.15) continue;
      // trees thin out over the last 150 m below the treeline and stop at it
      const up = zmin + h[j * nx + i] / 10 - (tl - 150);
      if (up > 0 && rnd() < up / 150) continue;
      if (rnd() < 0.3) spots.push([(i + rnd() * 1.6 - 0.8) * cell, (j + rnd() * 1.6 - 0.8) * cell, rnd()]);
    }
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
    const mesh = new THREE.InstancedMesh(M.treeGeometry(), new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
    const dark = new THREE.Color('#1f5a3c'), light = new THREE.Color('#2f7a4f'), frost = new THREE.Color('#dbe8e6');
    spots.forEach(([x, y, r], i) => {
      const p = this.world(x, y, -0.5), s = 2.6 + r * 1.5;
      m.compose(p, qn, sc.set(s * 1.3, s, s * 1.3));
      mesh.setMatrixAt(i, m);
      const alt = p.y + this.resort.grid.zmin;
      c.copy(dark).lerp(light, r).lerp(frost, alt > tl - 300 ? Math.min(0.75, (alt - (tl - 300)) / 200) : 0);
      mesh.setColorAt(i, c);
    });
    this.trees = mesh; this.treeTotal = spots.length;
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
      fog: true, dashed: !!opts.dash, dashSize: opts.dash?.[0] ?? 1, gapSize: opts.dash?.[1] ?? 1,
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
    const casing = [], shut = [];
    const byStyle = {};
    for (const t of R.trails) {
      if (closed.has('t' + t.id)) { this.segs(t.pts, 3.2, shut); continue; }
      if (!t.glade) this.segs(t.pts, 2.7, casing);
      this.segs(t.pts, 3.2, (byStyle[cls(R, t) + (t.glade ? 'g' : '')] ||= []));
    }
    for (const a of R.areas) this.segs(a.pts.concat(a.pts.slice(0, 2)), 3.2, (byStyle[cls(R, a) + 'g'] ||= []));
    G.add(this.fatLine(casing, '#ffffff', 5.5, { order: 3 }));
    for (const [key, pos] of Object.entries(byStyle)) {
      const glade = key.endsWith('g');
      G.add(this.fatLine(pos, scheme(R).colors[+key[0]], glade ? 2.6 : 3.2, { order: 4, dash: glade ? [16, 11] : null }));
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
    for (const p of [...R.parks.map((q) => ({ ...q, kind: 'park' })), ...(R.zones || [])]) if (!seen.has(p.kind + p.name)) {
      seen.add(p.kind + p.name);
      const i = Math.floor(p.pts.length / 4) * 2;
      this.parkLabels.push({ name: p.name, kind: p.kind, p: this.world(p.pts[i], p.pts[i + 1], 14) });
    }
  }

  buildLifts() {
    const R = this.resort;
    this.liftPaths = [];
    const cable = [], symbol = [], towerMats = [], stationGeos = [];
    const count = { chair: 0, cabin: 0, bar: 0, platter: 0, rope: 0, pad: 0 };
    const rail = { bed: [], rails: [], dark: [], white: [], tunnel: [], sleepers: [], portals: [], paths: [] };
    // per lift type: tower height, station height, half cable spacing, longest span between
    // supports, least clearance over the ground, how far apart the carriers are, red-line lift
    const SPEC = {
      tram: { th: 26, endH: 13, r: 5, span: Infinity, clear: 12, sag: [16, 0.022], red: RED_UP },
      gondola: { th: 13, endH: 7.5, r: 3, span: 120, clear: 7.5, sag: [2.5, 0.015], carrier: 'cabin', gap: 85, red: RED_UP },
      chair: { th: 9.5, endH: 6.5, r: 2.4, span: 100, clear: 6.5, sag: [2.5, 0.015], carrier: 'chair', gap: 48, red: RED_UP },
      surface: { th: 4.5, endH: 4.5, r: 1, span: 60, clear: 3.6, sag: [0, 0], carrier: 'bar', gap: 30, red: 2 },
      carpet: { th: 0.8, endH: 0.8, r: 0.5, span: 14, clear: 0.8, sag: [0, 0], carrier: 'pad', gap: 6, red: 2.5 },
    };
    for (const l of R.lifts) {
      if (l.kind === 'train' || l.kind === 'funicular') { this.liftPaths.push(this.buildRail(l, rail)); continue; }
      const K0 = SPEC[l.kind] || SPEC.chair;
      // T-bars, platters (button lifts) and rope tows each get their own hanger
      const K = l.kind === 'surface' && l.style && l.style !== 'tbar' ? { ...K0, carrier: l.style, gap: l.style === 'rope' ? 14 : 22 } : K0, tram = l.kind === 'tram', low = l.kind === 'surface' || l.kind === 'carpet', r = K.r;
      // Supports: the mapped towers, plus extra ones wherever the map leaves a span too long
      // to clear the ground (many lifts are mapped as just a bottom and a top).
      const xy = [];
      for (let i = 0; i + 1 < l.pts.length; i += 2) {
        if (i) {
          const ax = l.pts[i - 2], ay = l.pts[i - 1], d = Math.hypot(l.pts[i] - ax, l.pts[i + 1] - ay), k = Math.ceil(d / K.span);
          for (let j = 1; j < k; j++) xy.push([ax + ((l.pts[i] - ax) * j) / k, ay + ((l.pts[i + 1] - ay) * j) / k]);
        }
        xy.push([l.pts[i], l.pts[i + 1]]);
      }
      const n = xy.length;
      const sup = xy.map(([x, y], i) => this.world(x, y, i === 0 || i === n - 1 ? K.endH : K.th));
      // The cable hangs between its supports: each span gets a shallow sag, but never comes
      // closer to the ground than a carrier needs.
      const pts = [sup[0]];
      for (let i = 1; i < n; i++) {
        const a = sup[i - 1], b = sup[i], span = a.distanceTo(b), sag = Math.min(K.sag[0], span * K.sag[1]), steps = Math.max(2, Math.min(tram ? 160 : 12, Math.round(span / (low ? 10 : tram ? 15 : 10))));
        for (let k = 1; k <= steps; k++) { const f = k / steps, p = a.clone().lerp(b, f); p.y -= sag * 4 * f * (1 - f); pts.push(p); }
      }
      // clearance is checked under both cables, not just the centre line: on a steep side slope
      // or beside a cliff the uphill cable is the one that would cut into the rock
      {
        const d0 = sup[n - 1].clone().sub(sup[0]).setY(0).normalize(), sx = -d0.z * r, sz = d0.x * r;
        for (const p of pts) p.y = Math.max(p.y, Math.max(this.groundY(p.x, p.z), this.groundY(p.x + sx, p.z + sz), this.groundY(p.x - sx, p.z - sz)) + K.clear);
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const L = cum[cum.length - 1];
      const path = { l, tram, pts, cum, L, r, loop: 2 * L + 2 * Math.PI * r, chairs: 0, first: 0, carrier: K.carrier, gondola: l.kind === 'gondola', carpet: low };
      const line = (ring, close) => { for (let i = 0; i + 1 < ring.length + (close ? 1 : 0); i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; cable.push(p.x, p.y, p.z, q.x, q.y, q.z); } };
      if (tram) {
        // Aerial tram: each cabin has its own pair of fixed cables, one on each side of the towers.
        for (const side of [r, -r]) line(cum.map((d) => this.pathPoint(path, d, side).pos), false);
      } else {
        // One continuous haul cable (or belt) - up one side, round the top wheel, down the
        // other side, round the bottom wheel. The chairs, cabins, T-bars or belt sections ride it.
        if (l.kind !== 'carpet') {
          const ring = cum.map((d) => this.loopPoint(path, d).pos);
          for (let k = 1; k < 10; k++) ring.push(this.loopPoint(path, L + (Math.PI * r * k) / 10).pos);
          for (let i = cum.length - 1; i >= 0; i--) ring.push(this.loopPoint(path, L + Math.PI * r + (L - cum[i])).pos);
          for (let k = 1; k < 10; k++) ring.push(this.loopPoint(path, 2 * L + Math.PI * r + (Math.PI * r * k) / 10).pos);
          line(ring, true);
        }
        path.chairs = Math.min(90, Math.max(4, Math.floor(path.loop / (l.kind === 'chair' && l.name.includes('Express') ? 70 : K.gap))));
        path.first = count[K.carrier]; count[K.carrier] += path.chairs;
      }
      path.mid = this.pathPoint(path, L / 2, 0).pos;
      // The single red line that stands for the lift: it follows the cables, midway between the
      // two of them and clearly above, and is drawn after them, so from far away the red always
      // lies on top of the dark cables instead of blending into them.
      for (let i = 1; i < pts.length; i++) symbol.push(pts[i - 1].x, pts[i - 1].y + K.red, pts[i - 1].z, pts[i].x, pts[i].y + K.red, pts[i].z);
      const dir = sup[n - 1].clone().sub(sup[0]).setY(0).normalize(), yaw = Math.atan2(dir.x, dir.z);
      // towers stand on the ground under each support and reach up to the cable there
      if (l.kind !== 'carpet') for (let i = 1; i < n - 1; i++) {
        const base = this.world(xy[i][0], xy[i][1], 0);
        towerMats.push({ p: base, yaw, h: Math.round(Math.max(K.th, this.pathPoint(path, this.alongAt(path, sup[i]), 0).pos.y - base.y)), arm: 2 * r + 0.8 });
      }
      if (!low) for (const e of [0, n - 1]) {
        const g = M.stationGeometry(l.kind, 0x8b2f2f, K.endH + 1, r);
        const base = this.world(xy[e][0], xy[e][1], 0);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(base.x, base.y - 1, base.z));
        stationGeos.push(g);
      }
      this.liftPaths.push(path);
    }
    this.scene.add(this.fatLine(symbol, COLORS.lift, 2.8, { order: 8 }));
    // steel cables: thin and dark, so the red map line stays the one line you read per lift
    this.liftLine = this.fatLine(cable, '#3d444d', 1, { order: 6, opacity: 0.8 });
    this.scene.add(this.liftLine);
    // towers: one instanced mesh per tower type
    const types = new Map();
    for (const t of towerMats) { const k = t.h + '|' + t.arm; if (!types.has(k)) types.set(k, []); types.get(k).push(t); }
    for (const list of types.values()) {
      const mesh = new THREE.InstancedMesh(M.towerGeometry(list[0].h + 1, list[0].arm), M.vcMat(), list.length);
      const mt = new THREE.Matrix4();
      list.forEach((t, i) => { mt.makeRotationY(t.yaw).setPosition(t.p.x, t.p.y - 1, t.p.z); mesh.setMatrixAt(i, mt); });
      this.scene.add(mesh);
    }
    for (const g of stationGeos) this.scene.add(new THREE.Mesh(g, M.vcMat()));
    // one instanced mesh per kind of carrier, whatever the number of lifts
    this.carriers = {};
    for (const [k, geo] of [['chair', M.chairGeometry(4)], ['cabin', M.gondolaGeometry()], ['bar', M.tbarGeometry()], ['platter', M.platterGeometry()], ['rope', M.ropeHandleGeometry()], ['pad', M.padGeometry()]]) {
      const mesh = new THREE.InstancedMesh(geo, M.vcMat(), Math.max(1, count[k]));
      mesh.frustumCulled = false;
      mesh.visible = count[k] > 0;
      this.scene.add(mesh);
      this.carriers[k] = mesh;
    }
    this.chairs = this.carriers.chair; this.cabins = this.carriers.cabin;
    this.liftsMoved = false;
    // aerial trams (cable cars): two cabins each, every tram in the resort
    this.trams = this.liftPaths.filter((p) => p.tram).map((path) => ({ path, cabins: [new THREE.Mesh(M.tramGeometry(0xd32f2f), M.vcMat()), new THREE.Mesh(M.tramGeometry(0x2e8b57), M.vcMat())] }));
    for (const tr of this.trams) for (const c of tr.cabins) { c.scale.setScalar(1.5); this.scene.add(c); }
    this.tram = this.trams[0] || null;
    // railways: ballast bed, rails and sleepers on the ground, the classic black-and-white
    // railway line as the map symbol, faint dashes over tunnels, and a train on each stretch
    if (rail.paths.length) {
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(rail.bed, 3));
      bg.computeVertexNormals();
      this.scene.add(new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: '#7d766c', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      this.scene.add(this.fatLine(rail.rails, '#2a2e35', 1.1, { order: 6 }));
      this.scene.add(this.fatLine(rail.dark, '#1c2026', 3.6, { order: 8 }));
      this.scene.add(this.fatLine(rail.white, '#ffffff', 1.7, { order: 9 }));
      this.scene.add(this.fatLine(rail.tunnel, '#2b313b', 2.2, { order: 7, opacity: 0.5 }));
      const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.7, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: '#4d3d2f' }), Math.max(1, rail.sleepers.length));
      const mt = new THREE.Matrix4();
      rail.sleepers.forEach((t, i) => { mt.makeRotationY(t.yaw).setPosition(t.p.x, t.p.y + 0.1, t.p.z); sl.setMatrixAt(i, mt); });
      sl.count = rail.sleepers.length; sl.frustumCulled = false;
      this.scene.add(sl);
      for (const t of rail.portals) { const m = new THREE.Mesh(M.portalGeometry(), M.vcMat()); m.position.copy(t.p); m.rotation.y = t.yaw; this.scene.add(m); }
    }
    this.railCars = rail.paths.map((path) => { const mesh = new THREE.Mesh(M.trainGeometry(path.l.kind), M.vcMat()); this.scene.add(mesh); return { path, mesh }; });
    this.liftLabels = this.liftPaths.map((p) => ({ l: p.l, p: this.pathPoint(p, p.L * 0.5, 0).pos.clone().add(new THREE.Vector3(0, 10, 0)) }));
  }

  /**
   * A railway or funicular used as a lift. It lies on the ground along its real track; the
   * stretches in `l.tunnel` run straight underground between their portals.
   */
  buildRail(l, A) {
    const xy = [];
    for (let i = 0; i + 1 < l.pts.length; i += 2) {
      if (i) {
        const ax = l.pts[i - 2], ay = l.pts[i - 1], d = Math.hypot(l.pts[i] - ax, l.pts[i + 1] - ay), k = Math.ceil(d / 8);
        for (let j = 1; j < k; j++) xy.push([ax + ((l.pts[i] - ax) * j) / k, ay + ((l.pts[i + 1] - ay) * j) / k]);
      }
      xy.push([l.pts[i], l.pts[i + 1]]);
    }
    const n = xy.length, d2 = [0];
    for (let i = 1; i < n; i++) d2.push(d2[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
    const tun = (l.tunnel || []).filter(([a, b]) => b - a > 12);
    const under = (d) => tun.some(([a, b]) => d > a && d < b);
    const pts = xy.map(([x, y]) => this.world(x, y, 0.45));
    const spans = [];
    for (const [a, b] of tun) {
      let ia = 0, ib = n - 1;
      while (ia < n - 1 && d2[ia] < a - 0.5) ia++;
      while (ib > 0 && d2[ib] > b + 0.5) ib--;
      for (let i = ia + 1; i < ib; i++) pts[i].y = pts[ia].y + ((pts[ib].y - pts[ia].y) * (d2[i] - d2[ia])) / (d2[ib] - d2[ia] || 1);
      spans.push([ia, ib]);
    }
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[n - 1];
    const path = { l, rail: true, tram: false, pts, cum, L, r: 0, loop: 0, chairs: 0, first: 0, carrier: null, tunnels: spans.map(([ia, ib]) => [cum[ia], cum[ib]]), xy };
    path.mid = this.pathPoint(path, L / 2, 0).pos;
    let nextSleeper = 2;
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1], b = pts[i], mid = (d2[i - 1] + d2[i]) / 2, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
      const stripe = Math.floor(mid / 18) % 2 === 0;
      if (under(mid)) {
        // only a hint of the line on the surface above the tunnel
        if (stripe) { const p = this.world(xy[i - 1][0], xy[i - 1][1], 1.5), q = this.world(xy[i][0], xy[i][1], 1.5); A.tunnel.push(p.x, p.y, p.z, q.x, q.y, q.z); }
        continue;
      }
      const w = 1.8;
      A.bed.push(a.x + nx * w, a.y, a.z + nz * w, a.x - nx * w, a.y, a.z - nz * w, b.x + nx * w, b.y, b.z + nz * w,
        b.x + nx * w, b.y, b.z + nz * w, a.x - nx * w, a.y, a.z - nz * w, b.x - nx * w, b.y, b.z - nz * w);
      for (const sd of [0.75, -0.75]) A.rails.push(a.x + nx * sd, a.y + 0.3, a.z + nz * sd, b.x + nx * sd, b.y + 0.3, b.z + nz * sd);
      A.dark.push(a.x, a.y + 1.4, a.z, b.x, b.y + 1.4, b.z);
      if (stripe) A.white.push(a.x, a.y + 1.45, a.z, b.x, b.y + 1.45, b.z);
      while (nextSleeper < d2[i]) {
        if (nextSleeper >= d2[i - 1]) { const f = (nextSleeper - d2[i - 1]) / (d2[i] - d2[i - 1] || 1); A.sleepers.push({ p: a.clone().lerp(b, f), yaw: Math.atan2(dx, dz) }); }
        nextSleeper += 6;
      }
    }
    for (const [ia, ib] of spans) for (const [i, j] of [[ia, Math.min(n - 1, ia + 1)], [ib, Math.max(0, ib - 1)]]) {
      A.portals.push({ p: pts[i].clone(), yaw: Math.atan2(pts[j].x - pts[i].x, pts[j].z - pts[i].z) });
    }
    A.paths.push(path);
    return path;
  }

  /** Distance along a lift path of the point on it nearest (in plan) to a world position. */
  alongAt(path, w) {
    let best = Infinity, at = 0;
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], b = path.pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const f = l2 ? Math.min(1, Math.max(0, ((w.x - a.x) * dx + (w.z - a.z) * dz) / l2)) : 0;
      const d = Math.hypot(w.x - a.x - dx * f, w.z - a.z - dz * f);
      if (d < best) { best = d; at = path.cum[i - 1] + (path.cum[i] - path.cum[i - 1]) * f; }
    }
    return at;
  }

  /** Position + yaw at distance d along a lift's centre line, shifted sideways by `side` metres. */
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

  /**
   * Position + yaw at distance u around a lift's closed cable loop:
   * [0, L) up the right-hand cable, a half turn round the top bullwheel, down the other
   * cable, and a half turn round the bottom bullwheel back to the start.
   */
  loopPoint(path, u) {
    const { pts, L, r, loop } = path, n = pts.length;
    u = ((u % loop) + loop) % loop;
    const turn = (c, a, b, ang, sign) => {
      // a -> b is the lift direction at this end; swing from one cable to the other around c
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, fx = dx / len, fz = dz / len, sx = -fz, sz = fx;
      const co = Math.cos(ang) * sign, si = Math.sin(ang) * sign;
      return { pos: new THREE.Vector3(c.x + sx * r * co + fx * r * si, c.y, c.z + sz * r * co + fz * r * si), yaw: Math.atan2(-sx * si + fx * co, -sz * si + fz * co) };
    };
    if (u < L) return this.pathPoint(path, u, r);
    if (u < L + Math.PI * r) return turn(pts[n - 1], pts[n - 2], pts[n - 1], (u - L) / r, 1);
    if (u < 2 * L + Math.PI * r) { const q = this.pathPoint(path, 2 * L + Math.PI * r - u, -r); q.yaw += Math.PI; return q; }
    return turn(pts[0], pts[0], pts[1], (u - 2 * L - Math.PI * r) / r, -1);
  }

  animateLifts(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), big = new THREE.Vector3(1.6, 1.6, 1.6), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const SPEED = { chair: 2.4, cabin: 5, bar: 2.5, platter: 2.5, rope: 1.8, pad: 0.8 };
    // Lifts far from the camera are too small to see moving: only the ones in view range are
    // advanced each frame (all of them once, so every carrier starts in the right place).
    const cam = this.camera.position, all = !this.liftsMoved, is3 = this.mode === '3d';
    const touched = {};
    for (const p of this.liftPaths) {
      if (!p.chairs) continue;
      if (!all && is3 && p.mid.distanceTo(cam) > QUALITY[this.q || 0].lifts + p.L / 2) continue;
      const running = !this.closed.has('l' + p.l.id), k = p.carrier, mesh = this.carriers[k];
      const speed = (k === 'chair' && p.l.name.includes('Express') ? 5 : SPEED[k]) * 2; // real line speed x2 so the motion reads at map scale
      const gap = p.loop / p.chairs;
      for (let i = 0; i < p.chairs; i++) {
        const { pos, yaw } = this.loopPoint(p, i * gap + (running ? t * speed : 0));
        q.setFromAxisAngle(up, yaw);
        mesh.setMatrixAt(p.first + i, m.compose(pos, q, k === 'chair' || k === 'cabin' ? big : one));
      }
      touched[k] = true;
    }
    for (const k in touched) this.carriers[k].instanceMatrix.needsUpdate = true;
    this.liftsMoved = true;
    // trains and funicular cars shuttle between their two stations, waiting at each end
    for (const car of this.railCars || []) {
      const p = car.path, running = !this.closed.has('l' + p.l.id);
      const ride = Math.max(25, p.L / (p.l.kind === 'funicular' ? 16 : 12)), dwell = 10, cyc = 2 * (ride + dwell), ph = running ? (t + p.l.id * 7) % cyc : 0;
      const tri = ph < ride ? ph / ride : ph < ride + dwell ? 1 : ph < 2 * ride + dwell ? 1 - (ph - ride - dwell) / ride : 0;
      const d = p.L * tri * tri * (3 - 2 * tri);
      const a = this.pathPoint(p, Math.max(0, d - 6), 0).pos, b = this.pathPoint(p, Math.min(p.L, d + 6), 0).pos;
      car.mesh.position.copy(a).lerp(b, 0.5);
      car.mesh.lookAt(b);
      car.mesh.visible = !p.tunnels.some(([u, v]) => d > u + 8 && d < v - 8);
    }
    for (const tram of this.trams) {
      // Jig-back tram, like the real one: each cabin stays on its own side. As one climbs the
      // other descends; both wait in their stations, then swap directions.
      const p = tram.path, running = !this.closed.has('l' + p.l.id);
      const ride = 75, dwell = 14, cyc = 2 * (ride + dwell), ph = running ? t % cyc : 0;
      const tri = ph < ride ? ph / ride : ph < ride + dwell ? 1 : ph < 2 * ride + dwell ? 1 - (ph - ride - dwell) / ride : 0;
      const e = tri * tri * (3 - 2 * tri);      // eases out of and into the stations
      tram.cabins.forEach((c, i) => {
        const { pos, yaw } = this.pathPoint(p, p.L * (i ? 1 - e : e), i ? -p.r : p.r);
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
    this.playObj = new THREE.Group(); this.playObj.visible = false; this.scene.add(this.playObj);
  }

  /** (Re)build a person marker when the avatar or colour changes; returns true if rebuilt. */
  dress(obj, avatar, color, ring, ride = '') {
    const key = avatar + color + ring + ride;
    if (obj.userData.key === key) return false;
    obj.clear();
    const av = ride ? M.makeRide(ride, avatar, color) : M.makeAvatar(avatar, color);
    obj.add(av);
    if (ring) obj.add(M.makeRing(ring));
    obj.userData.key = key; obj.userData.avatar = av;
    return true;
  }

  /**
   * Where someone riding a lift is drawn. lift: {id, frac (0 bottom .. 1 top), down}.
   * Returns {ride: 'chair' | 'cabin' | '' (standing: surface lift or carpet), pos, yaw}.
   */
  liftSpot(lift) {
    const path = this.liftPaths.find((p) => p.l.id === lift.id);
    if (!path) return null;
    const kind = path.l.kind, low = kind === 'surface' || kind === 'carpet';
    const q = this.pathPoint(path, path.L * Math.min(1, Math.max(0, lift.frac)), path.rail || kind === 'carpet' ? 0 : lift.down ? -path.r : path.r);
    // chair: seated in a chair; gondola / cable car: a cabin; train / funicular: a rail car;
    // T-bar, platter, rope tow: standing on the snow holding on; carpet: just standing
    const ride = path.rail ? kind : kind === 'surface' ? 'tow-' + (path.l.style || 'tbar') : kind === 'carpet' ? '' : path.carrier === 'chair' ? 'chair' : 'cabin';
    const ground = this.groundY(q.pos.x, q.pos.z);
    if (path.rail) q.pos.y = Math.max(q.pos.y, ground + 0.45) + 0.5;      // in a tunnel: shown on the surface above
    else if (low) q.pos.y = ground + 0.4;
    else q.pos.y = Math.max(ground + 1.2, q.pos.y - (ride === 'chair' ? 5.4 : 6));   // where the chair or cabin hangs
    if (lift.down) q.yaw += Math.PI;
    return { ride, pos: q.pos, yaw: q.yaw };
  }

  /** Dress and aim a person, on the snow or (with d.lift) seated on a lift. */
  place(obj, d, color, ring, snap) {
    const spot = d.lift ? this.liftSpot(d.lift) : null;
    const fresh = this.dress(obj, d.avatar, color, ring, spot ? spot.ride : '');
    if (!spot) { this.aim(obj, d.x, d.y, d.heading, d.moving, fresh || snap); return; }
    const u = obj.userData;
    if (fresh || snap || !u.target || u.target.distanceTo(spot.pos) > 400) obj.position.copy(spot.pos);
    u.target = spot.pos; u.yaw = spot.yaw; u.moving = false;
    if (fresh || snap || u.yawNow == null) { u.yawNow = u.yaw; obj.rotation.y = u.yaw; }
  }

  /** Aim a person at a new position/heading; frame() glides them there. */
  aim(obj, x, y, heading, moving, snap) {
    const p = this.world(x, y, 0.4), u = obj.userData;
    if (snap || !u.target || u.target.distanceTo(p) > 400) obj.position.copy(p);
    u.target = p;
    if (heading != null) { u.yaw = Math.PI - heading; if (snap || u.yawNow == null) { u.yawNow = u.yaw; obj.rotation.y = u.yaw; } }
    u.moving = !!moving;
  }

  glide(obj, dt) {
    const u = obj.userData;
    if (u.target) obj.position.lerp(u.target, 1 - Math.exp(-dt * 5));
    if (u.yaw != null) {
      let d = u.yaw - u.yawNow;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      u.yawNow += d * (1 - Math.exp(-dt * 6));
      obj.rotation.y = u.yawNow;
    }
    if (u.avatar && !u.avatar.userData.ride) M.animateAvatar(u.avatar, this.t, dt, u.moving);
    if (u.wave) this.waveStep(obj);
  }

  /** Make a person wave at the viewer (tapping them); tapping again starts the wave over. */
  wave(id) {
    const obj = id === 'me' ? this.meObj : this.friends.get(id)?.obj;
    if (!obj?.visible) return;
    if (obj.userData.wave) this.waveStep(obj, true);
    obj.userData.wave = { t0: this.t };
  }

  waveStep(obj, stop = false) {
    const u = obj.userData, w = u.wave, outer = u.avatar;
    if (!outer) { u.wave = null; return; }
    const ride = outer.userData.ride;
    const av = ride ? outer.userData.av : outer;   // the rider in the chair, cabin or on the tow
    if (!av) { u.wave = null; return; }
    const k = (this.t - w.t0) / 2.8;
    if (stop || k >= 1) {
      M.endWave(av);
      u.wave = null;
      return;
    }
    // turn to face whoever is looking at the map: the camera, seen from above, relative to the person
    const cp = this.camera.position, op = obj.position;
    const world = Math.atan2(cp.x - op.x, cp.z - op.z);
    const face = world - obj.rotation.y - (ride ? outer.rotation.y : 0);
    const lean = outer.userData.seated ? 0.15 : 0;     // on a chair: a little lean out to the side
    M.waveAvatar(av, k, face, lean);
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

  setClosures(set) { this.closed = new Set(set); this.buildTrails(); this.overlayDirty = true; }

  /**
   * Breadcrumbs: a light dotted trail along everything skied. `lists` is an array of recorded
   * point lists ([t, x, y, z, state, gap]) or null to hide it. Lift rides and stops are left out.
   */
  setBreadcrumbs(lists) {
    const n = lists ? lists.reduce((k, l) => k + l.length, 0) : -1;
    if (n === this.crumbCount) return;            // nothing new since the last draw
    this.crumbCount = n;
    if (this.crumbs) { this.scene.remove(this.crumbs); this.crumbs.geometry.dispose(); this.crumbs.material.dispose(); this.crumbs = null; }
    if (!lists) return;
    const pos = [];
    for (const P of lists) {
      let prev = null;
      for (let i = 1; i < P.length; i++) {
        const b = P[i];
        if (b[4] !== 1 || b[5] || !this.geo.inBounds(b[1], b[2])) { prev = null; continue; }
        if (!prev) { prev = this.world(P[i - 1][1], P[i - 1][2], 4.2); prev.lx = P[i - 1][1]; prev.ly = P[i - 1][2]; }
        if (Math.hypot(b[1] - prev.lx, b[2] - prev.ly) < 7 && i < P.length - 1 && P[i + 1][4] === 1) continue; // thin out dense GPS points
        const q = this.world(b[1], b[2], 4.2);
        q.lx = b[1]; q.ly = b[2];
        pos.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
        prev = q;
      }
    }
    if (!pos.length) return;
    // small dots, narrower than a trail line and part see-through, so the trails stay readable underneath
    this.crumbs = this.fatLine(pos, '#ff5aa8', 3, { order: 9, dash: [3, 8], opacity: 0.9 });
    this.scene.add(this.crumbs);
  }

  setUnits(u) { this.units = u; }

  setMe(me) {
    // me: {x, y, heading, avatar, color, moving, lift: {id, frac, down} | null} | null
    this.me = me;
    if (!me) { this.meObj.visible = false; return; }
    this.place(this.meObj, me, me.color, COLORS.me, false);
  }

  /** friends: [{id, name, avatar, color, x, y, heading, moving, age (s), stale, paused, online}] */
  setFriends(list) {
    const ids = new Set(list.map((f) => f.id));
    for (const [id, f] of this.friends) if (!ids.has(id)) { this.scene.remove(f.obj); this.friends.delete(id); }
    for (const d of list) {
      let f = this.friends.get(d.id);
      if (!f) { f = { obj: new THREE.Group() }; this.scene.add(f.obj); this.friends.set(d.id, f); }
      const col = d.stale ? '#8d949e' : d.color;
      f.data = d;
      this.place(f.obj, d, col, col, false);
    }
  }

  setPin(p) { this.overlayDirty = true; this.pin = p; this.pinObj.visible = !!p; if (p) this.pinObj.position.copy(this.world(p.x, p.y, 0)); }
  setMeet(p) { this.overlayDirty = true; this.meet = p; this.meetObj.visible = !!p; if (p) this.meetObj.position.copy(this.world(p.x, p.y, 0)); }

  /** Draw directions. `walk` lists the stretches done on foot, drawn over the route in their own colour. */
  setRoute(pts, walk = null) {
    if (this.routeLine) { for (const l of this.routeLine) { this.scene.remove(l); l.geometry.dispose(); l.material.dispose(); } this.routeLine = null; }
    if (!pts || pts.length < 4) return;
    const pos = this.segs(densify(pts, 12), 6);
    this.routeLine = [this.fatLine(pos, '#06304a', 9, { overlay: true, opacity: 0.85, order: 20 }), this.fatLine(pos, COLORS.route, 5.5, { overlay: true, order: 21 })];
    for (const w of walk || []) {
      if (w.length < 4) continue;
      this.routeLine.push(this.fatLine(this.segs(densify(w, 6), 6), COLORS.walk, 5.5, { overlay: true, order: 22, dash: [9, 6] }));
    }
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
      c.set(b[4] === 1 ? COLORS.track : b[4] === 2 ? '#c9ced6' : '#ffc2df');
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    this.trackLine = this.fatLine(pos, '#fff', 4.5, { colors: col, overlay: true, order: 19 });
    this.scene.add(this.trackLine);
  }

  /** Replay marker: the same animated avatar as live tracking. p: {x, y, heading, moving, avatar, color, snap} */
  setPlayhead(p) {
    this.playObj.visible = !!p;
    this.play = p;
    if (!p) { this.playObj.userData.target = null; return; }
    this.place(this.playObj, { ...p, avatar: p.avatar || 'boy-ski' }, p.color || COLORS.track, '', p.snap);
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
        this.center2.addScaledVector(this.right2, -(s.x - last.x) / this.zoom2).addScaledVector(this.up2, (s.y - last.y) / this.zoom2);
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
    this.center2.addScaledVector(this.right2, dx / z0 - dx / z1).addScaledVector(this.up2, -(dy / z0 - dy / z1));
    this.zoom2 = z1;
    this.clamp2();
  }
  minZoom2() {
    // size of the (rotated) map rectangle along the screen's axes
    const W = this.geo.W, H = this.geo.H, r = this.right2, u = this.up2;
    const ex = Math.abs(r.x) * W + Math.abs(r.z) * H, ey = Math.abs(u.x) * W + Math.abs(u.z) * H;
    return Math.min(this.w / ex, this.h / ey) * 0.85;
  }
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
      const q = this.center2.clone().addScaledVector(this.right2, (sx - this.w / 2) / this.zoom2).addScaledVector(this.up2, -(sy - this.h / 2) / this.zoom2);
      const l = this.local(q.x, q.z);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // the 3D picture may be drawn a little less sharp when the phone is struggling; text stays crisp
    this.renderer.setPixelRatio(Math.min(dpr, QUALITY[this.q || 0].pr));
    this.renderer.setSize(w, h);
    this.overlayKey = '';
    this.overlay.width = w * dpr; this.overlay.height = h * dpr;
    this.overlay.style.width = w + 'px'; this.overlay.style.height = h + 'px';
    this.dpr = dpr;
    this.cam3.aspect = w / h; this.cam3.updateProjectionMatrix();
  }

  loop() {
    if (!this.running || this.dead) return;
    requestAnimationFrame(() => this.loop());
    // Full frame rate while the map is being touched or flown; ~30 fps otherwise (saves battery/GPU).
    const now = performance.now();
    if (this.paused) return;
    const busy = now - (this.lastInput || 0) < 900 || !!this.flight;
    if (!busy && now - (this.lastFrame || 0) < 31) { this.wasBusy = false; return; }
    // While touched, draw at most maxFps times a second (60 unless the user asked for more):
    // a 120 Hz screen otherwise doubles the work, and the heat that makes iOS slow the app down.
    if (busy && now - (this.lastFrame || 0) < 1000 / (this.maxFps || 60) - 3) return;
    if (busy && this.wasBusy && !this.flight) this.measure(now - this.lastFrame, now);
    this.wasBusy = busy;
    this.lastFrame = now;
    this.dt = Math.min(0.1, this.clock.getDelta());
    this.t += this.dt;
    this.frame();
  }

  /**
   * Fly between "high above, everything hidden in haze of `color`" and the normal view.
   * dir +1 = descend into the mountain, -1 = climb away from it. The haze colour is the
   * exact colour the globe shows at this spot, so the two views join without a cut or fade.
   */
  fly(dir, color, seconds = 3) {
    this.setMode('3d');
    const c = this.controls;
    if (dir > 0 && this.homeView) { c.target.copy(this.homeView.target); this.cam3.position.copy(this.homeView.pos); }
    if (!this.homeView) this.homeView = { target: c.target.clone(), pos: this.cam3.position.clone() };
    const view = this.cam3.position.clone(), top = new THREE.Vector3(c.target.x, c.target.y + 16000, c.target.z + 40);
    c.enabled = false;
    this.paused = false;
    return new Promise((resolve) => {
      this.flight = { dir, t: 0, dur: seconds, view, top, color: new THREE.Color(color), resolve };
      // draw the first frame of the flight now, so the canvas never shows a stale view when revealed
      this.dt = 0;
      this.frame();
    });
  }

  /** k = 0: far above inside the haze; k = 1: the normal view. */
  applyFlight(k) {
    const f = this.flight, sky = this.sky;
    this.cam3.position.lerpVectors(f.top, f.view, k);
    this.cam3.lookAt(this.controls.target);
    const fog = this.scene.fog;
    // The haze keeps the globe's land colour while we look straight down, and only turns to
    // sky colour over the last part of the descent, as the horizon tilts into view.
    const mix = Math.min(1, Math.max(0, (k - 0.45) / 0.5));
    fog.color.copy(f.color).lerp(sky, mix * mix * (3 - 2 * mix));
    this.scene.background.copy(fog.color);
    // Fully hidden from 16 km up (haze ends 1.5 km out); it thins quickly so the mountain resolves early.
    const thin = Math.min(1, k / 0.55), lf = Math.log(1500) + (Math.log(60000) - Math.log(1500)) * thin;
    fog.near = 7000 * k;
    fog.far = k >= 1 ? 21000 : Math.max(fog.near + 1, Math.exp(lf) * (1 - mix) + 21000 * mix);
    this.overlay.style.opacity = String(Math.min(1, Math.max(0, (k - 0.75) / 0.25)));
  }

  /**
   * Automatic quality. While the map is being moved it should run at full frame rate; if the
   * phone cannot keep up, the costly extras are turned down a step (sharpness on dense screens,
   * tree count, how far away lifts are animated), and turned back up when there is room.
   */
  measure(gap, now) {
    const P = (this.perfAcc ||= { sum: 0, n: 0 });
    if (gap > 250) return;                    // a hiccup (tab switch, GC), not the frame rate
    P.sum += gap; P.n++;
    if (P.n < 40) return;
    const avg = P.sum / P.n; P.sum = 0; P.n = 0;
    const q = this.q || 0;
    if (this.limited && avg < 24) this.limited = false;
    this.perf = { fps: Math.round(1000 / avg), q, limited: !!this.limited };
    if (this.autoQuality === false || this.limited) return;
    // Did the last step down buy anything? If frames are no faster, the phone itself is holding
    // the app back (heat, battery saving): lower quality cannot help, so give the quality back
    // and leave it alone until the frame rate recovers.
    if (this.dropFrom) {
      const { avg: before, q: q0 } = this.dropFrom;
      this.dropFrom = null;
      if (avg > before * 0.88) {
        this.limited = true; this.setQuality(q0); this.holdUntil = now + 6000;
        this.perf = { fps: Math.round(1000 / avg), q: this.q, limited: true };
        return;
      }
    }
    if (avg > 24 && q < QUALITY.length - 1) {
      // dropping straight after a raise means the raise was too much: wait longer before retrying
      if (now - (this.raisedAt || -1e9) < 8000) this.raiseWait = Math.min(600000, (this.raiseWait || 20000) * 3);
      this.dropFrom = { avg, q: this.qBeforeDrops ?? q };
      this.qBeforeDrops = this.dropFrom.q;
      this.setQuality(q + 1); this.holdUntil = now + (this.raiseWait || 20000);
    } else {
      this.qBeforeDrops = null;
      if (avg < 17.6 && q > 0 && now > (this.holdUntil || 0)) { this.setQuality(q - 1); this.raisedAt = now; this.holdUntil = now + 6000; }
    }
  }

  setQuality(q) {
    this.q = Math.max(0, Math.min(QUALITY.length - 1, q));
    if (this.trees) this.trees.count = Math.max(1, Math.floor(this.treeTotal * QUALITY[this.q].trees));
    if (this.perf) this.perf.q = this.q;
    this.resize();
  }

  /** Stop drawing while the start screen covers the map. */
  setPaused(p) { this.paused = p; }

  frame() {
    const c = this.controls, is3 = this.mode === '3d';
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + this.dt / f.dur);
      // descending: fast at first, settling gently; climbing: the mirror image
      const e = f.dir > 0 ? 1 - Math.pow(1 - f.t, 3) : 1 - f.t * f.t * f.t;
      this.applyFlight(e);
      if (f.t >= 1) {
        this.flight = null;
        if (f.dir > 0) { c.enabled = this.mode === '3d'; c.update(); }
        f.resolve();
      }
    } else if (this.mode === '3d') {
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
    // chairs are sub-pixel from far away: skip moving ~400 of them when zoomed right out
    const farOut = is3 ? this.cam3.position.distanceTo(c.target) > 7500 : this.zoom2 < 0.12;
    if (!farOut || this.flight) this.animateLifts(this.t);
    // Avatars and markers are scaled with distance so they stay readable at mountain scale.
    // They grow as you zoom out so they stay findable, up to a cap (about 45 m tall for a
    // person) so that from far away they no longer swamp the map.
    const scaleFor = (obj, k, max = 25) => {
      const s = is3 ? Math.min(max, Math.max(2.2, this.cam3.position.distanceTo(obj.position) * k)) : 14 / this.zoom2 / 3;
      obj.scale.setScalar(s);
    };
    const dt = this.dt || 0.016;
    if (this.me) { this.meObj.visible = is3; this.glide(this.meObj, dt); scaleFor(this.meObj, 0.02); }
    for (const f of this.friends.values()) { f.obj.visible = is3; this.glide(f.obj, dt); scaleFor(f.obj, 0.02); }
    if (this.pin) scaleFor(this.pinObj, 0.014, 22);
    if (this.meet) scaleFor(this.meetObj, 0.016, 24);
    if (this.play) { this.playObj.visible = is3; this.glide(this.playObj, dt); scaleFor(this.playObj, 0.02); }
    // The label layer (lots of outlined text) is the most expensive 2D work, so it is only
    // redrawn when the view or the things on it changed, and at most ~4x a second otherwise.
    const cam = this.camera, e = cam.matrixWorld.elements, now = performance.now();
    const key = `${this.mode}|${e[12].toFixed(1)}|${e[13].toFixed(1)}|${e[14].toFixed(1)}|${e[0].toFixed(4)}|${e[5].toFixed(4)}|${e[10].toFixed(4)}|${this.zoom2.toFixed(4)}|${this.w}x${this.h}`;
    const people = this.me || this.friends.size || this.play;
    // Nothing is moving when the view is still, no lift is being animated and nobody is on the
    // map: the picture is then only refreshed twice a second (saves battery and heat).
    const still = !this.flight && farOut && !people && !this.overlayDirty && key === this.overlayKey && now - (this.drawnAt || 0) < 500;
    if (!still) { this.renderer.render(this.scene, this.camera); this.drawnAt = now; }
    if (key !== this.overlayKey || this.overlayDirty || (people && now - (this.overlayAt || 0) > 66) || now - (this.overlayAt || 0) > 260) {
      this.overlayKey = key; this.overlayDirty = false; this.overlayAt = now;
      this.drawOverlay();
    }
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
      ctx.font = `${weight} ${size}px "Nunito Sans Variable", -apple-system, system-ui, sans-serif`;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineJoin = 'round';
      ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y);
    };
    const label = (s, p, fill, size, weight) => {
      ctx.font = `${weight || 600} ${size}px "Nunito Sans Variable", -apple-system, system-ui, sans-serif`;
      const tw = ctx.measureText(s).width;
      if (!free(p.x - tw / 2 - 3, p.y - size / 2 - 2, tw + 6, size + 4)) return false;
      text(s, p.x, p.y, fill, size, weight);
      return true;
    };

    if (!is3) {
      // north arrow (the 2D map is turned so uphill is up)
      const nx = -this.right2.z, ny = this.up2.z, cx = 30, cy = 112;   // screen direction of north (world -z)
      ctx.save(); ctx.translate(cx, cy);
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
      ctx.rotate(Math.atan2(nx, -ny));
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(5, 3); ctx.lineTo(0, 0); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fillStyle = '#d92d20'; ctx.fill();
      ctx.restore();
      boxes.push([cx - 18, cy - 18, 36, 36]);
    }
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
        ctx.font = '700 12px "Nunito Sans Variable", -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.fillText((d.name || '?').slice(0, 1).toUpperCase(), p.x, p.y + 0.5);
        ly = p.y + 24;
      }
      const tag = d.me ? t('You') : d.name + (d.paused ? ' · ' + t('paused') : d.stale ? ` · ${fmtAge(d.age)}` : '');
      ctx.font = '700 12px "Nunito Sans Variable", -apple-system, system-ui, sans-serif';
      const tw = ctx.measureText(tag).width + 14;
      ctx.fillStyle = col; roundRect(ctx, p.x - tw / 2, ly - 9, tw, 18, 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tag, p.x, ly + 0.5);
      boxes.push([p.x - tw / 2, ly - 9, tw, 18]);
      this.hits.push({ x: p.x, y: is3 ? (p.y + ly) / 2 : p.y, r: 30, ev: d.me ? { type: 'me' } : { type: 'friend', id: d.id } });
    }
    const marker = (pt, obj, color, name, ev) => {
      const p = this.project(obj.position);
      if (!p) return;
      if (!is3) { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      text(name, p.x, p.y + (is3 ? 12 : 18), color, 11, 700);
      this.hits.push({ x: p.x, y: p.y - (is3 ? 10 : 0), r: 28, ev });
    };
    if (this.pin) marker(this.pin, this.pinObj, '#d92d20', t('Pin'), { type: 'pin' });
    if (this.meet) marker(this.meet, this.meetObj, '#c96f00', this.meet.name || t('Meet here'), { type: 'meet' });
    if (this.play && !is3) {
      const p = this.project(this.playObj.position);
      if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 7); ctx.fillStyle = this.play?.color || COLORS.track; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
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
      ctx.font = '700 10px "Nunito Sans Variable", -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(st[1], s.x, s.y + 0.5);
      this.hits.push({ x: s.x, y: s.y, r: 20, ev: { type: 'poi', id: p.id } });
      if (near > 1.6 || st[2] === 0) {
        const name = p.name.replace(' (base)', '');
        const sub = placeTr(name);                        // in the reader's language, under the real name
        ctx.font = '600 10.5px "Nunito Sans Variable", -apple-system, system-ui, sans-serif';
        let tw = ctx.measureText(name).width;
        if (sub) { ctx.font = '600 9.5px "Nunito Sans Variable", -apple-system, system-ui, sans-serif'; tw = Math.max(tw, ctx.measureText(`(${sub})`).width); }
        if (free(s.x - tw / 2 - 2, s.y + 10, tw + 4, sub ? 25 : 13)) {
          text(name, s.x, s.y + 16.5, '#1c2733', 10.5, 600);
          if (sub) text(`(${sub})`, s.x, s.y + 28, '#3d4b5a', 9.5, 600);
        }
      }
    }
    // zone + lift + trail names
    if (near > 1.5) for (const z of this.parkLabels) { const s = this.project(z.p); if (s) label(ZONES[z.kind].sym + ' ' + z.name, s, ZONES[z.kind].ink, 11, 700); }
    if (near > 1.15) for (const z of this.liftLabels) {
      const s = this.project(z.p);
      if (!s) continue;
      const shut = this.closed.has('l' + z.l.id), sub = placeTr(z.l.name);
      if (label(z.l.name + (shut ? ` (${t('closed')})` : ''), s, shut ? '#6b7280' : COLORS.liftInk, 11, 700) && sub) label(`(${sub})`, { x: s.x, y: s.y + 13 }, shut ? '#6b7280' : COLORS.liftInk, 9.5, 600);
    }
    if (near > 1.7) {
      const sym = ['●', '■', '◆', '◆◆'];
      for (const z of this.trailLabels) {
        if (z.t.len < 2600 / near && near < 5) continue;
        const s = this.project(z.p);
        if (!s) continue;
        const shut = this.closed.has('t' + z.t.id);
        label(`${runSym(this.resort, z.t)} ${z.t.name}${shut ? ` (${t('closed')})` : ''}`, s, shut ? '#6b7280' : runColor(this.resort, z.t), 10.5, 600);
      }
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function fmtAge(s) {
  if (s == null) return t('no location');
  if (s < 10) return t('just now');
  if (s < 90) return t('{0}s ago', Math.round(s / 10) * 10);
  if (s < 5400) return t('{0}m ago', Math.round(s / 60));
  return t('{0}h ago', Math.round(s / 3600));
}

function densify(pts, step) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  return out;
}
