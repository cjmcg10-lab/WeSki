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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loopTimer, detachSegments, shuttle, swing, tramRide, stationClashes } from './liftmotion.js';
import { scheme, cls, runColor, runSym } from './rating.js';
import { prepInput, prepTerrain, runRadius, shownAreas, chunkSurface, skirtLayout, pieceIndex, pickLevel, movingPr } from './terrainprep.js';
import { simplifyRun, simplifyPath3 } from './simplify.js';

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

// Automatic quality steps, best first: pixel ratio cap, share of trees drawn, how far from the camera lifts are
// animated and their chairs and cabins drawn at all, within what distance those are drawn in full detail (metres),
// and how many screen pixels of height error the far ground may have (coarser pieces far away). Detail goes first,
// sharpness last: a step down lowers the far detail before it softens the picture.
const QUALITY = [
  { pr: 2, trees: 1, lifts: 4500, near: 480, lod: 2 },
  { pr: 2, trees: 0.75, lifts: 3500, near: 420, lod: 3 },
  { pr: 1.5, trees: 0.5, lifts: 2500, near: 340, lod: 4 },
  { pr: 1, trees: 0.3, lifts: 1600, near: 260, lod: 6 },
];
// While the map moves, it is drawn at this share of its sharpness (never below 1x) and drawn sharp again once it
// stops; only on screens drawn sharper than 1.2x, where it saves the most and shows the least.
// (movingPr in src/terrainprep.js)
const SHARP_AFTER_MS = 250;
// Trees further than this are thinned out with distance (to a share of FAR_TREES), and so are the land's far pieces.
const TREES_FULL_M = 2500, FAR_TREES = 0.35;
const STATION_COLOR = 0x8b2f2f;
const UP = new THREE.Vector3(0, 1, 0);
// real line speeds of the carriers other than chairs (m/s)
const CARRIER_SPEED = { cabin: 5, bar: 2.5, platter: 2.5, rope: 1.8, pad: 0.8 };

