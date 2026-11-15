// A light cloud layer for flying between the globe and the mountain. Soft puffs stream past
// the camera on a 2D canvas; at full cover the screen is solid cloud, which is where the
// globe and the 3D map swap. Runs only during a transition.
export class Clouds {
  constructor(canvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.cover = 0;      // 0 = clear sky, 1 = inside the cloud
    this.dir = 1;        // +1 flying down through the clouds, -1 climbing back up
    this.puffs = [];
    this.on = false;
    // one soft puff, drawn once and stamped many times
    const s = (this.sprite = document.createElement('canvas'));
    s.width = s.height = 256;
    const g = s.getContext('2d'), grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.45, 'rgba(250,252,255,0.55)'); grad.addColorStop(1, 'rgba(245,249,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    let seed = 11;
    this.rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 34; i++) this.puffs.push({ a: this.rnd() * 6.283, z: this.rnd(), r: 0.25 + this.rnd() * 0.75, w: 0.7 + this.rnd() * 0.9 });
  }

  start(dir) {
    this.dir = dir;
    if (this.on) return;
    this.on = true;
    this.c.classList.remove('hidden');
    const w = this.c.clientWidth, h = this.c.clientHeight;
    this.c.width = Math.round(w * 0.6); this.c.height = Math.round(h * 0.6);   // soft shapes: low resolution is plenty
    this.last = performance.now();
    const loop = (now) => {
      if (!this.on) return;
      requestAnimationFrame(loop);
      this.draw(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
    };
    requestAnimationFrame(loop);
  }

  stop() { this.on = false; this.cover = 0; this.c.classList.add('hidden'); }

  draw(dt) {
    const x = this.x, W = this.c.width, H = this.c.height, R = Math.hypot(W, H) / 2, cv = this.cover;
    x.clearRect(0, 0, W, H);
    if (cv <= 0.001) return;
    // solid white underlay near full cover guarantees nothing shows through at the swap
    const solid = Math.max(0, (cv - 0.55) / 0.45);
    if (solid > 0) { x.globalAlpha = solid * solid * (3 - 2 * solid); x.fillStyle = '#f6f9fd'; x.fillRect(0, 0, W, H); }
    for (const p of this.puffs) {
      // z runs 0 (far, small, centre) -> 1 (passing the camera, huge, off the edge)
      p.z += this.dir * dt * 0.55 * p.w;
      if (p.z > 1) { p.z -= 1; p.a = this.rnd() * 6.283; } else if (p.z < 0) { p.z += 1; p.a = this.rnd() * 6.283; }
      const k = p.z * p.z, d = R * (0.08 + 1.25 * k) * p.r, size = R * (0.5 + 2.6 * k);
      x.globalAlpha = Math.min(1, cv * 1.5) * Math.min(1, p.z * 4) * (1 - Math.max(0, (p.z - 0.8) / 0.2));
      x.drawImage(this.sprite, W / 2 + Math.cos(p.a) * d - size / 2, H / 2 + Math.sin(p.a) * d * 1.25 - size / 2, size, size);
    }
    x.globalAlpha = 1;
  }

  /** Animate cover from its current value to `to` over `seconds`. */
  to(to, seconds) {
    const from = this.cover, t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / (seconds * 1000)), e = k * k * (3 - 2 * k);
        this.cover = from + (to - from) * e;
        if (k < 1 && this.on) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
}
