// The Worker's own rough daily count of what it serves and fetches, for the usage alerts (docs/USAGE_ALERTS.md).
// Counts are kept in memory and written to the Accounts Durable Object at most once a minute per Worker copy, so the
// count itself adds very few Durable Object requests. A copy that is shut down loses its last minute: the count is a
// guide next to Cloudflare's own analytics, not a bill.
import { sameSecret } from './calibration.js';

export const FLUSH_MS = 60e3;
export const FLUSH_N = 500;
const ADMIN_HEADER = 'x-admin-key';
const counts = new Map();
let pending = 0, last = Date.now();

export function count(key, n = 1) {
  if (!key) return;
  counts.set(key, (counts.get(key) || 0) + n);
  pending += n;
}

/** Which counter an incoming request belongs to (null: not counted). */
export function routeKey(path, method) {
  if (/^\/data\/[a-z0-9-]+\/graph\.json$/.test(path)) return 'req:graph';
  if (path.startsWith('/data/')) return 'req:map';
  if (path.startsWith('/api/admin/')) return null;
  if (path === '/api/weather') return 'req:weather';
  if (path.startsWith('/api/resort-status/')) return 'req:status';
  if (path === '/api/groups' && method === 'POST') return 'req:group-create';
  if (/^\/api\/groups\/[A-Za-z0-9]{6}\/ws$/.test(path)) return 'req:group-ws';
  if (path.startsWith('/api/')) return 'req:api';
  return null;
}

/** Write the counts to the Accounts Durable Object when a minute has passed or many are waiting. */
export function flush(env, ctx, { now = Date.now(), force = false } = {}) {
  if (!pending || !env?.ACCOUNTS) return null;
  if (!force && now - last < FLUSH_MS && pending < FLUSH_N) return null;
  const batch = Object.fromEntries(counts);
  counts.clear();
  pending = 0;
  last = now;
  const day = new Date(now).toISOString().slice(0, 10);
  const p = env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main')).addUsage(day, batch).catch(() => {});
  ctx?.waitUntil?.(p);
  return batch;
}

const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** 404 while the owner has not set USAGE_SECRET (so the endpoints look absent), 401 for a wrong key, else null. */
async function guard(request, env) {
  if (!env.USAGE_SECRET) return respond({ error: 'Not found' }, 404);
  if (!(await sameSecret(request.headers.get(ADMIN_HEADER) || '', env.USAGE_SECRET))) return respond({ error: 'Not allowed' }, 401);
  return null;
}

/** GET /api/admin/usage?days=N: {days: {date: {counter: n}}} for the last N days (at most 60). */
export async function usageResponse(request, url, env) {
  const no = await guard(request, env);
  if (no) return no;
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get('days')) || 35));
  const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  return respond({ days: await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main')).usage(since) });
}

const header = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '').slice(0, 200);

/** A plain-text email as raw MIME, for Cloudflare's send_email binding. */
export function mimeText({ from, to, subject, text, now = new Date() }) {
  const id = `${crypto.randomUUID()}@${from.split('@')[1].replace(/>.*/, '')}`;
  return [
    `From: SkiWithMe usage <${from}>`, `To: ${to}`, `Subject: ${header(subject)}`, `Date: ${now.toUTCString()}`, `Message-ID: <${id}>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '',
    String(text).slice(0, 50000).replace(/\r?\n/g, '\r\n'),
  ].join('\r\n');
}

/**
 * POST /api/admin/usage/mail {subject, text}: emails the usage alert to the owner through Cloudflare Email Routing.
 * Answers 404 until the owner has added the `USAGE_MAIL` send_email binding (docs/USAGE_ALERTS.md, "Email").
 */
export async function mailResponse(request, env, { EmailMessage } = {}) {
  const no = await guard(request, env);
  if (no) return no;
  if (!env.USAGE_MAIL) return respond({ error: 'Email is not set up' }, 404);
  let b;
  try { b = JSON.parse(await request.text()); } catch { return respond({ error: 'Bad body' }, 400); }
  if (!b?.subject || !b?.text) return respond({ error: 'subject and text are needed' }, 400);
  const from = env.USAGE_MAIL_FROM || 'usage@builtbyroger.app', to = env.USAGE_MAIL_TO || 'hello@builtbyroger.app';
  EmailMessage ||= (await import('cloudflare:email')).EmailMessage;
  try {
    await env.USAGE_MAIL.send(new EmailMessage(from, to, mimeText({ from, to, subject: b.subject, text: b.text })));
  } catch (e) {
    return respond({ error: `Not sent: ${e.message}` }, 502);
  }
  return respond({ ok: true });
}
