// Start-screen globe: a single low-poly sphere with a canvas-drawn texture (Natural Earth
// land outlines), slowly spinning. Picking a resort turns the globe to it and zooms in.
import * as THREE from 'three';
import { peakHeight, dropOf } from './globemarks.js';

const LAYERS = ['land', 'coast', 'borders', 'states', 'hiCoast', 'hiBorders', 'water'];
/** The point lists of one layer of globe.bin, as [lon, lat, lon, lat, ...] arrays in degrees. */
function layer(meta, bin, name) {
  let o = 0;
  for (const l of LAYERS) { if (l === name) break; o += meta[l].reduce((n, c) => n + c, 0) * 2; }
  return meta[name].map((count) => {
    const a = new Float32Array(count * 2);
    for (let i = 0; i < count * 2; i++) a[i] = bin[o + i] / meta.scale;
    o += count * 2;
    return a;
  });
}

const ll = (lat, lon, r = 1) => {
  const phi = THREE.MathUtils.degToRad(lon + 180), c = Math.cos(THREE.MathUtils.degToRad(lat));
  return new THREE.Vector3(-Math.cos(phi) * c * r, Math.sin(THREE.MathUtils.degToRad(lat)) * r, Math.sin(phi) * c * r);
};

// Resort peaks: only mountains with a map are shown (owner, 2026-11-24), all alike: rock grey with a snow cap.
const ROCK = '#7d8794', SNOW = '#f6fbff';
const MAX_PEAK = 0.075; // the tallest peak's height in globe radii at scale 1 (the old dots were 0.012 across)

/**
 * The shape of one mountain: a seven-sided cone with slightly uneven, faceted sides, 1 tall and 0.6 across,
 * base at y = 0. Plain triangles (no index) so every facet is lit flat. 42 triangles, so thousands stay cheap.
 */
function mountainGeo() {
  const hash = (x) => { const v = Math.sin(x * 127.1) * 43758.5453; return v - Math.floor(v); };
  let g = new THREE.ConeGeometry(0.3, 1, 7, 3, true);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.98) continue;                                         // keep the summit sharp
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + 0.3 * (hash(1 + Math.round(ang * 10) * 3.1 + Math.round(y * 9)) - 0.5); // ragged ridges
    pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/**
 * One InstancedMesh for many peaks. Each is a small 3D mountain standing straight out from the centre of the Earth
 * (owner, 2026-11-24): a real object on the globe, lit with it and seen from the angle the viewer really looks at it,
 * so a mountain near the middle of the globe is seen from above and one near the edge from the side. It is drawn at
 * its real depth, with the globe's own surface hiding what is behind it, so a nearer mountain covers a farther one.
 * Height and base both grow with the vertical drop, so a big mountain still reads as big when seen from above.
 * Per peak the instance matrix holds: [0][1] a turn so neighbours differ, [1][1] the height (0-1), [3] the spot on the globe.
 */
