import { RESORT_RE } from './evidence.js';
import { forecastRows, pendingRows } from './history.js';
import { resortPlace } from './catalog.js';
import { siteObservations } from './observations.js';
import { forecast, placeFrom } from './weather.js';
import { ensembleForResponse, hasEnsemble } from './meteoswiss.js';

const RECORD_GATE_S = 1800;
const FRESH_CACHE = 'public, max-age=900';
const STALE_CACHE = 'public, max-age=60';
const HISTORY_CACHE = 'public, max-age=300';

const respond = (data, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
const store = (env, id) => env.FORECASTHIST.get(env.FORECASTHIST.idFromName(id));
export const ENSEMBLE_STORE = '_meteoswiss';
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

/** The weather request is for exactly the listed place, as the app sends it: same points and time zone, heights rounded to metres. */
export function samePlace(listed, asked) {
  return ['lat', 'lon', 'blat', 'blon', 'tz'].every((k) => listed[k] === asked[k])
    && Math.round(listed.top) === asked.top && Math.round(listed.base) === asked.base;
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
    const history = store(env, listed.id);
    if (!(await history.due(now))) {
      await closeGate(listed.id, now);
      return;
    }
    const tag = { issuedMs: issuedAt, source: result.source, model: result.model, now };
    const observing = result.source === 'nws';
    const [summitObs, baseObs] = await Promise.all([
      observing ? observationsFor({ lat, lon, alt: top }, now, observe) : [],
      observing ? observationsFor({ lat: blat, lon: blon, alt: base }, now, observe) : [],
    ]);
    const weather = { ...result };
    delete weather.hours;
    const outcome = await history.record({
      id: listed.id, place: listed.place, source: result.source, model: result.model, issuedAt, fetchedAt: Date.parse(result.fetchedAt), ms0: grid[0],
      forecast: { summit: forecastRows(summit, grid, tag), base: forecastRows(basePoints, grid, tag) }, observed: { summit: summitObs, base: baseObs }, weather,
      pending: observing ? undefined : { summit: pendingRows(summit, grid, tag), base: pendingRows(basePoints, grid, tag) },
    }, now);
    if (outcome.recorded) await closeGate(listed.id, now);
  } catch (e) {
    console.error('history capture failed', { id, message: e.message });
  }
}

async function lastGood(env, id, now) {
  try {
    const last = await store(env, id).lastGood(now);
    return last && { ...last, alerts: [] };
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
  const ensemble = id && hasEnsemble(id) ? await ensembleFor(env, id, url, now, resolve) : null;
  if (ensemble) out.ensemble = ensemble;
  return respond(out, 200, FRESH_CACHE);
}

/** MeteoSwiss ranges for days 6 to 8 (issue #57): only for a Swiss resort on the list, asked for its own listed place. */
async function ensembleFor(env, id, url, now, resolve) {
  try {
    const listed = await resolve(env, id, now);
    if (!listed || !hasEnsemble(listed.id) || !samePlace(listed.place, placeFrom(url))) return null;
    const record = await store(env, ENSEMBLE_STORE).ensembleFor(listed.id, now);
    return record ? ensembleForResponse(record, listed.place.tz) : null;
  } catch (e) {
    console.error('ensemble read failed', { id, message: e.message });
    return null;
  }
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
