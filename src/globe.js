// Start-screen globe: a single low-poly sphere with a canvas-drawn texture (Natural Earth
// land outlines), slowly spinning. Picking a resort turns the globe to it and zooms in.
import * as THREE from 'three';

const ll = (lat, lon, r = 1) => {
  const phi = THREE.MathUtils.degToRad(lon + 180), c = Math.cos(THREE.MathUtils.degToRad(lat));
  return new THREE.Vector3(-Math.cos(phi) * c * r, Math.sin(THREE.MathUtils.degToRad(lat)) * r, Math.sin(phi) * c * r);
};

export class Globe {
  constructor(container, data, resorts) {
    this.el = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
    this.dist = 3.9; this.lift = 0;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#20304a', 1.5));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-1.5, 1.2, 2.5);
    this.scene.add(sun);

    const g = (this.globe = new THREE.Group());
    // 4096 px wide where the phone supports it, so the coast stays sharp when zoomed to a resort
    const tex = new THREE.CanvasTexture(drawEarth(data, r.capabilities.maxTextureSize >= 4096 ? 4096 : 2048));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy());
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 56, 36), new THREE.MeshLambertMaterial({ map: tex })));
    // soft atmosphere rim
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 40, 24), new THREE.MeshBasicMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.13, side: THREE.BackSide })));
    this.pins = [];
    for (const rs of resorts) {
      const pin = new THREE.Mesh(new THREE.SphereGeometry(rs.available ? 0.012 : 0.007, 10, 8), new THREE.MeshBasicMaterial({ color: rs.available ? '#34e37a' : '#ffd166' }));
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
    // keep the whole globe in view on a tall phone screen
    this.fit = w / h < 1 ? 1 + (1 - w / h) * 0.75 : 1;
    this.camera.updateProjectionMatrix();
  }

  bindDrag() {
    const el = this.renderer.domElement;
    let last = null;
    el.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; this.spin = false; this.tween = null; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const k = 0.005 * Math.min(1.5, this.dist / 3.9);
      this.globe.rotation.y += (e.clientX - last.x) * k;
      this.globe.rotation.x = Math.min(1.3, Math.max(-1.3, this.globe.rotation.x + (e.clientY - last.y) * k));
      last = { x: e.clientX, y: e.clientY };
    });
    const up = () => { last = null; clearTimeout(this.resume); this.resume = setTimeout(() => { if (!this.focused) this.spin = true; }, 2500); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.style.touchAction = 'none';
  }

  /** Turn the globe so the resort faces the camera and zoom in. Resolves when it arrives. */
  flyTo(rs, dist = 1.75, seconds = 2.2) {
    this.spin = false; this.focused = rs;
    clearTimeout(this.resume);
    const g = this.globe;
    const ry = Math.PI / 2 - THREE.MathUtils.degToRad(rs.lon + 180), rx = THREE.MathUtils.degToRad(rs.lat);
    let dy = ry - g.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)); // shortest way round
    this.ring.position.copy(ll(rs.lat, rs.lon, 1.006));
    this.ring.lookAt(this.ring.position.clone().multiplyScalar(2));
    this.ring.visible = true;
    return new Promise((resolve) => {
      this.tween = { t: 0, dur: seconds, y0: g.rotation.y, y1: g.rotation.y + dy, x0: g.rotation.x, x1: rx, d0: this.dist, d1: dist, l0: this.lift, l1: 0.16, resolve };
    });
  }

  /** Back to the slow spin (after closing a resort card). */
  release() {
    this.focused = null; this.ring.visible = false;
    const g = this.globe;
    this.tween = { t: 0, dur: 1.4, y0: g.rotation.y, y1: g.rotation.y, x0: g.rotation.x, x1: 0.42, d0: this.dist, d1: 3.9, l0: this.lift, l1: 0, resolve: () => { this.spin = true; } };
  }

  /** Final dive towards the surface before the 3D map takes over. */
  dive(seconds = 1.3) {
    const g = this.globe;
    return new Promise((resolve) => {
      this.tween = { t: 0, dur: seconds, y0: g.rotation.y, y1: g.rotation.y, x0: g.rotation.x, x1: g.rotation.x, d0: this.dist, d1: 1.03, l0: this.lift, l1: 0, resolve, hard: true };
    });
  }

  loop() {
    if (!this.alive) return;
    requestAnimationFrame(() => this.loop());
    const now = performance.now(), dt = Math.min(0.12, (now - this.last) / 1000);
    this.last = now; this.t += dt;
    const g = this.globe;
    if (this.spin) g.rotation.y += dt * 0.085;
    const tw = this.tween;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.hard ? tw.t * tw.t : tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;
      g.rotation.y = tw.y0 + (tw.y1 - tw.y0) * k;
      g.rotation.x = tw.x0 + (tw.x1 - tw.x0) * k;
      this.dist = tw.d0 + (tw.d1 - tw.d0) * k;
      this.lift = tw.l0 + (tw.l1 - tw.l0) * k;
      if (tw.t >= 1) { this.tween = null; tw.resolve(); }
    }
    if (this.ring.visible) { const s = 1 + 0.35 * Math.sin(this.t * 3); this.ring.scale.setScalar(s * Math.max(0.5, this.dist - 0.9)); this.ring.material.opacity = 0.9 - 0.3 * Math.sin(this.t * 3); }
    for (const p of this.pins) p.pin.scale.setScalar(Math.max(0.35, (this.dist - 0.95) / 2.4));
    const d = 1 + (this.dist - 1) * (this.dist > 2 ? this.fit : 1 + (this.fit - 1) * (this.dist - 1));
    // `lift` slides the globe up the screen so the resort card has room underneath
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

