// Accounts, passes and payments: the pure logic (no Cloudflare APIs), so it can be unit tested.
//
// Security model (see docs/PAID_TIER.md):
// - Sign-in is by a one-time link sent to the email address; nobody chooses or stores a password.
// - A session is a random 256-bit value in an HttpOnly, Secure cookie. The server keeps only its SHA-256 hash.
// - What an account may use is decided only on the server, from payments reported by Paddle's webhook, whose
//   signature (HMAC-SHA256 with a secret only Paddle and the server know) is checked. Nothing the phone sends can
//   grant a pass.
// - Paid features that live on the server (creating groups, directions data) check the pass on every request.
//   Features that run only on the phone (saved history, the full Forecast, downloading mountains ahead of time) can
//   be unlocked by someone who edits the app's code; see "How the pass is enforced" in docs/PAID_TIER.md.

// THE ONE PLACE FOR PRICES (set 2026-11-23; may still change). The app's pass sheet and pop-up read them from
// /api/config. To change a price: edit it here, change the matching price in Paddle (docs/PAID_TIER.md, "Changing a
// price"), and run the tests: tests/prices.test.js names every page and document that still shows the old number.
export const PLANS = {
  // id: what the pass is called, price in US dollars, how long one purchase lasts (null = while the subscription is paid), seats
  day: { name: 'Day Pass', price: 2.99, days: 1, seats: 1, renews: false },
  week: { name: 'Week Pass', price: 5.99, days: 7, seats: 1, renews: false },
  season: { name: 'Season Pass', price: 24.99, days: null, seats: 1, renews: true },
  crew: { name: 'Crew Season Pass', price: 44.99, days: null, seats: 4, renews: true },
};
/** Plans bought once (Day, Week): a new one starts when the account's current one ends, so passes add up. */
export const ONE_OFF = Object.keys(PLANS).filter((k) => !PLANS[k].renews);
export const TRIAL_HOURS = 24;               // one free day per account
export const MAX_SESSIONS = 2;               // signed-in devices per account; signing in on another signs out the one used longest ago
export const REVOKE_TTL_MS = 7 * 24 * 3600 * 1000; // the "sign out everywhere" link in a new-sign-in email works for 7 days, once
export const LOGIN_TTL_MS = 15 * 60 * 1000;  // a sign-in link works for 15 minutes, once
export const SESSION_TTL_MS = 180 * 24 * 3600 * 1000;
export const GRACE_MS = 3 * 24 * 3600 * 1000; // a renewing pass stays on 3 days past a late payment

const enc = new TextEncoder();
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomToken = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/** Constant-time comparison of two hex strings. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

/**
 * Paddle Billing webhook signature: header "Paddle-Signature: ts=1671552777;h1=<hex>", where h1 is
 * HMAC-SHA256(secret, ts + ":" + raw body). Rejects anything older than 5 minutes (replays).
 */
export async function verifyPaddle(header, rawBody, secret, nowMs = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(';').map((p) => p.split('=').map((s) => s.trim())));
  const ts = Number(parts.ts);
  if (!ts || !parts.h1 || Math.abs(nowMs / 1000 - ts) > 300) return false;
  return safeEqual(await hmacHex(secret, `${ts}:${rawBody}`), parts.h1);
}

export const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
export const normEmail = (e) => String(e || '').trim().toLowerCase();

/**
 * Turn one verified Paddle event into a purchase record (or null if it does not change any pass).
 * prices: {paddle price id: plan id}. Returns {id, account, plan, status, starts, ends, sub, customer}.
 */
export function purchaseFromEvent(ev, prices) {
  const d = ev?.data;
  if (!d) return null;
  const account = d.custom_data?.account;
  const item = (d.items || []).map((i) => prices[i.price?.id || i.price_id]).find(Boolean);
  if (!account || !item) return null;
  const plan = PLANS[item];
  if (ev.event_type === 'transaction.completed' && !plan.renews) {
    const starts = Date.parse(d.billed_at || d.created_at || ev.occurred_at);
    return { id: d.id, account, plan: item, status: 'active', starts, ends: starts + plan.days * 86400000, sub: null, customer: d.customer_id || null };
  }
  if (ev.event_type?.startsWith('subscription.') && plan.renews) {
    const period = d.current_billing_period;
    const ends = period?.ends_at ? Date.parse(period.ends_at) : null;
    const status = d.status; // active, trialing, past_due, paused, canceled
    const on = status === 'active' || status === 'trialing' || status === 'past_due';
    return { id: d.id, account, plan: item, status, starts: Date.parse(d.started_at || d.created_at || ev.occurred_at),
      ends: on && ends ? ends + GRACE_MS : Date.parse(d.canceled_at || ev.occurred_at), sub: d.id, customer: d.customer_id || null };
  }
  return null;
}

