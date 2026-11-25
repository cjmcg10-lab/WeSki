// SkiWithMe Cloudflare Worker: serves the app (embedded static files) and private group rooms.
// One Durable Object per group code relays opt-in GPS positions between up to 20 members.
import { DurableObject } from 'cloudflare:workers';
import { FILES } from './static/manifest.js';
import { applyMessage, publicState, newRoom, roomInfo, IDLE_MS } from './room.js';
import { PLANS, EMAIL_RE, normEmail, sessionFromCookie, sessionCookie, signInEmail, newSignInEmail, verifyPaddle, purchaseFromEvent, sha256, SESSION_TTL_MS } from './accounts.js';
import { cleanSummary, cleanReport } from './evidence.js';
import { fromR2 } from './maps.js';
import { weatherResponse, historyResponse, ENSEMBLE_STORE } from './capture.js';
import { statusResponse } from './resort-status.js';
import { feedbackResponse, archiveExportResponse, networkOf } from './calibration.js';
import { elevationResponse } from './elevation.js';
import { count, flush, routeKey, usageResponse, mailResponse } from './usage.js';
// DIGEST_CRON lives in digest.js: a Worker module's named exports must be functions, classes or handlers, and
// local workerd (wrangler dev) refuses to start on an exported string.
import { runDigest, DIGEST_INDEX, DIGEST_CRON, isKnownResort } from './digest.js';
export { Accounts, ResortLog, ForecastHistory } from './stores.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_RE = /^[A-Z2-9]{6}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const paywallOn = (env) => env.PAYWALL === 'on';
const accounts = (env) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main'));
const resortLog = (env, id) => env.RESORTLOG.get(env.RESORTLOG.idFromName(id));
const session = (request) => sessionFromCookie(request.headers.get('cookie'));
// a rough, daily-changing key for rate limits: the address itself is never stored
const ipKey = async (request, env) => (await sha256(networkOf(request.headers.get('cf-connecting-ip') || '') + (env.IP_SALT || '') + new Date().toISOString().slice(0, 10))).slice(0, 16);
const readJson = async (request, max = 200000) => {
  const raw = await request.text();
  if (raw.length > max) return null;
  try { return JSON.parse(raw); } catch { return null; }
};
const priceMap = (env) => { try { return JSON.parse(env.PADDLE_PRICES || '{}'); } catch { return {}; } }; // {price id: plan}

/** Send one email through Resend (the sign-in mail account). Returns true when Resend accepted it. */
async function sendMail(env, to, mail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (res.ok) count('out:resend');
  return res.ok;
}

/** After a sign-in to an account that already existed: email its owner which device signed in, with a link that signs
 *  out every device. Sent in the background; a failed email never blocks the sign-in. */
function noticeSignIn(out, env, url, ctx) {
  if (!out?.notice || !env.RESEND_API_KEY || !env.MAIL_FROM) return;
  const mail = newSignInEmail(out.notice.device, Date.now(), `${url.origin}/api/auth/revoke?t=${out.notice.token}`);
  const job = sendMail(env, out.notice.email, mail).catch(() => false);
  if (ctx?.waitUntil) ctx.waitUntil(job);
}

/** The small page behind the "sign out everywhere" link. A plain link that acted by itself could be set off by an
 *  email scanner opening it, so the page asks for one tap first. */
function revokePage(state, token = '') {
  const body = {
    ask: `<h1>Sign out everywhere?</h1><p>Every device signed in to your SkiWithMe account will be signed out, this one too. Sign in again with your email afterwards.</p><form method="post" action="/api/auth/revoke"><input type="hidden" name="t" value="${token}"><button>Sign out everywhere</button></form>`,
    done: '<h1>Signed out everywhere</h1><p>Every device was signed out of your SkiWithMe account. Sign in again with your email on your own devices.</p><p><a href="/">Open SkiWithMe</a></p>',
    gone: '<h1>This link has expired</h1><p>It works once, for 7 days. To sign out every device now, sign in to SkiWithMe and open SkiWithMe Pass → Sign out of all devices.</p><p><a href="/">Open SkiWithMe</a></p>',
  }[state];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SkiWithMe</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#010c1b;color:#e8eef5;margin:0;padding:40px 20px}main{max-width:480px;margin:auto}h1{font-size:22px}button{font:600 16px system-ui;background:#16a3a3;color:#fff;border:0;border-radius:10px;padding:12px 20px}a{color:#5fd3d3}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status: state === 'gone' ? 410 : 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'same-origin', 'x-robots-tag': 'noindex' } });
}

