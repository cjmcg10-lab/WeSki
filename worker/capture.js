import { RESORT_RE } from './evidence.js';
import { forecastRows } from './history.js';
import { resortPlace } from './catalog.js';
import { distanceKm, siteObservations } from './observations.js';
import { forecast, placeFrom } from './weather.js';

const RECORD_GATE_S = 1800;
export const PLACE_TOLERANCE_KM = 5;
export const HEIGHT_TOLERANCE_M = 250;
const FRESH_CACHE = 'public, max-age=900';
const STALE_CACHE = 'public, max-age=60';
const HISTORY_CACHE = 'public, max-age=300';

const respond = (data, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
const store = (env, id) => env.FORECASTHIST.get(env.FORECASTHIST.idFromName(id));
const watchedId = (url) => (RESORT_RE.test(url.searchParams.get('id') || '') ? url.searchParams.get('id') : null);

const gateKey = (id, now) => new Request(`https://history.invalid/gate/${id}/${Math.floor(now / (RECORD_GATE_S * 1000))}`);
const edgeCache = () => (typeof caches !== 'undefined' ? caches.default : null);

async function gateClosed(id, now) {
  const cache = edgeCache();
  return Boolean(cache && (await cache.match(gateKey(id, now))));
}

async function closeGate(id, now) {
  await edgeCache()?.put(gateKey(id, now), new Response('1', { headers: { 'cache-control': `max-age=${RECORD_GATE_S}` } }));
}

/** The weather request is for the listed resort: same area, same heights, same time zone. */
export function samePlace(listed, asked) {
  return distanceKm(listed, asked) <= PLACE_TOLERANCE_KM
    && distanceKm({ lat: listed.blat, lon: listed.blon }, { lat: asked.blat, lon: asked.blon }) <= PLACE_TOLERANCE_KM
    && Math.abs(listed.top - asked.top) <= HEIGHT_TOLERANCE_M && Math.abs(listed.base - asked.base) <= HEIGHT_TOLERANCE_M
    && listed.tz === asked.tz;
}

async function observationsFor(site, now, observe) {
  try {
    return (await observe(site, now)).rows;
  } catch (e) {
    console.error('observations failed', { message: e.message });
    return [];
  }
}

async function capture(env, id, url, result, now, observe, resolve) {
  try {
    const listed = await resolve(env, id, now);
    if (!listed || !samePlace(listed.place, placeFrom(url))) return;
    if (await gateClosed(listed.id, now)) return;
    const { lat, lon, top, base, blat, blon } = listed.place;
    const { grid, summit, base: basePoints } = result.hours;
    const issuedAt = Date.parse(result.issuedAt);
    const tag = { issuedMs: issuedAt, source: result.source, model: result.model, now };
    const observing = result.source === 'nws';
    const [summitObs, baseObs] = await Promise.all([
      observing ? observationsFor({ lat, lon, alt: top }, now, observe) : [],
      observing ? observationsFor({ lat: blat, lon: blon, alt: base }, now, observe) : [],
    ]);
    const weather = { ...result };
    delete weather.hours;
    const outcome = await store(env, listed.id).record({
      id: listed.id, place: listed.place, source: result.source, model: result.model, issuedAt, fetchedAt: Date.parse(result.fetchedAt), ms0: grid[0],
      forecast: { summit: forecastRows(summit, grid, tag), base: forecastRows(basePoints, grid, tag) }, observed: { summit: summitObs, base: baseObs }, weather,
    }, now);
    if (outcome.recorded) await closeGate(listed.id, now);
  } catch (e) {
    console.error('history capture failed', { id, message: e.message });
  }
}

async function lastGood(env, id, now) {
  try {
    return await store(env, id).lastGood(now);
  } catch (e) {
    console.error('last good forecast unavailable', { id, message: e.message });
    return null;
  }
}

/**
 * GET /api/weather. With `&id=<resort id>` of a resort on the server-side list (and a request for that resort's own place)
 * the forecast also feeds that resort's 72 hour history and archive. With `&stale=1` as well, when no source answers the
 * last good forecast is served, labelled stale with its age; without it the answer is a 502 as before.
 */
export async function weatherResponse(url, env, ctx, { forecastFn = forecast, observe = siteObservations, now = Date.now(), resolve = resortPlace } = {}) {
  const id = watchedId(url);
  let result;
  try {
    result = await forecastFn(url, now);
  } catch (e) {
    console.error('weather source failed', { id, message: e.message });
    const stale = id && url.searchParams.get('stale') === '1' ? await staleFor(env, id, url, now, resolve) : null;
    return stale ? respond(stale, 200, STALE_CACHE) : respond({ error: 'The weather service did not answer.' }, 502);
  }
  if (result.error) return respond({ error: result.error }, result.status);
  if (id) ctx.waitUntil(capture(env, id, url, result, now, observe, resolve));
  const out = { ...result };
  delete out.hours;
  return respond(out, 200, FRESH_CACHE);
}

async function staleFor(env, id, url, now, resolve) {
  const listed = await resolve(env, id, now);
  const asked = placeFrom(url);
  return listed && !asked.error && samePlace(listed.place, asked) ? lastGood(env, listed.id, now) : null;
}

/** GET /api/history/<id>: the last 72 hours kept for a listed resort, in `/api/weather`'s shape. */
export async function historyResponse(id, env, now = Date.now(), resolve = resortPlace) {
  const listed = await resolve(env, id, now);
  if (!listed) return respond({ error: 'No history for this resort yet.' }, 404);
  try {
    const history = await store(env, listed.id).history(now);
    return history ? respond({ id: listed.id, ...history }, 200, HISTORY_CACHE) : respond({ error: 'No history for this resort yet.' }, 404);
  } catch (e) {
    console.error('history read failed', { id, message: e.message });
    return respond({ error: 'The history service did not answer.' }, 502);
  }
}