export class SkiMap {
  /**
   * The ground's heavy set-up (snow mask, colour fields, the ground cut into pieces), worked out in a background
   * worker so the screen does not freeze while it runs; resolves to what the constructor takes as `opts.prep`.
   * Falls back to the main thread where workers are not available.
   */
  static prepare(resort, geo) {
    const input = prepInput(resort, geo.h);
    if (typeof Worker === 'undefined') return Promise.resolve(prepTerrain(input));
    return new Promise((resolve) => {
      let w;
      const local = () => { w?.terminate(); resolve(prepTerrain(input)); };
      try { w = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' }); } catch { local(); return; }
      w.onmessage = (e) => { w.terminate(); if (e.data?.mask) resolve(e.data); else local(); };
      w.onerror = (e) => { e.preventDefault?.(); local(); };
      w.postMessage(input);
    });
  }

  /**
   * opts.prep: the result of SkiMap.prepare (worked out here when missing); opts.antialias: smooth edges (default:
   * on, except on screens sharper than 2.5x, where jagged edges are hard to see and smoothing costs the most).
   */
  constructor(container, resort, geo, surroundH = null, canopy = null, opts = {}) {
    this.surroundH = surroundH;
    this.prep = opts.prep || prepTerrain(prepInput(resort, geo.h));
    // real tree cover (tools/build_canopy.py), or null for maps without one; a file made for another build of the
    // map (a different grid) is ignored, and the old trees are drawn instead
    const g0 = resort.grid;
    this.canopy = canopy && canopy.w === (g0.nx - 1) * 2 && canopy.h === (g0.ny - 1) * 2 ? canopy : null;
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

    this.antialias = opts.antialias ?? SkiMap.defaultAntialias();
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: this.antialias, powerPreference: 'high-performance', stencil: true }));
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
    this.prep = null;      // its arrays now live in the scene's buffers and textures

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

  /** Antialiasing unless the screen is sharper than 2.5x (where it is hardly visible and costs the most). */
  static defaultAntialias() {
    return (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) < 2.5;
  }

  /** Tear the map down (when switching to another resort) and give its graphics memory back. */
  dispose() {
    this.dead = true; this.running = false;
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.controls.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => x.dispose());
      for (const g of o.userData?.geos || []) g?.dispose();      // coarser ground pieces not drawn right now
    });
    this.groundTex?.dispose(); this.zoneTex?.dispose(); this.canopyTex?.dispose();
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
  /** Half the width of a run's snow (src/terrainprep.js). */
  runRadius(t) { return runRadius(t); }

  /** Slope outlines (OpenStreetMap piste areas) shown on the map: those whose run is not hidden. */
  shownAreas() { return shownAreas(this.resort); }

  /**
   * The ground: the LiDAR grid as one smoothly shaded surface, cut into square pieces (src/terrainprep.js) so the
   * pieces off screen are skipped, and each piece drawn with fewer heights the further away it is (pickLods), as long
   * as the shape changes by less than a pixel or two there. Short skirts under every piece's edge hide the gaps
   * where two neighbours are drawn with different detail. The light and shade use the full-detail normals, so the
   * slopes keep their look; the colours come from groundMaterial().
   */
  buildTerrain() {
    const { zmin } = this.resort.grid, S = this.prep.surface;
    this.snowMask = this.prep.mask;
    const posA = new THREE.BufferAttribute(S.pos, 3), nrmA = new THREE.BufferAttribute(S.nrm, 3), idxA = new THREE.BufferAttribute(S.index, 1);
    const gm = this.groundMaterial(zmin);
    // the whole ground as one mesh, not drawn (the pieces are): for tools that read the full surface
    const full = new THREE.BufferGeometry();
    full.setAttribute('position', posA); full.setAttribute('normal', nrmA); full.setIndex(idxA);
    this.terrain = new THREE.Mesh(full, gm);
    this.terrainGroup = this.piecesOf(S, { position: posA, normal: nrmA }, idxA, gm);
    this.terrainPieces = this.terrainGroup.children;
    this.scene.add(this.terrainGroup);
    this.buildSurround();
  }

  /** One mesh per piece of a chunked surface (chunkSurface), all sharing its vertex buffers and index buffer. */
  piecesOf(S, attrs, idxA, mat) {
    const P = S.pos, nx = S.nx, group = new THREE.Group(), sk = skirtLayout(S.nx, S.ny, S.C);
    group.renderOrder = GROUND_ORDER;
    for (const ch of S.chunks) {
      const g = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(attrs)) g.setAttribute(k, a);
      g.setIndex(idxA); g.setDrawRange(ch.start, ch.count);
      // the piece's own bounds (computeBoundingSphere would measure the whole shared buffer), skirts included
      const c0 = (ch.j0 * nx + ch.i0) * 3, c1 = (ch.j1 * nx + ch.i1) * 3;
      g.boundingBox = new THREE.Box3(new THREE.Vector3(P[c0], ch.y0, P[c1 + 2]), new THREE.Vector3(P[c1], ch.y1, P[c0 + 2]));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = GROUND_ORDER;      // before the runs (see buildTrails)
      m.userData = { ch, geos: [g], L: 0, sk, nx, attrs };
      group.add(m);
    }
    return group;
  }

  /**
   * Per piece, the coarsest version whose height error stays under the quality step's pixel limit (QUALITY lod) at
   * its distance from the camera; coarser index lists are made the first time a piece needs one. In 2D, where a
   * height error only shifts the shading a little, three times the limit is allowed. Also sets the ground's depth
   * bias (groundMaterial) so a run line never dips into a coarser far piece.
   */
  pickLods() {
    const is3 = this.mode === '3d', Q = QUALITY[this.q || 0], cam = this.camera.position;
    // metres a screen pixel covers (per metre of distance, in 3D)
    const mpp = is3 ? (2 * Math.tan(THREE.MathUtils.degToRad(this.cam3.fov / 2))) / (this.h || 1) : 1 / this.zoom2;
    const px = is3 ? Q.lod : Q.lod * 3;
    if (this.groundBias) this.groundBias.value.set(is3 ? px * mpp * 1.3 : 0, is3 ? 0 : px * mpp * 1.3 + 2);
    for (const group of [this.terrainGroup, this.surroundGroup]) if (group) for (const m of group.children) {
      const u = m.userData, errs = u.ch.errs;
      if (errs.length < 2) continue;
      const bs = u.geos[0].boundingSphere, d = is3 ? Math.max(1, cam.distanceTo(bs.center) - bs.radius) : 1;
      const L = pickLevel(errs, mpp * d, px);
      if (L === u.L) continue;
      if (!u.geos[L]) {
        const g = new THREE.BufferGeometry();
        for (const [k, a] of Object.entries(u.attrs)) g.setAttribute(k, a);
        g.setIndex(new THREE.BufferAttribute(pieceIndex(u.ch, u.ch.steps[L], u.nx, u.sk), 1));
        g.boundingBox = u.geos[0].boundingBox; g.boundingSphere = bs;
        u.geos[L] = g;
      }
      m.geometry = u.geos[L]; u.L = L;
    }
  }

  /**
   * The ground's look. Instead of one flat colour per triangle (saw-toothed squares along every run),
   * the snow, glade and zone shapes are stored as distance fields: each pixel holds how far it is
   * from the nearest edge. The graphics chip draws the edge exactly where that distance is zero, so
   * runs, glades and zones have smooth, crisp edges at any zoom from a small image (about half a mesh
   * cell a pixel). Forest bands, alpine snow and rock are worked out per pixel from the height and
   * steepness of the ground itself. Same palette as before.
   */
  groundMaterial(zmin) {
    const { nx, ny, cell } = this.resort.grid, geo = this.geo;
    const W = (nx - 1) * cell, H = (ny - 1) * cell;
    const { field, zc, tw, th } = this.prep.fields;      // worked out by src/terrainprep.js groundFields
    const fieldTex = new THREE.DataTexture(field, tw, th, THREE.RGBAFormat);
    fieldTex.minFilter = THREE.LinearMipmapLinearFilter; fieldTex.magFilter = THREE.LinearFilter; fieldTex.generateMipmaps = true;
    fieldTex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    fieldTex.needsUpdate = true;
    const zoneTex = new THREE.DataTexture(zc, tw, th, THREE.RedIntegerFormat, THREE.UnsignedByteType);
    zoneTex.internalFormat = 'R8UI'; zoneTex.minFilter = zoneTex.magFilter = THREE.NearestFilter; zoneTex.needsUpdate = true;
    this.groundTex = fieldTex; this.zoneTex = zoneTex;
    // real tree cover: wooded ground is forest, open ground below the treeline is snow (as it is in winter)
    const cv = this.canopy;
    const canopyTex = new THREE.DataTexture(cv ? cv.cover : new Uint8Array([255]), cv ? cv.w : 1, cv ? cv.h : 1, THREE.RedFormat, THREE.UnsignedByteType);
    canopyTex.internalFormat = 'R8'; canopyTex.minFilter = THREE.LinearFilter; canopyTex.magFilter = THREE.LinearFilter; canopyTex.needsUpdate = true;
    this.canopyTex = canopyTex;

    const lin = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    const Z = ['free', 'extreme', 'sled', 'race', 'learn', 'family', 'slow', 'park'].map((k) => lin(...ZONES[k].rgb));
    const tl = (this.resort.treeline || 1300) - zmin;                // treeline in the mesh's height units
    // depth bias (pickLods): the ground is pushed back a little in depth, never moved on screen, so a run line floating
    // above the snow is never hidden by a coarser far piece. x: share of the distance in 3D; y: metres in 2D.
    this.groundBias = { value: new THREE.Vector2() };
    const U = {
      uBias: this.groundBias,
      uField: { value: fieldTex }, uZone: { value: zoneTex }, uCanopy: { value: canopyTex }, uHasCanopy: { value: cv ? 1 : 0 },
      cOpen: { value: lin(228, 235, 240) },
      uOrigin: { value: new THREE.Vector2(geo.W / 2, geo.H / 2) }, uSize: { value: new THREE.Vector2(W, H) },
      uTl: { value: tl }, uCell: { value: cell },
      cSnow: { value: lin(246, 250, 253) }, cGlade: { value: lin(176, 205, 190) }, cRock: { value: lin(124, 132, 141) }, cAlpine: { value: lin(226, 234, 240) },
      cHigh: { value: lin(150, 182, 176) }, cMid: { value: lin(44, 104, 80) }, cLow: { value: lin(52, 122, 78) }, cZone: { value: Z },
    };
    const mat = new THREE.MeshLambertMaterial();
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;\nvarying vec3 vGNrm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGPos = position;\nvGNrm = normal;')
        .replace('#include <common>', '#include <common>\nuniform vec2 uBias;')
        .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 bp = mvPosition; if (isOrthographic) bp.z -= uBias.y; else bp.xyz *= 1.0 + uBias.x; gl_Position = projectionMatrix * bp; }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vGPos;
