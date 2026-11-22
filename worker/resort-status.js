import { LIVE_SOURCES, MTNPOWDER_IDS } from './resort-status-feeds.js';

const UA = 'weski-build';
const FEED_TTL_S = 300;
const STALE_MS = 36 * 3600e3;
const ACTIVE = new Set(['open', 'delayed', 'open_to_mid_station_only']);
const HOLD_STATUS = { delayed: 'delayed', open_to_mid_station_only: 'partial' };
const GROOMED_WITHIN_MS = 24 * 3600e3;

export const assumedStatus = (id) => ({ id, source: 'assumed', fetchedAt: null, hours: null, season: null, closures: {}, liftHolds: [], grooming: [], assumed: true });

const toMs = (s) => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));

function clockMinutes(text) {
  const m = /^(\d{1,2}):(\d\d)\s*([AP]M)$/i.exec(String(text || '').trim());
  return m ? ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2] : null;
}

/** The most common published lift schedule across all lifts and weekdays, as whole local hours (`to` exclusive). */
export function publishedHours(lifts) {
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
  if (!best) return null;
  const [open, close] = best[0].split('-').map(Number);
  const from = Math.ceil(open / 60), to = Math.floor(close / 60);
  return to - from >= 1 ? { from, to } : null;
}

function seasonOf(lifts) {
  if (!lifts.length) return null;
  const statuses = lifts.map((l) => l.StatusEnglish);
  if (statuses.some((s) => ACTIVE.has(s))) return { open: null, close: null, state: 'open' };
  return { open: null, close: null, state: statuses.every((s) => s === 'closed_for_season') ? 'closed_for_season' : 'not_open' };
}

/** A mtnpowder.com resort feed, as the resort's own app reads it, into the status shape the forecast reads. */
export function normaliseMtnpowder(id, feed, now = Date.now()) {
  const updated = toMs(feed?.LastUpdate);
  if (!feed || !Array.isArray(feed.MountainAreas) || !Number.isFinite(updated) || now - updated > STALE_MS) return assumedStatus(id);
  const date = feed.LastUpdate.slice(0, 10);
  const lifts = feed.MountainAreas.flatMap((a) => a.Lifts || []);
  const trails = feed.MountainAreas.flatMap((a) => a.Trails || []);
  const season = seasonOf(lifts);
  const closed = feed.OperatingStatus === 'Closed' && season && season.state === 'not_open';
  return {
    id,
    source: 'mtnpowder',
    fetchedAt: new Date(now).toISOString(),
    updatedAt: new Date(updated).toISOString(),
    hours: publishedHours(lifts),
    season,
    closures: closed ? { [date]: { code: 'closed.ops_report', params: [feed.Name], source: 'mtnpowder' } } : {},
    liftHolds: lifts.filter((l) => HOLD_STATUS[l.StatusEnglish]).map((l) => ({ lift: l.Name, status: HOLD_STATUS[l.StatusEnglish], date, at: String(l.UpdateDate || '').slice(0, 16) })),
    grooming: trails
      .filter((t) => t.Grooming === 'Yes' && t.StatusEnglish === 'open' && updated - toMs(t.UpdateDate) <= GROOMED_WITHIN_MS && toMs(t.UpdateDate) <= updated)
      .map((t) => ({ trail: t.Name, at: String(t.UpdateDate).slice(0, 16) })),
    assumed: false,
  };
}

async function cachedFeed(resortId) {
  const url = `https://mtnpowder.com/feed?resortId=${resortId}`;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(url);
  const hit = cache && (await cache.match(key));
  if (hit) return hit.json();
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`resort feed ${res.status}`);
  const body = await res.text();
  if (cache) await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${FEED_TTL_S}` } }));
  return JSON.parse(body);
}

/** GET /api/resort-status/<id> → the normalised status, or the labelled assumed one when no live feed covers the resort. */
export async function resortStatus(id, { live = LIVE_SOURCES, fetchFeed = cachedFeed, now = Date.now() } = {}) {
  const feedId = MTNPOWDER_IDS[id];
  if (!feedId || !live.includes('mtnpowder')) return assumedStatus(id);
  return normaliseMtnpowder(id, await fetchFeed(feedId), now);
}
