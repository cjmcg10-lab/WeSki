import { resortPlace } from './catalog.js';
import { RESORT_RE } from './evidence.js';
import { sha256 } from './accounts.js';
import { FEEDBACK_TAGS, FEEDBACK_MAX_AGE_DAYS } from '../src/feedback.js';

export { FEEDBACK_MAX_AGE_DAYS };
export const FEEDBACK_PER_NETWORK_PER_DAY = 20;
export const EXPORT_MAX_ARCHIVE = 200;
const DAY_MS = 864e5;
const ADMIN_HEADER = 'x-admin-key';

const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Check a "How was it?" answer. It carries a mountain, a local date, a 1 to 5 rating and tags: nothing else is read. */
export function networkOf(ip) {
  if (!ip.includes(':') || ip.includes('.')) return ip;
  const [head, tail = null] = ip.toLowerCase().split('::');
  const first = head ? head.split(':') : [];
  const last = tail ? tail.split(':') : [];
  const groups = tail === null ? first : [...first, ...Array(Math.max(0, 8 - first.length - last.length)).fill('0'), ...last];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}

export function cleanFeedback(b, now = Date.now()) {
  if (!b || typeof b !== 'object') return { error: 'bad body' };
  if (!RESORT_RE.test(b.resort || '')) return { error: 'bad resort' };
  if (!validDate(b.day || '')) return { error: 'bad day' };
  const dayMs = Date.parse(`${b.day}T00:00:00Z`);
  if (dayMs > now + DAY_MS || dayMs < now - FEEDBACK_MAX_AGE_DAYS * DAY_MS) return { error: 'bad day' };
  if (!Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5) return { error: 'bad rating' };
  if (b.tags != null && (!Array.isArray(b.tags) || b.tags.length > FEEDBACK_TAGS.length)) return { error: 'bad tags' };
  const tags = [...new Set(b.tags ?? [])];
  if (!tags.every((t) => FEEDBACK_TAGS.includes(t))) return { error: 'bad tags' };
  return { ok: true, feedback: { resort: b.resort, day: b.day, rating: b.rating, tags } };
}

/** Add one answer to a day's counts: `{ ratings: [n1..n5], tags: { tag: n } }`. Nothing about the person is kept. */
export function addFeedbackCounts(row, { rating, tags }) {
  const ratings = row?.ratings ? [...row.ratings] : [0, 0, 0, 0, 0];
  ratings[rating - 1] += 1;
  const merged = { ...(row?.tags ?? {}) };
  for (const t of tags) merged[t] = (merged[t] ?? 0) + 1;
  return { ratings, tags: merged };
}

/** POST /api/feedback. The mountain must be on the server-side resort list. */
export async function feedbackResponse(raw, env, networkKey, { resolve = resortPlace, now = Date.now() } = {}) {
  let body = null;
  try { body = raw.length <= 600 ? JSON.parse(raw) : null; } catch { body = null; }
  const cleaned = cleanFeedback(body, now);
  if (cleaned.error) return respond({ error: cleaned.error }, 400);
  const listed = await resolve(env, cleaned.feedback.resort, now);
  if (!listed) return respond({ error: 'bad resort' }, 400);
  const log = env.RESORTLOG.get(env.RESORTLOG.idFromName(listed.id));
  const out = await log.addFeedback({ ...cleaned.feedback, resort: listed.id }, networkKey);
  return respond(out, out.ok ? 200 : 429);
}

export async function sameSecret(given, secret) {
  const [a, b] = await Promise.all([sha256(given), sha256(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * GET /api/forecast-archive/<id>?since=<ms>&limit=<n>: the archived forecasts, the stored hours and the feedback counts of a
 * listed resort, for tools/forecast_calibrate.mjs. Answers 404 when the secret ARCHIVE_ADMIN_SECRET is not set, 401 when the
 * `x-admin-key` header does not match it.
 */
export async function archiveExportResponse(request, url, id, env, { resolve = resortPlace, now = Date.now() } = {}) {
  if (!env.ARCHIVE_ADMIN_SECRET) return respond({ error: 'Not found' }, 404);
  if (!(await sameSecret(request.headers.get(ADMIN_HEADER) || '', env.ARCHIVE_ADMIN_SECRET))) return respond({ error: 'Not allowed' }, 401);
  const listed = await resolve(env, id, now);
  if (!listed) return respond({ error: 'Not found' }, 404);
  const since = Math.min(Math.max(0, Number(url.searchParams.get('since')) || 0), now);
  const limit = Math.min(EXPORT_MAX_ARCHIVE, Math.max(1, Number(url.searchParams.get('limit')) || EXPORT_MAX_ARCHIVE));
  const store = env.FORECASTHIST.get(env.FORECASTHIST.idFromName(listed.id));
  const log = env.RESORTLOG.get(env.RESORTLOG.idFromName(listed.id));
  const sinceDay = new Date(since).toISOString().slice(0, 10);
  const [archive, history, feedback] = await Promise.all([store.archive(since, limit), store.history(now), log.feedback(sinceDay)]);
  const { top, base, tz } = listed.place;
  return respond({ id: listed.id, place: { top, base, tz }, archive, history, feedback });
}