/** Paid features that live on the server check the pass here, on every request. */
async function passOk(request, env) {
  if (!paywallOn(env)) return true;
  return accounts(env).hasPass(session(request));
}

/** A request for a mountain's directions data from a member of a group on that mountain (`?g=CODE&m=MEMBER`). */
async function groupOk(url, env, resort) {
  const code = (url.searchParams.get('g') || '').toUpperCase(), member = url.searchParams.get('m') || '';
  if (!CODE_RE.test(code) || !/^[A-Za-z0-9_-]{8,40}$/.test(member)) return false;
  return env.GROUPS.get(env.GROUPS.idFromName(code)).isMember(member, resort);
}

async function api(request, env, url, ctx) {
  const path = url.pathname, method = request.method;
  // state-changing requests must come from the app's own pages (cookies are SameSite=Lax as well)
  if (method === 'POST' && path !== '/api/paddle/webhook') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Wrong origin' }, 403);
  }
  if (path === '/api/admin/usage' && method === 'GET') return usageResponse(request, url, env);
  if (path === '/api/admin/usage/mail' && method === 'POST') return mailResponse(request, env);
  if (path === '/api/weather' && method === 'GET') return weatherResponse(url, env, ctx);
  if (path === '/api/elevation' && method === 'GET') return elevationResponse(url);
  const historyId = method === 'GET' && /^\/api\/history\/([a-z0-9-]{2,40})$/.exec(path)?.[1];
  if (historyId) return historyResponse(historyId, env);
  const statusId = method === 'GET' && /^\/api\/resort-status\/([a-z0-9-]{2,40})$/.exec(path)?.[1];
  if (statusId) return statusResponse(statusId);
  if (path === '/api/feedback' && method === 'POST') return feedbackResponse(await request.text(), env, await ipKey(request, env));
  const archiveId = method === 'GET' && /^\/api\/forecast-archive\/([a-z0-9-]{2,40})$/.exec(path)?.[1];
  if (archiveId) return archiveExportResponse(request, url, archiveId, env);
  if (path === '/api/config' && method === 'GET') {
    const prices = Object.fromEntries(Object.entries(priceMap(env)).map(([id, plan]) => [plan, id]));
    return json({
      paywall: paywallOn(env), signIn: !!(env.RESEND_API_KEY && env.MAIL_FROM),
      paddle: env.PADDLE_CLIENT_TOKEN ? { token: env.PADDLE_CLIENT_TOKEN, env: env.PADDLE_ENV || 'sandbox', prices } : null,
      plans: PLANS,
    });
  }
  if (path === '/api/auth/start' && method === 'POST') {
    const b = await readJson(request, 2000), email = normEmail(b?.email);
    if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address' }, 400);
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) return json({ error: 'Sign-in is not open yet' }, 503);
    const login = await accounts(env).startLogin(email, await ipKey(request, env));
    if (!login) return json({ error: 'Too many sign-in emails. Try again in an hour.' }, 429);
    const mail = signInEmail(`${url.origin}/api/auth/finish?t=${login.token}`, login.code);
    if (!(await sendMail(env, email, mail))) return json({ error: 'The email could not be sent. Try again in a moment.' }, 502);
    return json({ ok: true });
  }
  if (path === '/api/auth/finish' && method === 'GET') {
    const t = url.searchParams.get('t') || '';
    const out = /^[0-9a-f]{64}$/.test(t) ? await accounts(env).finishLogin(t, request.headers.get('user-agent')) : null;
    noticeSignIn(out, env, url, ctx);
    const headers = { location: out ? '/?signedin=1' : '/?signin=expired', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };
    if (out) headers['set-cookie'] = sessionCookie(out.session, Math.floor(SESSION_TTL_MS / 1000));
    return new Response(null, { status: 302, headers });
  }
  if (path === '/api/auth/code' && method === 'POST') {
    const b = await readJson(request, 2000), email = normEmail(b?.email), code = String(b?.code || '').replace(/\D/g, '');
    if (!EMAIL_RE.test(email) || code.length !== 6) return json({ error: 'Enter the 6-digit code from the email' }, 400);
    const out = await accounts(env).finishCode(email, code, request.headers.get('user-agent'));
    if (!out) return json({ error: 'That code is wrong or has expired. After five wrong tries, ask for a new email.' }, 401);
    noticeSignIn(out, env, url, ctx);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': sessionCookie(out.session, Math.floor(SESSION_TTL_MS / 1000)) } });
  }
  if (path === '/api/me' && method === 'GET') {
    const me = await accounts(env).me(session(request));
    return json(me ? { signedIn: true, ...me, paywall: paywallOn(env) } : { signedIn: false, paywall: paywallOn(env) });
  }
  if (path === '/api/auth/signout' && method === 'POST') {
    await accounts(env).signOut(session(request));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0) } });
  }
  if (path === '/api/auth/signout-all' && method === 'POST') {
    const ok = await accounts(env).signOutAll(session(request));
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 401, headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0) } });
  }
  if (path === '/api/auth/revoke' && method === 'GET') {
    const t = url.searchParams.get('t') || '';
    return revokePage(/^[0-9a-f]{64}$/.test(t) && await accounts(env).revokeValid(t) ? 'ask' : 'gone', t);
  }
  if (path === '/api/auth/revoke' && method === 'POST') {
    let t = '';
    try { t = String((await request.formData()).get('t') || ''); } catch { /* not a form */ }
    return revokePage(/^[0-9a-f]{64}$/.test(t) && await accounts(env).revokeAll(t) ? 'done' : 'gone');
  }
  if (path === '/api/account/delete' && method === 'POST') {
    const ok = await accounts(env).deleteAccount(session(request));
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 401, headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0) } });
  }
  if (path === '/api/consent' && method === 'POST') {
    const b = await readJson(request, 500);
    const ok = await accounts(env).recordConsent(session(request), b?.v);
    return json({ ok }, ok ? 200 : 401);
  }
  if (path === '/api/trial' && method === 'POST') {
    const r = await accounts(env).startTrial(session(request));
    return json(r, r.ok ? 200 : r.error === 'signed_out' ? 401 : 409);
  }
  if (path === '/api/crew' && method === 'POST') {
    const b = await readJson(request, 4000);
    const r = await accounts(env).setCrew(session(request), Array.isArray(b?.emails) ? b.emails.map(String) : []);
    return json(r, r.ok ? 200 : 403);
  }
  if (path === '/api/pass/upgrade' && method === 'POST') {
    // Season to Crew on the website: Paddle switches the same subscription and charges only the difference for the
    // rest of the year; the change then arrives by the signed webhook like any other. Needs the PADDLE_API_KEY secret.
    const r = await accounts(env).seasonToUpgrade(session(request));
    if (r.error) return json(r, r.error === 'signed_out' ? 401 : 409);
    const crewPrice = Object.entries(priceMap(env)).find(([, plan]) => plan === 'crew')?.[0];
    if (!env.PADDLE_API_KEY || !crewPrice) return json({ error: 'not_open' }, 503);
    const base = env.PADDLE_ENV === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
    const res = await fetch(`${base}/subscriptions/${encodeURIComponent(r.sub)}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ price_id: crewPrice, quantity: 1 }], proration_billing_mode: 'prorated_immediately', on_payment_failure: 'prevent_change' }),
    }).catch(() => null);
    if (!res?.ok) return json({ error: 'paddle', status: res?.status || 0 }, 502);
    return json({ ok: true });
  }
  if (path === '/api/paddle/webhook' && method === 'POST') {
    const raw = await request.text();
    if (!(await verifyPaddle(request.headers.get('paddle-signature'), raw, env.PADDLE_WEBHOOK_SECRET))) return json({ error: 'Bad signature' }, 401);
    let ev;
    try { ev = JSON.parse(raw); } catch { return json({ error: 'Bad body' }, 400); }
    await accounts(env).applyPurchase(ev.event_id || ev.notification_id, purchaseFromEvent(ev, priceMap(env)));
    return json({ ok: true });
  }
  if (path === '/api/contrib' && method === 'POST') {
    const s = cleanSummary(await readJson(request));
    if (s.error) return json({ error: s.error }, 400);
    // only mountains in the app: made-up ids would each get a store of their own
    if (!isKnownResort(s.resort)) return json({ error: 'unknown mountain' }, 400);
    const out = await resortLog(env, s.resort).addDay(s, await ipKey(request, env));
    // the daily email also covers mountains with new map-help days (on-map share, places people leave the map)
    if (out.ok && !out.duplicate) ctx.waitUntil(resortLog(env, DIGEST_INDEX).digestNote(s.resort, Date.now()).catch(() => {}));
    return json(out);
  }
  const heat = path.match(/^\/api\/heat\/([a-z0-9-]{2,40})$/);
  if (heat && method === 'GET') return json(await resortLog(env, heat[1]).heat());
  if (path === '/api/reports' && method === 'POST') {
    const r = cleanReport(await readJson(request, 4000));
    if (r.error) return json({ error: r.error }, 400);
    if (!isKnownResort(r.report.resort)) return json({ error: 'unknown mountain' }, 400);
    // the install id is stored only as a hash made with the mountain's id, so one phone cannot be followed across mountains
    if (r.report.dev) r.report.dev = (await sha256(`${r.report.resort}:${r.report.dev}`)).slice(0, 16);
    const out = await resortLog(env, r.report.resort).addReport(r.report, await ipKey(request, env));
    if (out.ok) ctx.waitUntil(resortLog(env, DIGEST_INDEX).digestNote(r.report.resort, r.report.at).catch(() => {}));
    return json(out, out.ok ? 200 : 429);
  }
  const reps = path.match(/^\/api\/reports\/([a-z0-9-]{2,40})$/);
  if (reps && method === 'GET') return json(await resortLog(env, reps[1]).reports());
  const probs = path.match(/^\/api\/reports\/([a-z0-9-]{2,40})\/problems$/);
  if (probs && method === 'GET') return json(await resortLog(env, probs[1]).problems());
  return null;
}

/** The scheduled job (cron in wrangler.assets.jsonc): one step of reading MeteoSwiss ensemble files (worker/meteoswiss.js). */
export async function runEnsemble(env, now = Date.now()) {
  try {
    const out = await env.FORECASTHIST.get(env.FORECASTHIST.idFromName(ENSEMBLE_STORE)).ensembleStep(now);
    if (out.action !== 'none') console.log('meteoswiss', out);
    return out;
  } catch (e) {
    console.error('meteoswiss step failed', { message: e.message });
    return { action: 'error', message: e.message };
  }
}

export default {
  // Cron Triggers (wrangler configs "triggers"): every 5 minutes a MeteoSwiss ensemble step (worker/meteoswiss.js);
  // once a day (DIGEST_CRON) the email of new map-mistake reports (worker/digest.js).
  async scheduled(controller, env, ctx) {
    const now = controller.scheduledTime || Date.now();
    if (controller.cron === DIGEST_CRON) {
      ctx.waitUntil(runDigest(env, resortLog, now)
        .then((r) => console.log('report digest', JSON.stringify(r)))
        .catch((e) => console.error('report digest failed', e?.message || e)));
      return;
    }
    ctx.waitUntil(runEnsemble(env, now));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // a rough count for the usage alerts (docs/USAGE_ALERTS.md); written out at most once a minute
    count(routeKey(url.pathname, request.method));
    flush(env, ctx);
    // directions data is part of the paid tier: served only with a pass when the paywall is on
    const graph = url.pathname.match(/^\/data\/([a-z0-9-]{2,40})\/graph\.json$/);
    // Members of a group get it too, for meeting points (a group is only created with a pass, so someone paid).
    if (graph && !(await passOk(request, env)) && !(await groupOk(url, env, graph[1]))) return json({ error: 'pass_required' }, 402);
    const map = await fromR2(request, env, url);
    if (map) return map;
    if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/groups')) {
      const res = await api(request, env, url, ctx);
      if (res) return res;
    }
    if (url.pathname === '/api/groups' && request.method === 'POST') {
      if (!(await passOk(request, env))) return json({ error: 'pass_required', message: 'Creating a group needs a pass. Joining a friend\'s group is free.' }, 402);
      for (let attempt = 0; attempt < 5; attempt++) {
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
        const stub = env.GROUPS.get(env.GROUPS.idFromName(code));
        if (await stub.create(code)) return json({ code });
      }
      return json({ error: 'Could not create a group, try again' }, 503);
    }
    const info = url.pathname.match(/^\/api\/groups\/([A-Za-z0-9]{6})$/);
    if (info && request.method === 'GET') {
      const code = info[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'No group with that code' }, 404);
      const out = await env.GROUPS.get(env.GROUPS.idFromName(code)).info();
      return out ? json(out) : json({ error: 'No group with that code' }, 404);
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

  /** Is this member id in the group, and is the group on this mountain? */
  async isMember(member, resort) {
    const room = await this.load();
    return !!room && room.resort === resort && !!room.members[member];
  }

  /** The mountain this group is on (see roomInfo), or null when there is no such group. */
  async info() {
    const room = await this.load();
    return room ? roomInfo(room) : null;
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