function makePeaks(list, order = 11) {
  const geo = mountainGeo();
  const mat = new THREE.ShaderMaterial({
    transparent: true,               // drawn in the last pass (see the globe's constructor); fully opaque all the same
    uniforms: { uScale: { value: 1 }, uMax: { value: MAX_PEAK }, uSnow: { value: new THREE.Color(SNOW) } },
    vertexShader: `
      uniform float uScale, uMax;
      varying vec3 vCol; varying float vLight, vY, vAng, vH;
      void main() {
        vec3 anchor = instanceMatrix[3].xyz;
        float h = instanceMatrix[1][1], yaw = instanceMatrix[0][1];
        // the mountain's own axes on the globe: Y straight up from the Earth's centre, X east, Z north
        vec3 Y = normalize(anchor);
        vec3 X = normalize(cross(vec3(0.0, 1.0, 0.0), Y) + vec3(1e-5, 0.0, 0.0)), Z = cross(X, Y);
        float c = cos(yaw), sn = sin(yaw);
        vec3 p = vec3(c * position.x + sn * position.z, position.y, -sn * position.x + c * position.z);
        vec3 nr = vec3(c * normal.x + sn * normal.z, normal.y, -sn * normal.x + c * normal.z);
        vec3 sc = vec3(0.45 + 0.75 * h, h, 0.45 + 0.75 * h);         // a bigger drop: taller and broader
        p *= sc; nr = normalize(nr / sc);
        // shrink away toward the edge and on the far side of the globe (the globe does not hide them: see the constructor)
        vec4 a = modelViewMatrix * vec4(anchor, 1.0);
        float s = uScale * smoothstep(0.0, 0.12, dot(normalize(normalMatrix * Y), normalize(-a.xyz)));
        vec3 w = Y + (X * p.x + Y * p.y + Z * p.z) * uMax * s;   // foot on the true surface
        vec3 n = normalize(normalMatrix * (X * nr.x + Y * nr.y + Z * nr.z));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
        vCol = instanceColor;
        vLight = 0.42 + 0.75 * max(0.0, dot(n, normalize(vec3(-0.5, 0.65, 0.55))));
        vY = position.y; vAng = atan(position.z, position.x); vH = h;
      }`,
    fragmentShader: `
      uniform vec3 uSnow;
      varying vec3 vCol; varying float vLight, vY, vAng, vH;
      void main() {
        // a ragged snow line; taller peaks carry more snow
        float line = 1.0 - (0.3 + 0.22 * vH) + 0.05 * sin(vAng * 3.0);
        vec3 col = mix(vCol, uSnow, step(line, vY));
        gl_FragColor = vec4(col * vLight, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  mesh.count = list.length;
  mesh.frustumCulled = false;       // the shader places the peaks; the mesh's own bounds mean nothing
  mesh.renderOrder = order;
  const col = new THREE.Color();
  list.forEach((p, i) => { setPeak(mesh, i, p); mesh.setColorAt(i, col.set(p.color)); });
  if (!list.length) mesh.setColorAt(0, col.set(ROCK));
  return mesh;
}

function setPeak(mesh, i, { at, h }) {
  const m = new THREE.Matrix4(), e = m.elements;
  e.fill(0);
  e[1] = ((Math.sin(i * 12.9898 + at.x * 78.233) * 43758.5453) % 1) * Math.PI; // a turn that differs from peak to peak
  e[5] = h; e[12] = at.x; e[13] = at.y; e[14] = at.z; e[15] = 1;
  mesh.setMatrixAt(i, m);
}

// tap-to-zoom: each tap brings the camera this much closer, down to ~220 km up; TILT: how far (radians) the camera
// tilts to look across the ground once zoomed in
const MIN_DIST = 1.035, ZOOM_STEP = 0.36, TILT = 0.75;
const PEAK_MIN = (1.2 - 0.995) / 2.4;    // the peaks' smallest size: what they have at 0.2 radii (~1,300 km) up
const CARD_DIST = 1.6, CARD_LIFT = 0.13, SURFACE_DIST = 1.00012; // 1.00012 radii = ~750 m above the ground

export class Globe {
  constructor(container, meta, bin, resorts) {
    this.el = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
    this.home = 3.9; this.dist = 3.9; this.homeLift = 0.115; this.lift = this.homeLift; this.unlit = 0;
    const hemi = (this.hemi = new THREE.HemisphereLight('#ffffff', '#20304a', 1.5));
    this.scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#ffffff', 1.6));
    sun.position.set(-1.5, 1.2, 2.5);
    this.scene.add(sun);

    const g = (this.globe = new THREE.Group());
    // 4096 px wide where the phone supports it, so the coast stays sharp when zoomed to a resort
    this.canvas = drawEarth(layer(meta, bin, 'land'), meta.water ? layer(meta, bin, 'water') : [], r.capabilities.maxTextureSize >= 4096 ? 4096 : 2048);
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy());
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 56, 36), (this.mat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0 }))));
    // Coastlines and borders are also real lines on the sphere (not only part of the picture
    // wrapped around it), so their edge stays sharp however far you zoom in. Around the resorts that have
    // maps they come from the most detailed 1:10m data.
    const lines = (names, color, opacity) => {
      const pos = [];
      for (const name of names) for (const l of layer(meta, bin, name)) {
        let prev = null;
        for (let i = 0; i < l.length; i += 2) {
          const p = ll(l[i + 1], l[i], 1.0007);
          if (prev && Math.abs(l[i] - l[i - 2]) < 90) pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
          prev = p;
        }
      }
      // plain hairlines: tens of thousands of them cost almost nothing to draw
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      line.frustumCulled = false;
      g.add(line);
    };
    lines(['states'], '#12303f', 0.35);
    lines(['borders', 'hiBorders'], '#12303f', 0.6);
    lines(['coast', 'hiCoast'], '#ffffff', 1);
    // soft atmosphere rim
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 40, 24), new THREE.MeshBasicMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.13, side: THREE.BackSide })));
    // Each resort is a little snow-capped peak standing on the globe; its height shows the vertical drop.
    // Mountains with a map are teal; mountains not added yet (coming soon, and the Forecast-only ones) are muted slate.
    this.pins = resorts.filter((rs) => rs.available).map((rs) => ({ rs, at: ll(rs.lat, rs.lon, 1), h: peakHeight(dropOf(rs)), visible: true }));
    this.peaks = makePeaks(this.pins.map((p) => ({ at: p.at, h: p.h, color: ROCK })));
    // The globe is a ball of flat facets, which dip up to ~10 km below the true surface: zoomed in, a facet hid the small
    // mountains standing on it. So the mountains are drawn last of all (in the see-through pass, after the globe and its
    // outlines) and the depth is cleared just before them; mountains on the far side are already hidden by their shader.
    const clear = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true }));
    clear.frustumCulled = false; clear.renderOrder = 10;
    clear.onBeforeRender = (renderer) => renderer.clearDepth();
    g.add(clear, this.peaks);
    this.peakScale = 1;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true }));
    this.ring.visible = false;
    g.add(this.ring);
    // "You are here": a white-rimmed blue dot with a soft pulsing halo, shown once the phone shares its location
    this.me = new THREE.Group();
    this.me.add(new THREE.Mesh(new THREE.CircleGeometry(0.016, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })));
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.0115, 28), new THREE.MeshBasicMaterial({ color: '#1e88ff', side: THREE.DoubleSide }));
    core.position.z = 0.0004;
    this.me.add(core);
    this.meHalo = new THREE.Mesh(new THREE.CircleGeometry(0.03, 32), new THREE.MeshBasicMaterial({ color: '#1e88ff', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    this.meHalo.position.z = -0.0002;
    this.me.add(this.meHalo);
    // drawn over the peaks; hidden in loop() while on the far side of the globe
    this.me.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; o.renderOrder = 12; } }); // drawn after the mountains
    this.me.visible = false;
    g.add(this.me);
    g.rotation.order = 'XYZ';
    g.rotation.set(0.42, 1.9, 0);
    this.scene.add(g);

    this.spin = true; this.tween = null; this.t = 0; this.last = performance.now(); this.alive = true;
    this.bindDrag();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.loop();
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // At rest the globe fills the free space between the title and the resort list (setFrame);
    // until that is known it sits at about 27% of the screen height, centred 30% down.
    const f = this.frame ? this.frameFit(w, h) : { s: 0.27, c: 0.3 };
    const vis = 2 * Math.tan(THREE.MathUtils.degToRad(19));
    const home = Math.max(1.6, 1 / Math.sin(Math.atan((f.s * vis) / 2)));
    const homeLift = ((0.5 - f.c) * vis * home) / (home - 1);
    if (this.dist === this.home && !this.tween) { this.dist = home; this.lift = homeLift; }
    this.home = home; this.homeLift = homeLift;
    this.camera.updateProjectionMatrix();
  }

  /** Fit the resting globe between two screen heights (px from the top of the globe's box). */
  frameFit(w, h) {
    const { top, bottom } = this.frame;
    const d = Math.max(60, Math.min((bottom - top) * 0.94, w * 0.9));
    return { s: d / h, c: (top + bottom) / 2 / h };
  }

  /** Called when the title or the resort list moves; glides to the new size when animate is set. */
  setFrame(top, bottom, animate = false) {
    this.frame = { top, bottom };
    const atHome = !this.focused && Math.abs(this.dist - this.home) < 1e-3 && !this.tween;
    const was = { d: this.home, l: this.homeLift };
    this.resize();
    if (!atHome || this.focused) return;
    if (animate) { this.dist = was.d; this.lift = was.l; this.go({ d: this.home, l: this.homeLift }, 0.45).then(() => { if (!this.focused) this.spin = true; }); this.spin = true; }
    else { this.dist = this.home; this.lift = this.homeLift; }
  }

  bindDrag() {
    const el = this.renderer.domElement;
    let last = null, down = null, pinch = null;
    const fingers = new Map();
    const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    el.addEventListener('pointerdown', (e) => {
      if (this.focused) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      this.spin = false; this.tween = null;
      if (fingers.size === 2) { pinch = { s: spread(), d: this.dist }; last = null; down = null; return; }
      if (fingers.size > 2) return;
      last = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && fingers.size === 2) {
        // two fingers: spread them to zoom in, pinch them to zoom out
        const d = Math.min(this.home, Math.max(MIN_DIST, 1 + (pinch.d - 1) * (pinch.s / Math.max(10, spread()))));
        this.dist = d;
        if (d > this.home - 0.02) { this.lift = this.homeLift; if (this.zoomed) { this.zoomed = false; this.onZoom?.(false); } }
        else {
          // ease the globe from its resting place to the zoomed-in framing as it comes closer
          const k = (this.home - d) / (this.home - 1);
          this.lift = this.homeLift + (this.zoomLift() - this.homeLift) * Math.min(1, k * 3);
          if (!this.zoomed) { this.zoomed = true; this.onZoom?.(true); }
        }
        return;
      }
      if (!last) return;
      // the closer in, the slower the globe turns under the finger
      const k = 0.005 * Math.min(1.5, (this.dist - 1) / (this.home - 1));
      this.globe.rotation.y += (e.clientX - last.x) * k;
      this.globe.rotation.x = Math.min(1.3, Math.max(-1.3, this.globe.rotation.x + (e.clientY - last.y) * k));
      if (down) down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
      last = { x: e.clientX, y: e.clientY };
    });
    const up = (e) => {
      fingers.delete(e.pointerId);
      if (pinch) { if (fingers.size === 0) pinch = null; last = null; down = null; }
      const tap = down && e.type === 'pointerup' && down.moved < 10 && performance.now() - down.t < 500;
      last = null; down = null;
      clearTimeout(this.resume);
      if (tap) this.tap(e.clientX, e.clientY);
      this.resume = setTimeout(() => { if (!this.focused && !this.zoomed) this.spin = true; }, 2500);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    // a mouse wheel or trackpad zooms too (on a computer)
    el.addEventListener('wheel', (e) => {
      if (this.focused) return;
      e.preventDefault();
      if (e.deltaY > 0) this.zoomOut(); else { const r = el.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top); }
    }, { passive: false });
    el.style.touchAction = 'none';
  }

  /**
   * A tap on the globe: on a resort dot (with no other dot close enough to be the one meant) it picks
   * that resort; anywhere else on the globe it zooms in on that spot; off the globe it zooms back out.
   */
  tap(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    // a tap on a mountain's drawn shape opens that mountain's card (the one in front where shapes overlap)
    const hit = this.peakAt(x, y);
    if (hit) { this.onPick?.(hit); return; }
    const near = this.pinsNear(x, y);
    const hitR = 24, clearR = 30;
    if (near.length && near[0].px < hitR && (near.length < 2 || near[1].px > clearR || this.dist <= MIN_DIST + 0.01)) {
      this.onPick?.(near[0].rs);
      return;
    }
    // the page can claim the first tap (the home screen uses it to slide the mountain list down so the globe fills the screen)
    if (this.onTap?.()) return;
    if (!this.zoomAt(x, y)) this.zoomOut();
  }

  /**
   * The mountain drawn under a screen point, or null. The graphics card draws just the mountains for a small square
   * around the point, each in its own hidden colour, and reads back which one is drawn there: exactly the one the person
   * sees on top, however they overlap. A finger is not a pixel, so the nearest mountain within the square counts.
   * On the whole globe (not zoomed in), two or more mountains within 6 px of the finger are a crowd: no pick, the tap zooms in.
   */
  peakAt(x, y) {
    const R = 9, N = 2 * R + 1, el = this.renderer.domElement, r = this.renderer;
    if (!this.pickMat) {
      this.pickRT = new THREE.WebGLRenderTarget(N, N);
      this.pickBuf = new Uint8Array(N * N * 4);
      this.pickMat = new THREE.ShaderMaterial({
        uniforms: this.peaks.material.uniforms,
        vertexShader: this.peaks.material.vertexShader.replace('void main() {', 'flat out int vId;\n      void main() {\n        vId = gl_InstanceID;'),
        fragmentShader: `flat in int vId;
          void main() { int i = vId + 1; gl_FragColor = vec4(float(i % 256), float((i / 256) % 256), 0.0, 255.0) / 255.0; }`,
      });
    }
    const cam = this.camera, mat = this.peaks.material, clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
    this.globe.updateMatrixWorld();
    cam.setViewOffset(el.clientWidth, el.clientHeight, x - R, y - R, N, N);
    this.peaks.material = this.pickMat;
    r.setRenderTarget(this.pickRT);
    r.setClearColor(0x000000, 0); r.clear();
    r.render(this.peaks, cam);
    r.readRenderTargetPixels(this.pickRT, 0, 0, N, N, this.pickBuf);
    r.setRenderTarget(null); r.setClearColor(clear, alpha);
    this.peaks.material = mat;
    cam.clearViewOffset();
    let best = -1, bestD = Infinity;
    const seen = new Set();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4, id = this.pickBuf[k] + this.pickBuf[k + 1] * 256 - 1;
      if (id < 0) continue;
      const d = Math.hypot(i - R, j - R);
      if (d <= 6) seen.add(id);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (best < 0) return null;
    if (seen.size > 1 && this.dist > 2.2) return null;      // a crowd seen on the whole globe: zoom in first
    return this.pins[best]?.rs ?? null;
  }

  /** Resort peaks on the visible side of the globe, nearest to a screen point first, with their distance in px. */
  pinsNear(x, y) {
    const w = this.renderer.domElement.clientWidth, h0 = this.renderer.domElement.clientHeight;
    const cam = this.camera.position, out = [], v = new THREE.Vector3();
    this.globe.updateMatrixWorld();
    const lift = MAX_PEAK * this.peakScale * 0.45;
    for (const { rs, at, h, visible } of this.pins) {
      if (!visible) continue;
      v.copy(at).applyMatrix4(this.globe.matrixWorld);
      // behind the globe: the mountain faces away from the camera
      if (v.clone().normalize().dot(cam.clone().sub(v)) <= 0) continue;
      v.addScaledVector(v.clone().normalize(), lift * h); // aim at the middle of the peak, which stands straight out from the Earth
      v.project(this.camera);
      out.push({ rs, px: Math.hypot((v.x + 1) / 2 * w - x, (1 - v.y) / 2 * h0 - y) });
    }
    return out.sort((a, b) => a.px - b.px);
  }

  /** Zoom in one step, turning the tapped spot to the middle. False when the point is off the globe. */
  zoomAt(x, y) {
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), this.camera);
    const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    if (!hit) return false;
    this.globe.updateMatrixWorld();
    const p = this.globe.worldToLocal(hit).normalize();
    const lat = THREE.MathUtils.radToDeg(Math.asin(p.y)), lon = THREE.MathUtils.radToDeg(Math.atan2(p.z, -p.x)) - 180;
    const a = this.aim({ lat, lon });
    let dy = a.y - this.globe.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const d = Math.max(MIN_DIST, 1 + (this.dist - 1) * ZOOM_STEP);
    this.spin = false; this.zoomed = true; this.onZoom?.(true);
    this.go({ y: this.globe.rotation.y + dy, x: Math.min(1.3, Math.max(-1.3, a.x)), d, l: this.zoomLift() }, 0.7, { zoom: true });
    return true;
  }

  /** The lift that puts the spot facing the camera where the resting globe's centre is on screen. */
  zoomLift() { return (this.homeLift * (this.home - 1)) / this.home; }

  /** Back out to the whole globe, which then spins again. */
  zoomOut() {
    if (!this.zoomed) return;
    this.zoomed = false; this.onZoom?.(false);
    this.go({ d: this.home, l: this.homeLift }, 0.9, { zoom: true }).then(() => { if (!this.focused && !this.zoomed) this.spin = true; });
  }

  /** Show (or with null, hide) the viewer's own position on the globe. */
  setMe(lat, lon) {
    if (lat == null) { this.me.visible = false; return; }
    this.me.position.copy(ll(lat, lon, 1.005));
    // lay it flat on the sphere, facing straight out
    this.me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.me.position.clone().normalize());
    this.me.visible = true;
  }

  aim(rs) {
    return { y: Math.PI / 2 - THREE.MathUtils.degToRad(rs.lon + 180), x: THREE.MathUtils.degToRad(rs.lat) };
  }

  go(to, dur, extra = {}) {
    const g = this.globe;
    return new Promise((resolve) => {
      this.tween = { t: 0, dur, y0: g.rotation.y, x0: g.rotation.x, d0: this.dist, l0: this.lift, u0: this.unlit,
        y1: to.y ?? g.rotation.y, x1: to.x ?? g.rotation.x, d1: to.d ?? this.dist, l1: to.l ?? this.lift, u1: to.u ?? this.unlit, resolve, ...extra };
    });
  }

  /** Turn the globe so the resort faces the camera and zoom in. Resolves when it arrives. */
  flyTo(rs, seconds = 1.8, lift = CARD_LIFT) {
    this.spin = false; this.focused = rs;
    // picked while zoomed in: stay at least that close, and come back to it when the card is closed
    this.backTo = this.zoomed ? this.dist : null;
    if (this.zoomed) { this.zoomed = false; this.onZoom?.(false); }
    clearTimeout(this.resume);
    const a = this.aim(rs);
    let dy = a.y - this.globe.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)); // shortest way round
    this.ring.position.copy(ll(rs.lat, rs.lon, 1.0003)); // on the ground, around the mountain's foot (the globe's facets lie below r = 1)
    // lay the ring flat on the sphere: its face normal (+Z) points straight out from the surface
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.ring.position.clone().normalize());
    this.ring.visible = true;
    // CARD_LIFT puts the resort about a third of the way down, above the resort card
    return this.go({ y: this.globe.rotation.y + dy, x: a.x, d: Math.min(CARD_DIST, this.dist), l: lift }, seconds, this.backTo ? { zoom: true } : {});
  }

  /** Back to the slow spin (after closing a resort card). */
  release() {
    this.focused = null; this.ring.visible = false; this.diving = false;
    if (this.backTo) {
      const d = this.backTo; this.backTo = null; this.zoomed = true; this.onZoom?.(true);
      this.go({ d, l: this.zoomLift() }, 0.9, { zoom: true });
      return;
    }
    this.go({ d: this.home, l: this.homeLift }, 1.4).then(() => { this.spin = true; });
  }

  /**
   * Zoom all the way down to the resort until the land colour under it fills the screen.
   * Lighting fades out on the way so that final colour is exactly colorAt(rs), which the
   * 3D map then starts from: the hand-off has no cut and no fade.
   */
  dive(seconds = 2.2) {
    this.ring.visible = false; this.diving = true;
    return this.go({ d: SURFACE_DIST, l: 0, u: 1 }, seconds, { zoom: true, ease: 'in' });
  }

  /** Start on the ground at a resort (used when leaving the mountain), then pull back to the spinning globe. */
  surface(rs) {
    const a = this.aim(rs);
    this.spin = false; this.tween = null; this.focused = null; this.diving = false; this.zoomed = false; this.backTo = null;
    this.globe.rotation.set(a.x, a.y, 0);
    this.dist = SURFACE_DIST; this.lift = 0; this.unlit = 1;
  }

  rise(seconds = 2.6) {
    // pull straight back from the resort (no drift), then let the globe resume its spin
    return this.go({ d: this.home, l: this.homeLift, u: 0 }, seconds, { zoom: true, ease: 'out' }).then(() => { this.spin = true; });
  }

  /** The exact on-screen colour of the globe at a resort once fully zoomed in (bilinear texel mix). */
  colorAt(rs) {
    const c = this.canvas, W = c.width, H = c.height, x = c.getContext('2d');
    const fx = ((rs.lon + 180) / 360) * W - 0.5, fy = ((90 - rs.lat) / 180) * H - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const d = x.getImageData(i, j, 2, 2).data, out = [0, 0, 0];
    // the GPU blends texels in linear light, so do the same here
    const lin = (s) => { s /= 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    const w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    for (let k = 0; k < 4; k++) for (let ch = 0; ch < 3; ch++) out[ch] += lin(d[k * 4 + ch]) * w[k];
    return new THREE.Color(out[0], out[1], out[2]);
  }

  /** Stop drawing while the globe is covered (the mountain list pulled up to fill the screen), to save battery. */
  setPaused(on) {
    this.paused = !!on;
    if (!this.paused && this.alive && !this.running) { this.last = performance.now(); this.loop(); }
  }

  loop() {
    if (!this.alive || this.paused) { this.running = false; return; }
    this.running = true;
    requestAnimationFrame(() => this.loop());
    const now = performance.now(), dt = Math.min(0.12, (now - this.last) / 1000);
    this.last = now; this.t += dt;
    const g = this.globe;
    // never spins while zoomed in or showing a resort, whatever asked it to
    if (this.spin && !this.zoomed && !this.focused) { g.rotation.y += dt * 0.085; g.rotation.x += (0.42 - g.rotation.x) * Math.min(1, dt * 0.6); } // drifts back to its resting tilt
    const tw = this.tween;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const x = tw.t;
      const k = tw.ease === 'in' ? x * x * (3 - 2 * x) : tw.ease === 'out' ? x * x * (3 - 2 * x) : x < 0.5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2;
      g.rotation.y = tw.y0 + (tw.y1 - tw.y0) * k;
      g.rotation.x = tw.x0 + (tw.x1 - tw.x0) * k;
      // "zoom" tweens move at a constant zoom rate (equal steps in log altitude), like a camera zoom
      this.dist = tw.zoom ? 1 + Math.exp(Math.log(tw.d0 - 1) + (Math.log(tw.d1 - 1) - Math.log(tw.d0 - 1)) * k) : tw.d0 + (tw.d1 - tw.d0) * k;
      this.lift = tw.l0 + (tw.l1 - tw.l0) * k;
      // lighting only matters close to the ground, so swap it over the last / first third of the zoom
      const uk = tw.u1 > tw.u0 ? Math.max(0, (k - 0.6) / 0.4) : Math.min(1, k / 0.4);
      this.unlit = tw.u0 + (tw.u1 - tw.u0) * uk;
      if (tw.t >= 1) { this.tween = null; this.dist = tw.d1; this.unlit = tw.u1; tw.resolve(); }
    }
    this.mat.emissiveIntensity = this.unlit;
    this.hemi.intensity = 1.5 * (1 - this.unlit);
    this.sun.intensity = 1.6 * (1 - this.unlit);
    if (this.ring.visible) { const s = 1 + 0.35 * Math.sin(this.t * 3); this.ring.scale.setScalar(s * Math.max(0.03, this.dist - 0.98)); this.ring.material.opacity = 0.9 - 0.3 * Math.sin(this.t * 3); }
    // resort dots shrink away before the camera reaches them
    let ps = Math.min(1, Math.max(0, (this.dist - 1.25) / 0.4)) * Math.min(2.6, Math.max(0.35, (this.dist - 0.95) / 2.4));
    // zoomed in by tapping (or flying to a resort card from there): the dots stay about the same size on screen
    // (owner, 2026-11-24) closer in than about 1,300 km up they stop shrinking: PEAK_MIN keeps them clearly visible
    if (this.zoomed || (this.focused && this.dist < 1.6 && !this.diving)) ps = Math.min(2.6, Math.max(PEAK_MIN, (this.dist - 0.995) / 2.4));
    this.peakScale = ps;
    const shown = ps > 0.001;
    for (const p of this.pins) p.visible = shown;
    this.peaks.visible = shown;
    this.peaks.material.uniforms.uScale.value = ps;
    if (this.me.visible) {
      this.globe.updateMatrixWorld();
      const mw = this.me.getWorldPosition(new THREE.Vector3());
      const facing = mw.clone().normalize().dot(this.camera.position.clone().sub(mw)) > 0;
      const show = ps > 0.001 && !this.diving && facing;
      this.me.children.forEach((c) => (c.visible = show));
      this.me.scale.setScalar(Math.max(0.001, ps));
      const k = (this.t * 0.8) % 1;
      this.meHalo.scale.setScalar(0.6 + k * 0.9); this.meHalo.material.opacity = 0.35 * (1 - k);
    }
    const d = this.dist;
    this.camera.near = Math.max(0.00002, (d - 1) * 0.4);
    this.camera.updateProjectionMatrix();
    // `lift` slides the globe up the screen so the list / resort card has room underneath
    const L = this.lift * (d - 1);
    this.camera.position.set(0, -L, d);
    this.camera.lookAt(0, -L, 0);
    // Zoomed in by tapping, the camera tilts to look across the ground from the south, as a 3D map does, so the
    // mountains (which stand straight out from the Earth) show their height instead of being seen from straight above.
    // It turns about the spot in the middle of the screen, which stays where it was. Eased, so zooming never jumps.
    const want = (this.zoomed || this.focused) && !this.diving ? TILT * Math.min(1, Math.max(0, (1.6 - d) / 0.45)) : 0;
    this.tilt = (this.tilt ?? 0) + (want - (this.tilt ?? 0)) * Math.min(1, dt * 6);
    if (this.tilt > 0.002 && Math.abs(L) < 1) {
      const pz = Math.sqrt(1 - L * L), r = d - pz;               // the spot under the middle of the screen, and how far off
      this.camera.position.set(0, -L - Math.sin(this.tilt) * r, pz + Math.cos(this.tilt) * r);
      this.camera.lookAt(0, -L, pz);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.alive = false;
    this.ro.disconnect();
    this.scene.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}

/** Equirectangular earth: flat ocean, land shaded from temperate green to polar white (fill only; the outlines are drawn as lines). */
function drawEarth(land, water, W = 2048) {
  const H = W / 2, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const sea = x.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#16467a'); sea.addColorStop(0.5, '#1b5c9c'); sea.addColorStop(1, '#16467a');
  x.fillStyle = sea; x.fillRect(0, 0, W, H);
  const fill = x.createLinearGradient(0, 0, 0, H);
  for (const [stop, col] of [[0, '#f4f8fb'], [0.14, '#e9f1f3'], [0.24, '#7fb08c'], [0.36, '#5fa06f'], [0.5, '#8fb46a'], [0.64, '#5fa06f'], [0.8, '#9cbf9f'], [0.9, '#f4f8fb'], [1, '#f4f8fb']]) fill.addColorStop(stop, col);
  x.fillStyle = fill; x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = W / 1500; x.lineJoin = 'round';
  for (const ring of land) {
    // Rings that cross the date line are unwrapped into continuous longitudes and drawn at
    // -360, 0 and +360 degrees (the canvas clips the copies), so nothing streaks across the map.
    let lo = 180, hi = -180, south = 90, wraps = false;
    for (let i = 0; i < ring.length; i += 2) {
      lo = Math.min(lo, ring[i]); hi = Math.max(hi, ring[i]); south = Math.min(south, ring[i + 1]);
      if (i && Math.abs(ring[i] - ring[i - 2]) > 180) wraps = true;
    }
    for (const shift of wraps ? [-360, 0, 360] : [0]) {
      x.beginPath();
      let lon = ring[0];
      for (let i = 0; i < ring.length; i += 2) {
        if (i) { let d = ring[i] - ring[i - 2]; if (d > 180) d -= 360; else if (d < -180) d += 360; lon += d; }
        const px = ((lon + shift + 180) / 360) * W, py = ((90 - ring[i + 1]) / 180) * H;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.closePath(); x.fill();
      // a soft outline baked into the picture gives the coast some weight from far away; the hairline on top keeps it sharp up close
      if (!(hi - lo > 300 && south < -60)) x.stroke();
    }
    // Antarctica's outline stops a few degrees short of the pole (the source data is clipped
    // there), which would leave a hole at the bottom of the globe: fill the polar cap below it.
    if (hi - lo > 300 && south < -60) { const y = ((90 - (south + 2.5)) / 180) * H; x.fillRect(0, y, W, H - y); }
  }
  // inland seas (the Caspian) are holes in the land outline: paint them back as water
  x.fillStyle = sea;
  for (const ring of water) {
    x.beginPath();
    for (let i = 0; i < ring.length; i += 2) {
      const px = ((ring[i] + 180) / 360) * W, py = ((90 - ring[i + 1]) / 180) * H;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath(); x.fill(); x.stroke();
  }
  return c;
}