/**
 * What an account may use right now. purchases: its own records; crewOf: records of crews it belongs to;
 * trialUntil: end of its free day (or 0). Returns {active, plan, until, trial}.
 */
export function entitlement(purchases, crewOf = [], trialUntil = 0, now = Date.now()) {
  let best = null;
  for (const p of [...purchases, ...crewOf.map((p) => ({ ...p, member: true }))]) {
    if (p.starts <= now && p.ends > now && (!best || p.ends > best.ends)) best = p;
  }
  if (best) {
    // passes bought back to back (a second Week Pass starts when the first ends) count as one stretch
    let until = best.ends;
    for (let more = true; more;) {
      more = false;
      for (const p of purchases) if (p.starts <= until && p.ends > until) { until = p.ends; more = true; }
    }
    return { active: true, plan: best.plan, until, member: !!best.member, trial: false };
  }
  if (trialUntil > now) return { active: true, plan: 'trial', until: trialUntil, trial: true };
  return { active: false, plan: null, until: 0, trial: false };
}

/** Parse the session cookie. */
export function sessionFromCookie(header) {
  const m = /(?:^|;\s*)sw_session=([0-9a-f]{64})(?:;|$)/.exec(header || '');
  return m ? m[1] : null;
}

export const sessionCookie = (token, maxAgeS) =>
  `sw_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;

/** A plain name for the kind of device, from its browser's User-Agent ("iPhone", "Mac"...), or null when unclear. */
export function deviceName(ua) {
  const s = String(ua || '');
  if (/iPhone/.test(s)) return 'iPhone';
  if (/iPad/.test(s)) return 'iPad';
  if (/Android/.test(s)) return /Mobile/.test(s) ? 'Android phone' : 'Android tablet';
  if (/CrOS/.test(s)) return 'Chromebook';
  if (/Macintosh|Mac OS X/.test(s)) return 'Mac';
  if (/Windows/.test(s)) return 'Windows computer';
  if (/Linux/.test(s)) return 'Linux computer';
  return null;
}

/** The email sent when an existing account signs in on a device: a warning, and a link to sign out everywhere. */
export function newSignInEmail(device, at, link) {
  const what = !device ? 'a new device' : `${/^[AEIOU]/i.test(device) ? 'an' : 'a'} ${device}`;
  const when = new Date(at).toISOString().slice(0, 16).replace('T', ' at ') + ' UTC';
  const text = `Your SkiWithMe account was just signed in on ${what}, on ${when}.\n\nIf that was you, there is nothing to do.\n\nIf it was not you, or you shared your sign-in code, sign out every device here (the link works for 7 days):\n${link}\n\nAn account can be signed in on 2 devices at once. To ski with friends on one pass, the Crew Season Pass covers 4 people.`;
  const html = `<p>Your SkiWithMe account was just signed in on <b>${what}</b>, on ${when}.</p><p>If that was you, there is nothing to do.</p><p>If it was not you, or you shared your sign-in code, sign out every device:</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#16a3a3;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Sign out everywhere</a></p><p style="color:#667">The link works for 7 days. An account can be signed in on 2 devices at once. To ski with friends on one pass, the Crew Season Pass covers 4 people.</p>`;
  return { subject: 'New sign-in to your SkiWithMe account', text, html };
}

export function signInEmail(link, code) {
  const text = `Your SkiWithMe sign-in code is ${code}\n\nType it in the app, or tap this link in the browser you use SkiWithMe in:\n${link}\n\nIt works once, for 15 minutes. If you did not ask to sign in, ignore this email: nothing happens without the code.`;
  const html = `<p>Your SkiWithMe sign-in code is</p><p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p><p>Type it in the app. Or, in the browser you use SkiWithMe in, tap:</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#16a3a3;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Sign in</a></p><p style="color:#667">It works once, for 15 minutes. If you did not ask to sign in, ignore this email: nothing happens without the code.</p>`;
  return { subject: `${code} is your SkiWithMe sign-in code`, text, html };
}
