// Start-screen globe: a single low-poly sphere with a canvas-drawn texture (Natural Earth
// land outlines), slowly spinning. Picking a resort turns the globe to it and zooms in.
import * as THREE from 'three';

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
    this.pins = [];
    for (const rs of resorts) {
      const pin = new THREE.Mesh(new THREE.SphereGeometry(rs.available ? 0.012 : 0.007, 10, 8), new THREE.MeshBasicMaterial({ color: rs.available ? '#3ee6c4' : '#ff9f2e' }));
      pin.position.copy(ll(rs.lat, rs.lon, 1.004));
      g.add(pin);
      this.pins.push({ rs, pin });
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true }));
    this.ring.visible = false;
    g.add(this.ring);
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
    let last = null;
    el.addEventListener('pointerdown', (e) => { if (this.focused) return; last = { x: e.clientX, y: e.clientY }; this.spin = false; this.tween = null; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const k = 0.005 * Math.min(1.5, this.dist / this.home);
      this.globe.rotation.y += (e.clientX - last.x) * k;
      this.globe.rotation.x = Math.min(1.3, Math.max(-1.3, this.globe.rotation.x + (e.clientY - last.y) * k));
      last = { x: e.clientX, y: e.clientY };
    });
    const up = () => { last = null; clearTimeout(this.resume); this.resume = setTimeout(() => { if (!this.focused) this.spin = true; }, 2500); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.style.touchAction = 'none';
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
  flyTo(rs, seconds = 1.8) {
    this.spin = false; this.focused = rs;
    clearTimeout(this.resume);
    const a = this.aim(rs);
    let dy = a.y - this.globe.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)); // shortest way round
    this.ring.position.copy(ll(rs.lat, rs.lon, 1.006));
    // lay the ring flat on the sphere: its face normal (+Z) points straight out from the surface
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.ring.position.clone().normalize());
    this.ring.visible = true;
    // CARD_LIFT puts the resort about a third of the way down, above the resort card
    return this.go({ y: this.globe.rotation.y + dy, x: a.x, d: CARD_DIST, l: CARD_LIFT }, seconds);
  }

  /** Back to the slow spin (after closing a resort card). */
  release() {
    this.focused = null; this.ring.visible = false;
    this.go({ d: this.home, l: this.homeLift }, 1.4).then(() => { this.spin = true; });
  }

  /**
   * Zoom all the way down to the resort until the land colour under it fills the screen.
   * Lighting fades out on the way so that final colour is exactly colorAt(rs), which the
   * 3D map then starts from: the hand-off has no cut and no fade.
   */
  dive(seconds = 2.2) {
    this.ring.visible = false;
    return this.go({ d: SURFACE_DIST, l: 0, u: 1 }, seconds, { zoom: true, ease: 'in' });
  }

  /** Start on the ground at a resort (used when leaving the mountain), then pull back to the spinning globe. */
  surface(rs) {
    const a = this.aim(rs);
    this.spin = false; this.tween = null; this.focused = null;
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

  loop() {
    if (!this.alive) return;
    requestAnimationFrame(() => this.loop());
    const now = performance.now(), dt = Math.min(0.12, (now - this.last) / 1000);
    this.last = now; this.t += dt;
    const g = this.globe;
    if (this.spin) { g.rotation.y += dt * 0.085; g.rotation.x += (0.42 - g.rotation.x) * Math.min(1, dt * 0.6); } // drifts back to its resting tilt
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
    if (this.ring.visible) { const s = 1 + 0.35 * Math.sin(this.t * 3); this.ring.scale.setScalar(s * Math.max(0.5, this.dist - 0.9)); this.ring.material.opacity = 0.9 - 0.3 * Math.sin(this.t * 3); }
    // resort dots shrink away before the camera reaches them
    const ps = Math.min(1, Math.max(0, (this.dist - 1.25) / 0.4)) * Math.min(2.6, Math.max(0.35, (this.dist - 0.95) / 2.4));
    for (const p of this.pins) { p.pin.visible = ps > 0.001; p.pin.scale.setScalar(ps || 0.001); }
    const d = this.dist;
    this.camera.near = Math.max(0.00002, (d - 1) * 0.4);
    this.camera.updateProjectionMatrix();
    // `lift` slides the globe up the screen so the list / resort card has room underneath
    this.camera.position.set(0, -this.lift * (d - 1), d);
    this.camera.lookAt(0, -this.lift * (d - 1), 0);
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
