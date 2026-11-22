import { LIVE_SOURCES, MTNPOWDER_IDS } from './resort-status-feeds.js';
import { assumedStatus } from '../src/forecast/status.js';

export { assumedStatus };

const UA = 'weski-build';
const FETCH_TIMEOUT_MS = 8000;
const FEED_TTL_S = 300;
const STALE_MS = 36 * 3600e3;
const ACTIVE = new Set(['open', 'delayed', 'open_to_mid_station_only']);
const HOLD_STATUS = { delayed: 'delayed', open_to_mid_station_only: 'partial' };
const GROOMED_WITHIN_MS = 24 * 3600e3;

const toMs = (s) => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
const localDate = (s) => String(s || '').slice(0, 10);
const localMinutes = (s) => +String(s).slice(11, 13) * 60 + +String(s).slice(14, 16);

function clockMinutes(text) {
  const m = /^(\d{1,2}):(\d\d)\s*([AP]M)$/i.exec(String(text || '').trim());
  return m ? ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2] : null;
}

function scheduleMinutes(lifts) {
  const tally = new Map();
  for (const lift of lifts) {
    if (!lift.Hours || typeof lift.Hours !== 'object') continue;
    for (const day of Object.values(lift.Hours)) {
      const open = clockMinutes(day?.Open), close = clockMinutes(day?.Close);
      if (open == null || close == null || close <= open) continue;
      const key = `${open}-${close}`;
      tally.set(key, (tally.get(key) || 0) + 1);
    }
  }
  const [best] = [...tally].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return best ? best[0].split('-').map(Number) : null;
}

/** The most common lift schedule across all lifts and weekdays, as whole local hours (`to` exclusive). One schedule for every day. */
export function publishedHours(lifts) {
  const schedule = scheduleMinutes(lifts);
  if (!schedule) return null;
  const from = Math.ceil(schedule[0] / 60), to = Math.floor(schedule[1] / 60);
  return to - from >= 1 ? { from, to } : null;
}

function seasonOf(lifts, closedToday) {
  if (!lifts.length) return null;
  const statuses = lifts.map((l) => l.StatusEnglish);
  if (statuses.some((s) => ACTIVE.has(s))) return { open: null, close: null, state: 'open' };
  if (statuses.every((s) => s === 'closed_for_season')) return { open: null, close: null, state: 'closed_for_season' };
  return closedToday ? { open: null, close: null, state: 'not_open' } : null;
}

/** A mtnpowder.com resort feed, as the resort's own app reads it, into the status shape the forecast reads. */
export function normaliseMtnpowder(id, feed, now = Date.now()) {
  const generated = toMs(feed?.LastUpdate);
  if (!feed || !Array.isArray(feed.MountainAreas) || !Number.isFinite(generated)) return assumedStatus(id);
  const date = localDate(feed.LastUpdate);
  const lifts = feed.MountainAreas.flatMap((a) => a.Lifts || []);
  const trails = feed.MountainAreas.flatMap((a) => a.Trails || []);
  const newestLift = Math.max(...lifts.map((l) => toMs(l.UpdateDate)).filter(Number.isFinite), -Infinity);
  const settled = lifts.length > 0 && lifts.every((l) => l.StatusEnglish === 'closed_for_season');
  if (!settled && now - newestLift > STALE_MS) return assumedStatus(id);
  const schedule = scheduleMinutes(lifts);
  const minutes = localMinutes(feed.LastUpdate);
  const duringHours = !!schedule && minutes >= schedule[0] && minutes < schedule[1];
  const closedToday = duringHours && lifts.some((l) => l.StatusEnglish === 'closed' && localDate(l.UpdateDate) === date);
  const season = seasonOf(lifts, closedToday);
  const closed = feed.OperatingStatus === 'Closed' && season?.state === 'not_open';
  return {
    id,
    source: 'mtnpowder',
    fetchedAt: new Date(now).toISOString(),
    updatedAt: new Date(generated).toISOString(),
    hours: publishedHours(lifts),
    season,
    closures: closed ? { [date]: { code: 'closed.ops_report', params: [feed.Name], source: 'mtnpowder' } } : {},
    liftHolds: lifts
      .filter((l) => HOLD_STATUS[l.StatusEnglish] && localDate(l.UpdateDate) === date)
      .map((l) => ({ lift: l.Name, status: HOLD_STATUS[l.StatusEnglish], date, at: String(l.UpdateDate).slice(0, 16) })),
    grooming: trails
      .filter((t) => t.Grooming === 'Yes' && t.StatusEnglish === 'open' && generated - toMs(t.UpdateDate) <= GROOMED_WITHIN_MS && toMs(t.UpdateDate) <= generated)
      .map((t) => ({ trail: t.Name, at: String(t.UpdateDate).slice(0, 16) })),
    assumed: false,
  };
}

export async function cachedFeed(resortId) {
  const url = `https://mtnpowder.com/feed?resortId=${resortId}`;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(url);
  const hit = cache && (await cache.match(key));
  if (hit) return hit.json();
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`resort feed ${res.status}`);
  const body = await res.text();
  const feed = JSON.parse(body);
  if (cache) await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${FEED_TTL_S}` } }));
  return feed;
}

/** The status for a resort id: the labelled assumed one when no live feed covers it. */
export async function resortStatus(id, { live = LIVE_SOURCES, fetchFeed = cachedFeed, now = Date.now() } = {}) {
  const feedId = Object.hasOwn(MTNPOWDER_IDS, id) ? MTNPOWDER_IDS[id] : null;
  if (!feedId || !live.includes('mtnpowder')) return assumedStatus(id);
  return normaliseMtnpowder(id, await fetchFeed(feedId), now);
}

/** GET /api/resort-status/<id> as a Response; a failed feed is a 502 and is never cached. */
export async function statusResponse(id, deps) {
  const headers = { 'content-type': 'application/json' };
  try {
    return new Response(JSON.stringify(await resortStatus(id, deps)), { headers: { ...headers, 'cache-control': `public, max-age=${FEED_TTL_S}` } });
  } catch {
    return new Response(JSON.stringify({ error: 'The resort status service did not answer.' }), { status: 502, headers: { ...headers, 'cache-control': 'no-store' } });
  }
}
