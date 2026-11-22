import { RESORT_RE } from './evidence.js';
import { forecastRows } from './history.js';
import { siteObservations } from './observations.js';
import { forecast, placeFrom } from './weather.js';

const RECORD_GATE_S = 1800;
const FRESH_CACHE = 'public, max-age=900';
const STALE_CACHE = 'public, max-age=60';
const HISTORY_CACHE = 'public, max-age=300';

const respond = (data, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
const store = (env, id) => env.FORECASTHIST.get(env.FORECASTHIST.idFromName(id));
const watchedId = (url) => (RESORT_RE.test(url.searchParams.get('id') || '') ? url.searchParams.get('id') : null);

/** True at most once per resort per RECORD_GATE_S, so busy resorts cost one history write a half hour. */
async function openGate(id, now) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (!cache) return true;
  const key = new Request(`https://history.invalid/gate/${id}/${Math.floor(now / (RECORD_GATE_S * 1000))}`);
  if (await cache.match(key)) return false;
  await cache.put(key, new Response('1', { headers: { 'cache-control': `max-age=${RECORD_GATE_S}` } }));
  return true;
}

async function observationsFor(site, now, observe) {
  try {
    return (await observe(site, now)).rows;
  } catch (e) {
    console.error('observations failed', { message: e.message });
    return [];
  }
}

async function capture(env, id, url, result, now, observe) {
  try {
    if (!(await openGate(id, now))) return;
    const { lat, lon, top, base, blat, blon, tz } = placeFrom(url);
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
    await store(env, id).record({
      id, place: { lat, lon, top, base, blat, blon, tz }, source: result.source, model: result.model, issuedAt, fetchedAt: Date.parse(result.fetchedAt), ms0: grid[0],
      forecast: { summit: forecastRows(summit, grid, tag), base: forecastRows(basePoints, grid, tag) }, observed: { summit: summitObs, base: baseObs }, weather,
    }, now);
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
 * GET /api/weather. With `&id=<resort id>` the forecast also feeds that resort's 72 hour history and archive (never for
 * a resort nobody asks about), and when no source answers the last good forecast is served, labelled stale with its age.
 */
export async function weatherResponse(url, env, ctx, { forecastFn = forecast, observe = siteObservations, now = Date.now() } = {}) {
  const id = watchedId(url);
  let result;
  try {
    result = await forecastFn(url, now);
  } catch (e) {
    console.error('weather source failed', { id, message: e.message });
    const stale = id ? await lastGood(env, id, now) : null;
    return stale ? respond(stale, 200, STALE_CACHE) : respond({ error: 'The weather service did not answer.' }, 502);
  }
  if (result.error) return respond({ error: result.error }, result.status);
  if (id) ctx.waitUntil(capture(env, id, url, result, now, observe));
  const out = { ...result };
  delete out.hours;
  return respond(out, 200, FRESH_CACHE);
}

/** GET /api/history/<id>: the last 72 hours kept for a resort, in `/api/weather`'s shape. */
export async function historyResponse(id, env, now = Date.now()) {
  try {
    const history = await store(env, id).history(now);
    return history ? respond({ id, ...history }, 200, HISTORY_CACHE) : respond({ error: 'No history for this resort yet.' }, 404);
  } catch (e) {
    console.error('history read failed', { id, message: e.message });
    return respond({ error: 'The history service did not answer.' }, 502);
  }
}
