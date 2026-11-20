// Client for a private group room (WebSocket to the Cloudflare Durable Object).
export async function createGroup() {
  const res = await fetch('/api/groups', { method: 'POST' });
  if (res.status === 402) { const e = new Error('Creating a group needs a pass. Joining a friend\'s group is free.'); e.pass = true; throw e; }
  if (!res.ok) throw new Error('Could not create a group. Check your connection.');
  return (await res.json()).code;
}

export class GroupClient {
  /** handlers: {state(s), status('connecting'|'online'|'offline'), error(msg, code), ended(reason)} */
  constructor(code, profile, handlers, resort = null) {
    this.code = code.toUpperCase();
    this.resort = resort; // the mountain this phone is on, recorded by the server if the group has none yet
    this.profile = profile;
    this.h = handlers;
    this.ws = null;
    this.stopped = false;
    this.retry = 0;
    this.sharing = false;
    this.lastPos = null;
    this.connect();
    this._vis = () => { if (document.visibilityState === 'visible' && !this.stopped && (!this.ws || this.ws.readyState > 1)) this.connect(); };
    document.addEventListener('visibilitychange', this._vis);
    window.addEventListener('online', this._vis);
  }

  connect() {
    clearTimeout(this.timer);
    if (this.stopped) return;
    this.h.status?.('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/groups/${this.code}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.send({ t: 'hello', ...this.profile, resort: this.resort });
      // Restore our sharing choice after a reconnect, and re-send the latest fix.
      if (this.sharing) {
        this.send({ t: 'share', on: true });
        if (this.lastPos) this.send({ t: 'pos', ...this.lastPos });
      }
      this.h.status?.('online');
      clearInterval(this.ping);
      this.ping = setInterval(() => this.send({ t: 'ping' }), 25000);
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'state') {
        this.skew = Date.now() - m.now; // compare server timestamps against this phone's clock
        this.h.state?.(m);
      } else if (m.t === 'closed') this.end('closed');
      else if (m.t === 'error') {
        if (['not_found', 'full', 'bad_name', 'bad_id'].includes(m.code)) this.end(m.code, m.message);
        else this.h.error?.(m.message, m.code);
      }
    };
    ws.onclose = () => {
      clearInterval(this.ping);
      if (this.stopped || this.ws !== ws) return;
      this.h.status?.('offline');
      this.timer = setTimeout(() => this.connect(), Math.min(15000, 1000 * 2 ** this.retry++));
    };
    ws.onerror = () => {};
  }

  send(msg) {
    if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  setSharing(on, clear = false) {
    this.sharing = on;
    this.send({ t: 'share', on, clear });
  }

  sendPos(pos) {
    this.lastPos = pos;
    if (this.sharing) this.send({ t: 'pos', ...pos });
  }

  updateProfile(profile) {
    this.profile = profile;
    this.send({ t: 'hello', ...profile });
  }

  setMeet(point) { this.send({ t: 'meet', point }); }
  setClosures(list) { this.send({ t: 'closures', list }); }

  leave() { this.send({ t: 'leave' }); this.stop(); }
  close() { this.send({ t: 'close' }); }

  end(reason, message) {
    this.stop();
    this.h.ended?.(reason, message);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.ping);
    document.removeEventListener('visibilitychange', this._vis);
    window.removeEventListener('online', this._vis);
    const ws = this.ws;
    this.ws = null;
    setTimeout(() => { try { ws?.close(); } catch { /* ignore */ } }, 150);
  }
}
