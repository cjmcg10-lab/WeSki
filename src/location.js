// Location source: the phone's GPS, or a simulated position for testing away from the mountain.
import { pointAlong, lineLength } from './geo.js';

export class Locator {
  /** onFix({lat, lon, acc, alt, heading, speed, t, sim}), onError(message) */
  constructor(geo, onFix, onError) {
    this.geo = geo;
    this.onFix = onFix;
    this.onError = onError;
    this.watch = null;
    this.sim = false;
    this.simPos = null;   // [x, y]
    this.simPath = null;  // {pts, d, len, speed}
  }

  get active() { return this.sim || this.watch != null; }

  start() {
    if (this.sim || this.watch != null) return;
    if (!navigator.geolocation) { this.onError('This browser has no location support.'); return; }
    this.watch = navigator.geolocation.watchPosition(
      (p) => {
        if (this.sim) return;
        const c = p.coords;
        this.onFix({ lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude ?? NaN, heading: Number.isFinite(c.heading) && c.speed > 1 ? (c.heading * Math.PI) / 180 : null, speed: c.speed, t: Date.now() });
      },
      (e) => {
        this.onError(e.code === 1
          ? 'Location is blocked. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites (or WeSki) → While Using, with Precise Location on.'
          : 'Waiting for a GPS signal…');
        if (e.code === 1) this.stop();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
    );
  }

  stop() {
    if (this.watch != null) navigator.geolocation.clearWatch(this.watch);
    this.watch = null;
  }

  /** Test mode: positions come from taps / simulated movement instead of GPS. */
  setSim(on) {
    this.sim = on;
    clearInterval(this.timer);
    this.simPath = null;
    if (on) {
      this.stop();
      this.timer = setInterval(() => this.tick(), 1000);
    }
  }

  simTeleport(x, y) { this.simPos = [x, y]; this.simPath = null; this.simHeading = null; this.tick(); }

  /** Move along a flat local polyline at `speed` m/s (used to "ski" a route in test mode). */
  simFollow(pts, speed = 9) { this.simPath = { pts, d: 0, len: lineLength(pts), speed }; }

  tick() {
    if (!this.sim) return;
    if (this.simPath) {
      const p = this.simPath;
      p.d = Math.min(p.len, p.d + p.speed);
      const [x, y, hd] = pointAlong(p.pts, p.d);
      this.simPos = [x, y]; this.simHeading = hd;
      if (p.d >= p.len) this.simPath = null;
    }
    if (!this.simPos) return;
    const [lat, lon] = this.geo.toLatLon(this.simPos[0], this.simPos[1]);
    this.onFix({ lat, lon, acc: 5, alt: NaN, heading: this.simHeading ?? null, speed: this.simPath ? this.simPath.speed : 0, t: Date.now(), sim: true });
  }
}
