// SkiWithMe Cloudflare Worker: serves the app (embedded static files) and private group rooms.
// One Durable Object per group code relays opt-in GPS positions between up to 20 members.
import { DurableObject } from 'cloudflare:workers';
import { FILES } from './static/manifest.js';
import { applyMessage, publicState, newRoom, IDLE_MS } from './room.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_RE = /^[A-Z2-9]{6}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/groups' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
        const stub = env.GROUPS.get(env.GROUPS.idFromName(code));
        if (await stub.create(code)) return json({ code });
      }
      return json({ error: 'Could not create a group, try again' }, 503);
    }
    const m = url.pathname.match(/^\/api\/groups\/([A-Za-z0-9]{6})\/ws$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'Invalid code' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected WebSocket' }, 426);
      return env.GROUPS.get(env.GROUPS.idFromName(code)).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (env.ASSETS) return env.ASSETS.fetch(request); // GitHub deploy: static assets
    return serveStatic(request, url);
  },
};

/** Serve the built app, embedded in this Worker by tools/embed.mjs. */
function serveStatic(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  let path = url.pathname === '/' ? '/index.html' : url.pathname;
  let file = FILES[path];
  if (!file) {
    // unknown path: the app shell for page navigations, 404 for everything else
    if (path.includes('.')) return new Response('Not found', { status: 404 });
    path = '/index.html';
    file = FILES[path];
  }
  const headers = {
    'content-type': file.type,
    etag: file.etag,
    'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(self)',
  };
  if (request.headers.get('if-none-match') === file.etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : file.body, { headers });
}

export class GroupRoom extends DurableObject {
  async load() {
    if (this.room === undefined) this.room = (await this.ctx.storage.get('room')) || null;
    return this.room;
  }

  async save() {
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }

  /** Create the room; false if the code is already in use. */
  async create(code) {
    if (await this.load()) return false;
    this.room = newRoom(code, Date.now());
    await this.save();
    return true;
  }

  async fetch(request) {
    const room = await this.load();
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    if (!room) {
      server.send(JSON.stringify({ t: 'error', code: 'not_found', message: 'No group with that code' }));
      server.close(4004, 'not_found');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast() {
    const now = Date.now();
    const online = new Set(this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment()?.id).filter(Boolean));
    const msg = JSON.stringify({ t: 'state', ...publicState(this.room, online, now) });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* socket closing */ }
    }
  }

  async webSocketMessage(ws, raw) {
    const room = await this.load();
    if (!room || typeof raw !== 'string' || raw.length > 4096) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() || {};
    const res = applyMessage(room, att.id || null, msg, Date.now());
    if (res.error) {
      ws.send(JSON.stringify({ t: 'error', code: res.error, message: res.message }));
      if (res.close) ws.close(4000 + (res.closeCode || 0), res.error);
      return;
    }
    if (res.join) ws.serializeAttachment({ id: res.join });
    if (res.closed) {
      // Owner closed the group: tell everyone, wipe all stored locations.
      const bye = JSON.stringify({ t: 'closed' });
      for (const s of this.ctx.getWebSockets()) {
        try { s.send(bye); s.close(4001, 'closed'); } catch { /* ignore */ }
      }
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    if (res.left) ws.close(1000, 'left');
    if (res.changed) {
      await this.save();
      this.broadcast();
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* already closed */ }
    if (await this.load()) this.broadcast();
  }

  async webSocketError() {
    if (await this.load()) this.broadcast();
  }

  /** Rooms with no activity for IDLE_MS are deleted along with every stored location. */
  async alarm() {
    const room = await this.load();
    if (!room) return;
    if (this.ctx.getWebSockets().length === 0 || Date.now() - room.touched >= IDLE_MS) {
      for (const s of this.ctx.getWebSockets()) {
        try { s.send(JSON.stringify({ t: 'closed' })); s.close(4001, 'expired'); } catch { /* ignore */ }
      }
      this.room = null;
      await this.ctx.storage.deleteAll();
    } else {
      await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    }
  }
}