varying vec3 vGNrm;
uniform sampler2D uField;
uniform sampler2D uCanopy;
uniform float uHasCanopy;
uniform vec3 cOpen;
uniform highp usampler2D uZone;
uniform vec2 uOrigin, uSize;
uniform float uTl, uCell;
uniform vec3 cSnow, cGlade, cRock, cAlpine, cHigh, cMid, cLow, cZone[8];
// crisp but anti-aliased edge where a field crosses 0.5
float edgeOf(float f, float fw) { float w = max(fw * 0.5, 0.002); return smoothstep(0.5 - w, 0.5 + w, f); }
vec3 groundColour() {
  vec2 uv = vec2((vGPos.x + uOrigin.x) / uSize.x, (uOrigin.y - vGPos.z) / uSize.y);
  vec4 f = texture2D(uField, uv);
  vec3 fw = fwidth(f.rgb);
  float cv = texture2D(uCanopy, uv).r, cvw = max(fwidth(cv) * 0.6, 0.03);   // tree cover, with a crisp forest edge
  float hu = (vGPos.x - vGPos.z) / 9.0, hw = fwidth(hu);
  float alt = vGPos.y;
  vec3 n = normalize(vGNrm);
  float relief = 1.2 * sqrt(max(0.0, 1.0 - n.y * n.y)) / max(n.y, 0.05);   // rise over run, as the old per-triangle measure
  bool alpine = alt > uTl + 60.0;
  // forest bands by height, blended over ~40 m; alpine snow above the treeline; rock on steep ground
  vec3 c = alt > uTl - 260.0 ? mix(cHigh, cAlpine, smoothstep(uTl + 40.0, uTl + 80.0, alt))
                             : mix(mix(cLow, cMid, smoothstep(uTl - 460.0, uTl - 420.0, alt)), cHigh, smoothstep(uTl - 280.0, uTl - 240.0, alt));
  // with real tree cover: forest only where the trees are; clearings and meadows below the treeline are snow
  if (uHasCanopy > 0.5 && !alpine) c = mix(cOpen, c, smoothstep(0.45 - cvw, 0.45 + cvw, cv));
  c = mix(c, alt > uTl + 60.0 ? cSnow : cGlade, edgeOf(f.g, fw.g));
  c = mix(c, cRock, smoothstep(-0.06, 0.06, relief - (alpine ? 0.7 : 0.95)));
  float s = edgeOf(f.r, fw.r);
  c = mix(c, cSnow, s);
  uint code = texture(uZone, uv).r;
  uint zn = code & 15u;
  if (zn > 0u) {
    float k = edgeOf(f.b, fw.b) * ((code & 16u) > 0u ? 1.0 : s);
    if (zn <= 2u) {            // freeride and extreme terrain: diagonal hatching
      float u = hu, w = min(hw * 0.6, 0.2);   // a stripe every ~6 m
      float t = fract(u);
      // thin stripes up close; from far away (stripes below a pixel) an even lighter tint instead
      k *= mix(smoothstep(0.6 - w, 0.6 + w, t) * (1.0 - smoothstep(0.95 - w, 0.95 + w, t)), 0.35, smoothstep(0.15, 0.4, hw));
    }
    c = mix(c, cZone[zn - 1u], k);
  }
  return c;
}`)
        .replace('#include <map_fragment>', 'diffuseColor.rgb = groundColour();');
    };
    return mat;
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
    // in pieces like the detailed ground (buildTerrain): those off screen are skipped and the far ones drawn coarser;
    // cells hidden under the detailed map are left out (smooth shading, like the detailed map)
    const hidden = (i, j) => { const a = j * nx + i; return inside[a] && inside[a + 1] && inside[a + nx] && inside[a + nx + 1]; };
    const S = chunkSurface(pos, nx, ny, { C: 32, steps: [1, 2, 4], skip: hidden });
    const C = new Float32Array(S.pos.length);
    C.set(col);
    for (let k = 0; k < S.skirtSrc.length; k++) { const v = nx * ny + k, o = S.skirtSrc[k]; C[v * 3] = col[o * 3]; C[v * 3 + 1] = col[o * 3 + 1]; C[v * 3 + 2] = col[o * 3 + 2]; }
    const attrs = { position: new THREE.BufferAttribute(S.pos, 3), normal: new THREE.BufferAttribute(S.nrm, 3), color: new THREE.BufferAttribute(C, 3) };
    this.surroundGroup = this.piecesOf(S, attrs, new THREE.BufferAttribute(S.index, 1), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.surroundGroup);
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
    if (this.canopy) {
      // Real trees: planted where Meta's canopy map has them, as densely as it says, at its height. Never on a
      // groomed run, slope outline, base area or lift line; glades keep theirs (they are runs through the trees).
      const cv = this.canopy, c = cv.cell, BUDGET = 9000;   // about 4x the old random trees, at half the triangles each
      let total = 0;
      const ok = (ci, cj) => {
        const gi = Math.min(nx - 1, Math.round(((ci + 0.5) * c) / cell)), gj = Math.min(ny - 1, Math.round(((cj + 0.5) * c) / cell));
        return near[((gj / q) | 0) * qx + ((gi / q) | 0)] && mask[gj * nx + gi] < 0.45;
      };
      for (let cj = 0; cj < cv.h; cj++) for (let ci = 0; ci < cv.w; ci++) {
        const k = cj * cv.w + ci;
        if (cv.cover[k] > 60 && ok(ci, cj)) total += cv.cover[k] / 255;
      }
      const keep = Math.min(1, BUDGET / Math.max(1, total));     // one tree per cell at full cover, within the budget
      for (let cj = 0; cj < cv.h; cj++) for (let ci = 0; ci < cv.w; ci++) {
        const k = cj * cv.w + ci;
        if (cv.cover[k] <= 60 || rnd() > (cv.cover[k] / 255) * keep || !ok(ci, cj)) continue;
        spots.push([(ci + rnd()) * c, (cj + rnd()) * c, rnd(), Math.min(35, Math.max(4, cv.height[k] || 12))]);
      }
    } else for (let j = 1; j < ny - 1; j += 2) for (let i = 1; i < nx - 1; i += 2) {
      if (!near[((j / q) | 0) * qx + ((i / q) | 0)] || mask[j * nx + i] > 0.15) continue;
      // trees thin out over the last 150 m below the treeline and stop at it
      const up = zmin + h[j * nx + i] / 10 - (tl - 150);
      if (up > 0 && rnd() < up / 150) continue;
      if (rnd() < 0.3) spots.push([(i + rnd() * 1.6 - 0.8) * cell, (j + rnd() * 1.6 - 0.8) * cell, rnd()]);
    }
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
    // stencil: a tree is not drawn where a run was seen in front of the ground (see buildTrails), so runs show
    // through the trees but never through the ground
    const treeMat = new THREE.MeshLambertMaterial({ stencilWrite: true, stencilWriteMask: 0, stencilRef: SEEN_BIT, stencilFuncMask: SEEN_BIT,
      stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
    const geo = M.treeGeometry();
    // Trees in blocks of the map, each its own mesh: blocks off screen are skipped, and far blocks draw only part of
    // their trees (updateTrees). Within a block the trees are in random order, so any first part of them is an even
    // thinning.
    const B = 5, bw = this.geo.W / B, bh = this.geo.H / B, lists = Array.from({ length: B * B }, () => []);
    for (const sp of spots) lists[Math.min(B - 1, Math.max(0, Math.floor(sp[1] / bh))) * B + Math.min(B - 1, Math.max(0, Math.floor(sp[0] / bw)))].push(sp);
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
    const dark = new THREE.Color('#1f5a3c'), light = new THREE.Color('#2f7a4f'), frost = new THREE.Color('#dbe8e6');
    this.trees = new THREE.Group();
    for (const list of lists) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, treeMat, list.length);
      list.forEach(([x, y, r, tall], i) => {
        const p = this.world(x, y, -0.5);
        // real height where known (the cone is 4.2 units tall), a little narrower than before; else as before
        if (tall) { const s = (tall * (0.85 + r * 0.3)) / 4.2; m.compose(p, qn, sc.set(s * 0.95, s, s * 0.95)); }
        else { const s = 2.6 + r * 1.5; m.compose(p, qn, sc.set(s * 1.3, s, s * 1.3)); }
        mesh.setMatrixAt(i, m);
        const alt = p.y + this.resort.grid.zmin;
        c.copy(dark).lerp(light, r).lerp(frost, alt > tl - 300 ? Math.min(0.75, (alt - (tl - 300)) / 200) : 0);
        mesh.setColorAt(i, c);
      });
      mesh.computeBoundingSphere();
      mesh.userData.total = list.length;
      this.trees.add(mesh);
    }
    this.treeTotal = spots.length;
    this.scene.add(this.trees);
  }

  /** Trees drawn per block: the quality step's share, thinned further with distance beyond TREES_FULL_M. */
  updateTrees() {
    if (!this.trees?.visible) return;
    const share = QUALITY[this.q || 0].trees, cam = this.camera.position;
    for (const mesh of this.trees.children) {
      const bs = mesh.boundingSphere, d = Math.max(0, cam.distanceTo(bs.center) - bs.radius);
      const far = d <= TREES_FULL_M ? 1 : Math.max(FAR_TREES, TREES_FULL_M / d);
      mesh.count = Math.max(1, Math.floor(mesh.userData.total * share * far));
    }
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

  /** A run's points for drawing: only those needed to stay within 2 m of it in plan and 1.5 m in height (src/simplify.js). */
  runPts(t) {
    const C = (this._runPts ||= new WeakMap());
    let out = C.get(t);
    if (!out) { out = simplifyRun(t.pts, (x, y) => this.surfaceZ(x, y)); C.set(t, out); }
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
    const faded = {};
    for (const t of R.trails) {
      if (t.hide) continue;       // not open to the public (tools/verify_exists.py)
      const pts = this.runPts(t);
      if (closed.has('t' + t.id)) { this.segs(pts, 3.2, shut); continue; }
      // a real run the resort's map leaves off: drawn faded, without the white edge
      if (t.unof) { this.segs(pts, 3.2, (faded[cls(R, t)] ||= [])); continue; }
      if (!t.glade) this.segs(pts, 2.7, casing);
      this.segs(pts, 3.2, (byStyle[cls(R, t) + (t.glade ? 'g' : '')] ||= []));
    }
    for (const [c, pos] of Object.entries(faded)) G.add(this.fatLine(pos, scheme(R).colors[+c], 2.4, { order: 4, opacity: 0.45 }));
    // Outlines of wide slopes (OpenStreetMap piste areas): a thin dotted edge in the colour of the run of the same
    // name, so they never read as a separate run or a glade. Left out when that run is not on the resort's map.
    const runOf = new Map();
    for (const t of R.trails) if (t.name && (!runOf.has(t.name) || runOf.get(t.name).hide)) runOf.set(t.name, t);
    const edges = {};
    for (const a of R.areas) {
      const t = a.name && runOf.get(a.name);
      if (t?.hide || (a.name && closed.has('t' + t?.id))) continue;
      this.segs(a.pts.concat(a.pts.slice(0, 2)), 3.2, (edges[cls(R, t || a)] ||= []));
    }
    for (const [c, pos] of Object.entries(edges)) G.add(this.fatLine(pos, scheme(R).colors[+c], 1.6, { order: 4, dash: [3, 6], opacity: 0.75 }));
    const runs = [this.fatLine(casing, '#ffffff', 5.5, { order: 3 })];
    for (const [key, pos] of Object.entries(byStyle)) {
      const glade = key.endsWith('g');
      runs.push(this.fatLine(pos, scheme(R).colors[+key[0]], glade ? 2.6 : 3.2, { order: 4, dash: glade ? [16, 11] : null }));
    }
    runs.push(this.fatLine(shut, COLORS.closed, 3, { order: 4, dash: [8, 10] }));
    // Runs through the woods, in one pass: the runs are drawn straight after the ground and before everything else,
    // tested against the ground only, so a run behind a ridge or on the far side of the mountain stays hidden. Where
    // a run is drawn it leaves a mark (SEEN_BIT); trees are not drawn on that mark (buildTrees), so a glade or a run
    // under the canopy shows in its true place, while trees in front of a ridge that hides a run are drawn as usual
    // (owner's rule, 2026-11-23). The coloured lines write depth, so a building, lift or person in front of a run
    // still covers it and one behind it does not; the white edge is drawn first and writes none, so the colour
    // always lies on top of it.
    runs.forEach((l, i) => {
      Object.assign(l.material, { transparent: false, depthTest: true, depthWrite: i > 0, stencilWrite: true,
        stencilRef: SEEN_BIT, stencilWriteMask: SEEN_BIT, stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.ReplaceStencilOp });
      l.renderOrder = i ? RUN_ORDER : RUN_ORDER - 0.5;
      G.add(l);
    });
    this.scene.add(G);
    // label anchors: one per trail name (longest segment)
    const best = new Map();
    for (const t of R.trails) if (t.name && !t.hide && (!best.has(t.name) || best.get(t.name).len < t.len)) best.set(t.name, t);
    this.trailLabels = [...best.values()].map((t) => {
      const i = Math.floor(t.pts.length / 4) * 2;
      return { t, p: this.world(t.pts[i], t.pts[i + 1], 14) };
    });
    for (const a of R.areas) if (a.name && !best.has(a.name) && !runOf.get(a.name)?.hide) this.trailLabels.push({ t: { name: a.name, d: a.d, id: -1, len: 400 }, p: this.world(a.pts[0], a.pts[1], 14) });
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
    const cable = [], symbol = [], towerMats = [], stationGeos = [], belts = [];
    const count = { chair: 0, cabin: 0, bar: 0, platter: 0, rope: 0, pad: 0 };
    const rail = { bed: [], rails: [], dark: [], white: [], tunnel: [], sleepers: [], portals: [], paths: [] };
    // per lift type: tower height, station height, half cable spacing, longest span between
    // supports, least clearance over the ground, how far apart the carriers are, red-line lift
    const SPEC = {
      tram: { th: 26, endH: 13, r: 5, span: Infinity, clear: 12, sag: [16, 0.022], red: RED_UP },
      gondola: { th: 13, endH: 7.5, r: 3, span: 120, clear: 7.5, sag: [2.5, 0.015], carrier: 'cabin', gap: 85, red: RED_UP },
      chair: { th: 9.5, endH: 6.5, r: 2.4, span: 100, clear: 6.5, sag: [2.5, 0.015], carrier: 'chair', gap: 48, red: RED_UP },
      surface: { th: 4.5, endH: 4.5, r: 1, span: 60, clear: 3.6, sag: [0, 0], carrier: 'bar', gap: 30, red: 2 },
      carpet: { th: 0.8, endH: 0.8, r: 0.5, span: 14, clear: 0.8, sag: [0, 0], carrier: 'pad', gap: 2.5, red: 2.5 },
    };
    // A lift end on a mapped station building is drawn once: the terminal model, or the building when it is a big
    // lodge the lift starts inside (stationClashes). buildBuildings leaves out the buildings listed here.
    const endKeys = [], endPts = [];
    for (const l of R.lifts) {
      if (l.hide || l.kind === 'train' || l.kind === 'funicular' || l.kind === 'carpet' || l.pts.length < 4) continue;
      const n = l.pts.length;
      endKeys.push(`${l.id}:0`, `${l.id}:1`);
      endPts.push([l.pts[0], l.pts[1]], [l.pts[n - 2], l.pts[n - 1]]);
    }
    const clash = stationClashes(R.buildings || [], endPts);
    this.skipBuildings = clash.skipBuildings;
    const skipEnd = new Set([...clash.skipEnds].map((i) => endKeys[i]));
    for (const l of R.lifts) {
      if (l.hide) continue;
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
      // chairs drawn with the lift's real seat count, and its weather bubble when it has one (tools/enrich_osm.py)
      const seats = [1, 2, 3, 4, 6, 8].reduce((a, b) => (Math.abs(b - (l.seats || 4)) < Math.abs(a - (l.seats || 4)) ? b : a));
      const carrier = K.carrier === 'chair' ? `chair${seats}${l.bubble ? 'b' : ''}` : K.carrier;
      const path = { l, tram, pts, cum, L, r, loop: 2 * L + 2 * Math.PI * r, chairs: 0, first: 0, carrier, chair: K.carrier === 'chair', seats, bubble: !!l.bubble, gondola: l.kind === 'gondola', carpet: low };
      // cables are drawn with only the points needed to stay within 25 cm of their sag (straight spans need two)
      const line = (ring0, close) => { const ring = simplifyPath3(ring0, 0.25); for (let i = 0; i + 1 < ring.length + (close ? 1 : 0); i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; cable.push(p.x, p.y, p.z, q.x, q.y, q.z); } };
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
        // Spacing: from the lift's real capacity where OpenStreetMap has it (line speed x 3600 x seats / people an
        // hour); otherwise detachable (express) chairs 70 m apart, the rest by type as before.
        const lineSpeed = l.dur ? l.len / l.dur : 0, fast = l.detach || l.name.includes('Express') || lineSpeed > 3.5;
        const spacing = l.cap && lineSpeed && (path.chair || path.gondola)
          ? Math.min(150, Math.max(12, (lineSpeed * 3600 * (path.chair ? seats : l.seats || 8)) / l.cap))
          : path.chair && fast ? 70 : K.gap;
        path.fast = fast;
        // on the map every lift runs at twice its real line speed, so the motion reads at mountain scale
        path.speed = (path.chair ? (fast ? 5 : 2.4) : CARRIER_SPEED[carrier] || 2.5) * 2;
        if ((path.chair && fast) || path.gondola) {
          // detachable: carriers let go of the cable in the stations, slow to a crawl and bunch up there
          path.timer = loopTimer(detachSegments(L, r, path.speed, path.gondola ? 0.8 : 1));
          path.chairs = Math.min(110, Math.max(4, Math.floor((path.speed * path.timer.T) / spacing)));
          path.dt = path.timer.T / path.chairs;
        } else path.chairs = Math.min(l.kind === 'carpet' ? 240 : 90, Math.max(4, Math.floor(path.loop / spacing)));
        path.gap = path.loop / path.chairs;
        path.first = count[carrier] || 0; count[carrier] = path.first + path.chairs;
      }
      path.mid = this.pathPoint(path, L / 2, 0).pos;
      // The single red line that stands for the lift: it follows the cables, midway between the
      // two of them and clearly above, and is drawn after them, so from far away the red always
      // lies on top of the dark cables instead of blending into them.
      { const sp = simplifyPath3(pts, 0.25); for (let i = 1; i < sp.length; i++) symbol.push(sp[i - 1].x, sp[i - 1].y + K.red, sp[i - 1].z, sp[i].x, sp[i].y + K.red, sp[i].z); }
      const dir = sup[n - 1].clone().sub(sup[0]).setY(0).normalize(), yaw = Math.atan2(dir.x, dir.z);
      // towers stand on the ground under each support and reach up to the cable there
      const tk = SPEC[l.kind] && l.kind !== 'carpet' ? l.kind : 'chair';
      if (tram) path.towerD = [];
      if (l.kind !== 'carpet') for (let i = 1; i < n - 1; i++) {
        const base = this.world(xy[i][0], xy[i][1], 0), at = this.alongAt(path, sup[i]);
        towerMats.push({ p: base, yaw, h: Math.max(K.th, this.pathPoint(path, at, 0).pos.y - base.y), kind: tk, r });
        if (tram) path.towerD.push(at);
      }
      // terminals at both ends: the motor room at the bottom (at the top on a tram), the long housing of a
      // detachable lift where its carriers slow down
      if (l.kind !== 'carpet') for (const e of [0, n - 1]) {
        if (skipEnd.has(`${l.id}:${e ? 1 : 0}`)) continue;
        const g = M.stationGeometry(tk, STATION_COLOR, K.endH + 1, r, { end: e ? 1 : 0, detach: !!path.timer, drive: tram ? !!e : !e });
        const base = this.world(xy[e][0], xy[e][1], 0);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(base.x, base.y - 1, base.z));
        stationGeos.push(g);
      }
      if (l.kind === 'carpet') { const b = M.beltGeometry(pts.map((q) => q.clone().setY(q.y - K.clear))); if (b) belts.push(b); }
      if (tram) path.ride = tramRide(L, l.dur);
      this.liftPaths.push(path);
    }
    this.scene.add(this.fatLine(symbol, COLORS.lift, 2.8, { order: 8 }));
    // steel cables: thin and dark, so the red map line stays the one line you read per lift
    this.liftLine = this.fatLine(cable, '#3d444d', 1, { order: 6, opacity: 0.8 });
    this.scene.add(this.liftLine);
    // towers: two instanced meshes per kind of lift (the poles, stretched to each tower's height, and the heads
    // with crossarm and sheaves), so a whole resort's towers cost a handful of draw calls
    const kinds = new Map();
    for (const t of towerMats) { if (!kinds.has(t.kind)) kinds.set(t.kind, []); kinds.get(t.kind).push(t); }
    const towerMat = M.vcMat(true), headMat = M.vcMat();   // smooth shading: round steel poles
    const mt = new THREE.Matrix4(), mq = new THREE.Quaternion(), ms = new THREE.Vector3(), mp = new THREE.Vector3();
    for (const [kind, list] of kinds) {
      const poles = new THREE.InstancedMesh(M.towerPoleGeometry(kind), towerMat, list.length);
      const heads = new THREE.InstancedMesh(M.towerHeadGeometry(kind, list[0].r), headMat, list.length);
      list.forEach((t, i) => {
        mq.setFromAxisAngle(UP, t.yaw);
        poles.setMatrixAt(i, mt.compose(mp.set(t.p.x, t.p.y - 1, t.p.z), mq, ms.set(1, t.h + 1 - M.TOWER_HEAD[kind], 1)));
        heads.setMatrixAt(i, mt.compose(mp.set(t.p.x, t.p.y + t.h, t.p.z), mq, ms.set(1, 1, 1)));
      });
      for (const m of [poles, heads]) { m.computeBoundingSphere(); this.scene.add(m); }
    }
    // every terminal and magic-carpet belt in the resort is one merged mesh: a single draw call
    const statics = [...stationGeos, ...belts];
    if (statics.length) this.scene.add(new THREE.Mesh(mergeGeometries(statics), M.vcMat()));
    // one instanced mesh per kind of carrier, whatever the number of lifts. Chairs and gondola cabins have two:
    // a few boxes for the far ones, and the detailed model for those near the camera (filled each frame).
    this.carriers = {}; this.carriersNear = {};
    const chairKinds = [...new Set(this.liftPaths.filter((p) => p.chair).map((p) => p.carrier))];
    const add = (geo, mat, n) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;   // filled by animateLifts
      this.scene.add(mesh);
      return mesh;
    };
    const glass = new THREE.MeshLambertMaterial({ color: 0xe58a3a, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
    for (const k of chairKinds) {
      const seats = +k.slice(5, 6), bubble = k.endsWith('b');
      this.carriers[k] = add(M.chairFarGeometry(seats, bubble), M.vcMat(), count[k]);
      this.carriersNear[k] = { mesh: add(M.chairGeometry(seats, bubble), M.vcMat(), count[k]), bubble: bubble ? add(M.bubbleGeometry(seats), glass, count[k]) : null };
    }
    this.carriers.cabin = add(M.gondolaFarGeometry(), M.vcMat(), count.cabin);
    this.carriersNear.cabin = { mesh: add(M.gondolaGeometry(), M.vcMat(), count.cabin), bubble: null };
    for (const [k, geo] of [['bar', M.tbarGeometry()], ['platter', M.platterGeometry()], ['rope', M.ropeHandleGeometry()], ['pad', M.padGeometry()]]) this.carriers[k] = add(geo, M.vcMat(), count[k]);
    for (const k in this.carriersNear) { const N = this.carriersNear[k]; N.mesh.count = 0; N.mesh.visible = false; if (N.bubble) { N.bubble.count = 0; N.bubble.visible = false; } }
    // where a chair's bubble sits: lowered over the riders going up, raised behind the chair coming down
    const [bx, by, bz] = M.BUBBLE_PIVOT, pivot = (a) => new THREE.Matrix4().makeTranslation(bx, by, bz).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(-bx, -by, -bz));
    this.bubbleDown = pivot(0); this.bubbleUp = pivot(-1.9);
    this.cabins = this.carriers.cabin;
    this.liftsMoved = false;
    // aerial trams (cable cars): two cabins each, every tram in the resort
    this.trams = this.liftPaths.filter((p) => p.tram).map((path) => ({ path, cabins: [new THREE.Mesh(M.tramGeometry(0xd32f2f), M.vcMat()), new THREE.Mesh(M.tramGeometry(0x2e8b57), M.vcMat())] }));
    for (const tr of this.trams) for (const c of tr.cabins) { c.scale.setScalar(1.5); c.rotation.order = 'YXZ'; this.scene.add(c); }
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

  /** pathPoint without allocating: writes the position into `out`, returns the yaw. */
  pathPointInto(path, d, side, out) {
    const { pts, cum } = path;
    // binary search for the stretch holding d
    let lo = 1, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m + 1; else hi = m; }
    const i = lo, a = pts[i - 1], b = pts[i];
    const f = Math.min(1, Math.max(0, (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    out.set(a.x + (b.x - a.x) * f + (-dz / len) * side, a.y + (b.y - a.y) * f, a.z + dz * f + (dx / len) * side);
    return Math.atan2(dx, dz);
  }

  /** loopPoint without allocating: writes the position into `out`, returns the yaw. */
  loopPointInto(path, u, out) {
    const { pts, L, r, loop } = path, n = pts.length;
    u = ((u % loop) + loop) % loop;
    const turn = (c, a, b, ang, sign) => {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, fx = dx / len, fz = dz / len, sx = -fz, sz = fx;
      const co = Math.cos(ang) * sign, si = Math.sin(ang) * sign;
      out.set(c.x + sx * r * co + fx * r * si, c.y, c.z + sz * r * co + fz * r * si);
      return Math.atan2(-sx * si + fx * co, -sz * si + fz * co);
    };
    if (u < L) return this.pathPointInto(path, u, r, out);
    if (u < L + Math.PI * r) return turn(pts[n - 1], pts[n - 2], pts[n - 1], (u - L) / r, 1);
    if (u < 2 * L + Math.PI * r) return this.pathPointInto(path, 2 * L + Math.PI * r - u, -r, out) + Math.PI;
    return turn(pts[0], pts[0], pts[1], (u - 2 * L - Math.PI * r) / r, -1);
  }

  /**
   * Move every carrier to where it is at time t. Chairs, cabins and T-bars are drawn only for lifts in view and within
   * the quality step's lift range (QUALITY lifts: beyond it a chair is smaller than a pixel, while the red lift line,
   * cables, towers and stations stay); the carriers drawn are packed at the start of each kind's mesh, so the ones
   * left out cost nothing. Chairs and cabins near the camera are drawn with the detailed model, the rest with the
   * simple one. hide: draw no carriers at all (zoomed so far out that lifts are not animated). Returns how many
   * running lifts in view moved, so the frame loop knows whether the picture changed. Allocates nothing.
   */
  animateLifts(t, hide = false) {
    const A = (this._anim ||= {
      m: new THREE.Matrix4(), m2: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'),
      pos: new THREE.Vector3(), big: new THREE.Vector3(1.6, 1.6, 1.6), one: new THREE.Vector3(1, 1, 1), tuck: new THREE.Vector3(1, 0.4, 1),
      fr: new THREE.Frustum(), pm: new THREE.Matrix4(), sph: new THREE.Sphere(), sh: { f: 0, v: 0, a: 0 },
      cnt: {}, nc: {},
    });
    const cam = this.camera.position, all = !this.liftsMoved, is3 = this.mode === '3d', Q = QUALITY[this.q || 0];
    const nearR2 = is3 && !hide ? Q.near * Q.near : -1;
    this.camera.updateMatrixWorld();
    A.pm.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    A.fr.setFromProjectionMatrix(A.pm);
    const inView = (c, rad) => { A.sph.center.copy(c); A.sph.radius = rad; return A.fr.intersectsSphere(A.sph); };
    for (const k in this.carriers) A.cnt[k] = 0;
    for (const k in this.carriersNear) A.nc[k] = 0;
    let moved = 0;
    for (const p of this.liftPaths) {
      if (!p.chairs || hide) continue;
      if ((is3 && p.mid.distanceTo(cam) > Q.lifts + p.L / 2) || !inView(p.mid, p.L / 2 + 40)) continue;
      const running = !this.closed.has('l' + p.l.id), k = p.carrier, mesh = this.carriers[k], N = this.carriersNear[k];
      const hang = p.chair || k === 'cabin', tow = k === 'bar' || k === 'platter', pad = k === 'pad';
      const tt = running ? t : 0, ph0 = p.l.id * 2.3;
      for (let i = 0; i < p.chairs; i++) {
        let u, acc = 0;
        if (p.timer) { u = p.timer.at(i * p.dt + tt); acc = p.timer.acc; } else u = (i * p.gap + tt * p.speed) % p.loop;
        const yaw = this.loopPointInto(p, u, A.pos);
        const near = !!N && A.pos.distanceToSquared(cam) < nearR2;
        let pitch = 0, scale = hang ? A.big : A.one;
        // the sway is only worked out where it can be seen
        if (hang) { if (near) pitch = swing(t, ph0 + i * 1.7, acc, running ? 0.02 : 0.006); }
        else if (tow) { if (u < p.L) pitch = 0.38; else scale = A.tuck; }     // pulled back going up, tucked up coming down
        else if (pad && u >= p.L) A.pos.y -= 3;                                // the belt's return run is underneath
        if (pitch) A.q.setFromEuler(A.e.set(pitch, yaw, 0));
        else A.q.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
        A.m.compose(A.pos, A.q, scale);
        if (near) {
          const j = A.nc[k]++;
          N.mesh.setMatrixAt(j, A.m);
          if (N.bubble) N.bubble.setMatrixAt(j, A.m2.multiplyMatrices(A.m, u < p.L ? this.bubbleDown : this.bubbleUp));
        } else mesh.setMatrixAt(A.cnt[k]++, A.m);
      }
      if (running) moved++;
    }
    let shown = false;
    for (const k in this.carriers) {
      const mesh = this.carriers[k], n = A.cnt[k];
      if (n || mesh.count) { mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; }
      shown ||= n > 0;
    }
    for (const k in this.carriersNear) {
      const N = this.carriersNear[k], n = A.nc[k];
      shown ||= n > 0;
      if (!n && !N.mesh.count) continue;
      for (const m of N.bubble ? [N.mesh, N.bubble] : [N.mesh]) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; }
    }
    this.carriersShown = shown;
    this.liftsMoved = true;
    // trains and funicular cars shuttle between their two stations, waiting at each end
    for (const car of this.railCars || []) {
      const p = car.path, running = !this.closed.has('l' + p.l.id);
      if (!all && !inView(p.mid, p.L / 2 + 40)) continue;
      const ride = Math.max(25, p.L / (p.l.kind === 'funicular' ? 16 : 12)), dwell = 10, cyc = 2 * (ride + dwell), ph = running ? (t + p.l.id * 7) % cyc : 0;
      const tri = ph < ride ? ph / ride : ph < ride + dwell ? 1 : ph < 2 * ride + dwell ? 1 - (ph - ride - dwell) / ride : 0;
      const d = p.L * tri * tri * (3 - 2 * tri);
      const a = this.pathPoint(p, Math.max(0, d - 6), 0).pos, b = this.pathPoint(p, Math.min(p.L, d + 6), 0).pos;
      car.mesh.position.copy(a).lerp(b, 0.5);
      car.mesh.lookAt(b);
      car.mesh.visible = !p.tunnels.some(([u, v]) => d > u + 8 && d < v - 8);
      if (running) moved++;
    }
    for (const tram of this.trams) {
      // Jig-back tram, like the real one: each cabin stays on its own track ropes. As one climbs the other comes
      // down; each speeds up out of its station, cruises, slows into the other one, and both wait there. The
      // cabins lean against the change of speed and swing a little after passing a tower.
      const p = tram.path, running = !this.closed.has('l' + p.l.id);
      if (!all && !inView(p.mid, p.L / 2 + 60)) continue;
      const s = shuttle(running ? t + p.l.id * 11 : 0, p.ride, 14, 0.18, A.sh);
      tram.cabins.forEach((c, i) => {
        const f = i ? 1 - s.f : s.f, d = p.L * f, dir = i ? -1 : 1;
        c.rotation.y = this.pathPointInto(p, d, i ? -p.r : p.r, c.position);
        // the last tower passed, in the direction of travel
        let since = Infinity;
        if (s.v) for (const td of p.towerD) { const x = (d - td) * dir * Math.sign(s.v); if (x >= 0 && x < since) since = x; }
        const kick = since < 400 ? 0.05 * Math.exp(-since / 90) * Math.sin(since / 16) : 0;
        c.rotation.x = swing(t, i * 2.1 + p.l.id, dir * s.a * p.L, 0.012) + kick;
      });
      if (running) moved++;
    }
    return moved;
  }

  buildBuildings() {
    const out = { pos: [], col: [], win: [] };
    const walls = ['#c9b79c', '#b89f7f', '#d8cdb9', '#a98a69'].map((c) => new THREE.Color(c));
    const roofs = ['#4c5563', '#6b3b33', '#3f4a45'].map((c) => new THREE.Color(c));
    const snow = new THREE.Color('#eef3f6');
    this.resort.buildings.forEach((b, bi) => {
      if (this.skipBuildings?.has(bi)) return;   // a lift's own terminal model stands here (buildLifts)
      const ring = [];
      let base = Infinity, area = 0;
      for (let i = 0; i < b.pts.length; i += 2) {
        const p = this.world(b.pts[i], b.pts[i + 1], 0);
        ring.push([p.x, p.z]); base = Math.min(base, p.y);
      }
      for (let i = 0; i < ring.length; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length]; area += x0 * z1 - x1 * z0; }
      area = Math.abs(area) / 2;
      // local y north -> world -z flips the winding; restore counter-clockwise for the roof triangulation
      ring.reverse();
      // Roof: the shape OpenStreetMap records where it has one (tools/enrich_osm.py); otherwise a gabled roof on
      // chalet-sized buildings and the old rule (flat when tall or tagged) on the rest. Pitched roofs carry snow.
      const tag = b.roofShape || '';
      const shape = tag === 'flat' ? 'flat' : /gabled|gambrel|saltbox|round|mansard/.test(tag) ? 'gabled'
        : /hipped|pyramidal|dome|onion|cone/.test(tag) ? 'hipped' : tag ? 'gabled'
        : (b.roof || b.h > 12) ? 'flat' : area < 900 ? 'gabled' : 'hipped';
      const h = b.levels ? Math.max(b.h, b.levels * 3) : b.h;   // about 3 m a storey
      const wall = b.wallCol ? new THREE.Color(b.wallCol) : walls[bi % walls.length];
      const roof = (b.roofCol ? new THREE.Color(b.roofCol) : roofs[bi % roofs.length].clone()).lerp(snow, shape === 'flat' ? 0.35 : 0.7);
      // rows of windows one storey apart (the storey count from OpenStreetMap where it has one); a chimney on
      // most chalet-sized pitched roofs
      const storey = b.levels ? h / b.levels : 3;
      M.addBuilding(out, ring, base, h, wall, roof, shape, { storey, chimney: shape !== 'flat' && area > 40 && area < 1500 && bi % 3 !== 2 });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    g.setAttribute('win', new THREE.Float32BufferAttribute(out.win, 4));
    g.computeVertexNormals();
    this.buildingMat = M.buildingMaterial();
    this.scene.add(new THREE.Mesh(g, this.buildingMat));
    this.updateGlow();
  }

  /** Windows light up warm in the evening and at night, by the resort's own sun time (from its longitude). */
  updateGlow(now = new Date()) {
    if (!this.buildingMat) return;
    const lon = this.geo?.p?.lon0 ?? 0;
    this.buildingMat.userData.glow.value = M.windowGlow(now.getUTCHours() + now.getUTCMinutes() / 60 + lon / 15);
    this.glowAt = performance.now();
  }

  buildMarkers() {
    this.meObj = new THREE.Group();
    this.meObj.visible = false;
    this.scene.add(this.meObj);
    this.pinObj = M.makePin('#ff3b30'); this.pinObj.visible = false; this.scene.add(this.pinObj);
    // the pin directions lead to, kept on the map after a new pin is dropped elsewhere
    this.navPinObj = M.makePin('#ff3b30'); this.navPinObj.visible = false; this.scene.add(this.navPinObj);
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
    const ride = path.rail ? kind : kind === 'surface' ? 'tow-' + (path.l.style || 'tbar') : kind === 'carpet' ? '' : path.chair ? 'chair' : 'cabin';
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
    if (fresh) this.overlayDirty = true;          // someone new, or a new look or colour: draw it now
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
    // standing still, GPS wanders by a few metres: ignore that, so a still figure stays put (and the map can rest)
    if (!snap && !moving && u.target && !u.moving && u.target.distanceToSquared(p) < 4) p.copy(u.target);
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

  /** Does this person still need smooth redraws: moving, gliding into place, turning or waving? */
  settling(obj) {
    const u = obj.userData;
    if (!u.target) return false;
    if (u.wave || u.moving || (u.avatar?.userData.amt || 0) > 0.002) return true;
    if (obj.position.distanceToSquared(u.target) > 0.0025) return true;      // more than 5 cm from where they are going
    return u.yaw != null && Math.abs(Math.atan2(Math.sin(u.yaw - u.yawNow), Math.cos(u.yaw - u.yawNow))) > 0.005;
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
    this.needsRender = true;
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
    this.needsRender = true;
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

  setUnits(u) { this.units = u; this.overlayDirty = true; }

  setMe(me) {
    this.needsRender = true;
    // me: {x, y, heading, avatar, color, moving, lift: {id, frac, down} | null} | null
    this.me = me;
    if (!me) { this.meObj.visible = false; return; }
    this.place(this.meObj, me, me.color, COLORS.me, false);
  }

  /** friends: [{id, name, avatar, color, x, y, heading, moving, age (s), stale, paused, online}] */
  setFriends(list) {
    this.needsRender = true;
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

  setPin(p) { this.overlayDirty = true; this.pin = p; this.pinObj.visible = !!p; if (p) this.pinObj.position.copy(this.world(p.x, p.y, 0)); this._navPinShown(); }
  /** The pin the current directions lead to (null when not routing to a pin). Drawn only while it differs from the dropped pin. */
  setNavPin(p) { this.overlayDirty = true; this.navPin = p ? { x: p.x, y: p.y } : null; if (p) this.navPinObj.position.copy(this.world(p.x, p.y, 0)); this._navPinShown(); }
  _navPinShown() {
    const n = this.navPin, p = this.pin;
    this.navPinShown = !!n && !(p && p.x === n.x && p.y === n.y);
    if (this.navPinObj) this.navPinObj.visible = this.navPinShown;
  }
  setMeet(p) { this.overlayDirty = true; this.meet = p; this.meetObj.visible = !!p; if (p) this.meetObj.position.copy(this.world(p.x, p.y, 0)); }

  /** Draw directions. `walk` lists the stretches done on foot, drawn over the route in their own colour. */
  setRoute(pts, walk = null) {
    this.needsRender = true;
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
    this.needsRender = true;
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
    this.needsRender = true;
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
      // positions relative to the map, which is not at the window's corner on a computer
      const r = el.getBoundingClientRect(), p = [...ptrs.values()].map((q) => ({ x: q.x - r.left, y: q.y - r.top }));
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
    this.renderer.setPixelRatio(this.sharpPr = Math.min(dpr, QUALITY[this.q || 0].pr));
    this.renderer.setSize(w, h);
    this.needsRender = true;
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
    const busy = now - (this.lastInput || 0) < 900 || now - (this.lastCameraMove || 0) < 150 || !!this.flight;
    // Not touched: ~30 fps while someone on the map is moving, ~20 fps otherwise (chairs creeping
    // along their cables look just as smooth, and most frames are then skipped entirely anyway).
    if (!busy && now - (this.lastFrame || 0) < (this.peopleMoving ? 31 : 48)) { this.wasBusy = false; return; }
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
    this.needsRender = true;
    if (this.perf) this.perf.q = this.q;
    this.resize();
  }

  /** Stop drawing while the start screen covers the map. */
  setPaused(p) { this.paused = p; }

  /**
   * Sharpness while moving: a little softer while the camera moves, sharp again SHARP_AFTER_MS after it stops. The
   * canvas is redrawn in the same frame as the change, so no empty frame ever shows. Returns true when it changed.
   */
  movingSharpness(now) {
    const full = this.sharpPr || 1;
    if (full <= 1.2) return false;
    const moving = !!this.flight || now - (this.lastCameraMove || 0) < SHARP_AFTER_MS;
    const want = moving ? movingPr(full) : full;
    if (want === this.renderer.getPixelRatio()) return false;
    this.renderer.setPixelRatio(want);
    return true;
  }

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
    const camDist = is3 ? this.cam3.position.distanceTo(c.target) : 0, now0 = performance.now();
    const farOut = is3 ? camDist > 7500 : this.zoom2 < 0.12;
    // While nobody touches the map, lifts are stepped smoothly up close and only a few times a second from
    // further away, where a chair moves less than a pixel between steps; frames with nothing new are not drawn.
    const touching = now0 - (this.lastInput || 0) < 900 || now0 - (this.lastCameraMove || 0) < 150;
    const liftGap = touching || this.flight ? 0 : is3 ? (camDist < 1500 ? 0 : camDist < 4000 ? 100 : 200) : (this.zoom2 > 0.5 ? 0 : 150);
    let liftsMoved = false;
    if (!farOut || this.flight) {
      if (now0 - (this.liftAt || 0) >= liftGap) { liftsMoved = this.animateLifts(this.t) > 0; this.liftAt = now0; }
    } else if (this.carriersShown) { this.animateLifts(this.t, true); liftsMoved = true; }
    if (now0 - (this.glowAt || 0) > 60000) this.updateGlow();
    if (is3) this.updateTrees();
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
    if (this.navPinShown) scaleFor(this.navPinObj, 0.014, 22);
    if (this.meet) scaleFor(this.meetObj, 0.016, 24);
    if (this.play) { this.playObj.visible = is3; this.glide(this.playObj, dt); scaleFor(this.playObj, 0.02); }
    // The label layer (lots of outlined text) is the most expensive 2D work, so it is only
    // redrawn when the view or the things on it changed, and at most ~4x a second otherwise.
    const cam = this.camera, e = cam.matrixWorld.elements, now = performance.now();
    const key = `${this.mode}|${e[12].toFixed(1)}|${e[13].toFixed(1)}|${e[14].toFixed(1)}|${e[0].toFixed(4)}|${e[5].toFixed(4)}|${e[10].toFixed(4)}|${this.zoom2.toFixed(4)}|${this.w}x${this.h}`;
    // People only need smooth redraws while someone is moving, gliding to a new position, turning
    // or waving. Standing still (the usual case for your own dot and a group's friends) they look
    // the same frame after frame, so they no longer keep the whole map redrawing.
    let people = !!this.play;
    if (!people && this.me) people = this.settling(this.meObj);
    if (!people) for (const f of this.friends.values()) if (this.settling(f.obj)) { people = true; break; }
    const justSettled = this.peopleMoving && !people;
    this.peopleMoving = people;
    if (justSettled) this.overlayDirty = true;
    if (key !== this.overlayKey) this.lastCameraMove = now;
    const resharp = this.movingSharpness(now);
    // Nothing is moving when the view is still, no lift is being animated and nobody on the map is moving: the
    // picture is then only refreshed every few seconds (saves battery and heat). Changes made from outside (a new
    // route, closures, a pin) set overlayDirty or needsRender, which draw at once.
    const still = !this.flight && !liftsMoved && !people && !justSettled && !this.overlayDirty && !this.needsRender && !resharp && key === this.overlayKey && now - (this.drawnAt || 0) < 3000;
    if (!still) { this.pickLods(); this.renderer.render(this.scene, this.camera); this.drawnAt = now; this.needsRender = false; }
    // the label layer: when the view or what is on it changed; otherwise every second while friends are shown (their
    // "last seen" times) and every few seconds when not
    if (key !== this.overlayKey || this.overlayDirty || (people && now - (this.overlayAt || 0) > 66) || now - (this.overlayAt || 0) > (this.friends.size ? 1000 : 3000)) {
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
    if (this.navPinShown) marker(this.navPin, this.navPinObj, '#d92d20', t('Pin'), { type: 'navpin' });
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

// Stencil mark and draw order for runs seen through trees (buildTrails): the ground first, then the runs, which mark
// where they are seen, then everything else (trees, lifts, buildings) at the default order 0.
const SEEN_BIT = 2;
const GROUND_ORDER = -2, RUN_ORDER = -1;