/** Equirectangular earth: flat ocean, land shaded from temperate green to polar white. */
function drawEarth(data, W = 2048) {
  const H = W / 2, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const sea = x.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#16467a'); sea.addColorStop(0.5, '#1b5c9c'); sea.addColorStop(1, '#16467a');
  x.fillStyle = sea; x.fillRect(0, 0, W, H);
  const land = x.createLinearGradient(0, 0, 0, H);
  for (const [stop, col] of [[0, '#f4f8fb'], [0.14, '#e9f1f3'], [0.24, '#7fb08c'], [0.36, '#5fa06f'], [0.5, '#8fb46a'], [0.64, '#5fa06f'], [0.8, '#9cbf9f'], [0.9, '#f4f8fb'], [1, '#f4f8fb']]) land.addColorStop(stop, col);
  // Rings that cross the date line are unwrapped into continuous longitudes and drawn at
  // -360, 0 and +360 degrees (the canvas clips the copies), so nothing streaks across the map.
  const path = (ring, shift) => {
    x.beginPath();
    let lon = ring[0];
    for (let i = 0; i < ring.length; i += 2) {
      if (i) { let d = ring[i] - ring[i - 2]; if (d > 180) d -= 360; else if (d < -180) d += 360; lon += d; }
      const px = ((lon + shift + 180) / 360) * W, py = ((90 - ring[i + 1]) / 180) * H;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
  };
  const wraps = (ring) => { for (let i = 2; i < ring.length; i += 2) if (Math.abs(ring[i] - ring[i - 2]) > 180) return true; return false; };
  const each = (ring, fn) => { for (const s of wraps(ring) ? [-360, 0, 360] : [0]) { path(ring, s); fn(); } };
  x.fillStyle = land; x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = W / 1280; x.lineJoin = 'round';
  for (const ring of data.land) each(ring, () => { x.closePath(); x.fill(); x.stroke(); });
  x.strokeStyle = 'rgba(20,50,60,0.28)'; x.lineWidth = W / 2048;
  for (const b of data.borders) each(b, () => x.stroke());
  return c;
}
