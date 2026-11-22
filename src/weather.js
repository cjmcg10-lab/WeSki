// Ski weather through our server (/api/weather): the US National Weather Service in the USA, MET Norway elsewhere,
// both free for commercial use. Two points are requested: summit and base, each at its real elevation, because
// conditions differ a lot over 2,000 vertical feet. The server returns Open-Meteo's field names and units.
import { prefs } from './store.js';

const CACHE_MS = 20 * 60 * 1000;

/** WMO weather code -> [label, glyph] */
export function describeCode(c) {
  if (c === 0) return ['Clear', '☀'];
  if (c <= 2) return ['Partly cloudy', '⛅'];
  if (c === 3) return ['Overcast', '☁'];
  if (c === 45 || c === 48) return ['Fog', '≋'];
  if (c >= 51 && c <= 57) return [c >= 56 ? 'Freezing drizzle' : 'Drizzle', '☂'];
  if (c >= 61 && c <= 67) return [c >= 66 ? 'Freezing rain' : 'Rain', '☂'];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return [c === 75 || c === 86 ? 'Heavy snow' : c === 71 ? 'Light snow' : 'Snow', '❄'];
  if (c >= 80 && c <= 82) return ['Rain showers', '☂'];
  if (c >= 95) return ['Thunderstorm', '⚡'];
  return ['Mixed', '☁'];
}

/**
 * place: {lat, lon, top (m), base (m), tz}. Returns {at, cached, summit, base} where each of
 * summit/base is the raw Open-Meteo object (metric units: °C, cm snowfall, m/s wind, m depth).
 */
export async function loadWeather(place, force = false, { allowStale = false } = {}) {
  const key = 'weather2:' + place.id;
  const hit = prefs.get(key, null);
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return { ...hit, cached: true };
  const url = `/api/weather?lat=${place.lat}&lon=${place.lon}&blat=${place.baseLat ?? place.lat}&blon=${place.baseLon ?? place.lon}`
    + `&top=${Math.round(place.top)}&base=${Math.round(place.base)}&tz=${encodeURIComponent(place.tz)}`
    + (/^[a-z0-9-]{2,40}$/.test(place.id || '') ? `&id=${place.id}` : '')
    + (allowStale ? '&stale=1' : '');
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.reason || 'Weather service error');
    const out = {
      at: Date.now(), source: data.source, summit: data.summit, base: data.base,
      model: data.model, issuedAt: data.issuedAt, ageHours: data.ageHours, stale: data.stale, resolutionKm: data.resolutionKm, gridElevation: data.gridElevation, alerts: data.alerts ?? [],
    };
    if (!data.stale) prefs.set(key, out);
    return out;
  } catch (e) {
    // Offline or the service is busy: fall back to the last forecast saved on the phone.
    if (hit) return { ...hit, cached: true, stale: true, error: e.message };
    throw e;
  }
}

const historyKey = (id) => `history1:${id}`;
const NONE_MS = 2 * 60 * 1000;
const hasHours = (site) => Array.isArray(site?.hourly?.time);
const historyId = (place) => (/^[a-z0-9-]{2,40}$/.test(place.id || '') && !place.id.startsWith('pin-') ? place.id : null);

/** The history kept on the phone for a place if it is under 20 minutes old: `{ at, data }`, where `data` is null when the server has none yet. */
export function savedHistory(place, now = Date.now()) {
  const id = historyId(place);
  const hit = id ? prefs.get(historyKey(id), null) : null;
  return hit && now - hit.at < (hit.ttl ?? CACHE_MS) ? hit : null;
}

/** The server's 72 hour history for a listed resort (`/api/history/<id>`), or null: offline, a pin, none recorded yet or any failure. */
export async function loadHistory(place, force = false, now = Date.now()) {
  const id = historyId(place);
  if (!id || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  const hit = force ? null : savedHistory(place, now);
  if (hit) return hit.data;
  try {
    const res = await fetch(`/api/history/${id}`);
    if (res.status === 404) {
      prefs.set(historyKey(id), { at: now, data: null, ttl: NONE_MS });
      return null;
    }
    const body = await res.json();
    if (!res.ok || body.error || !hasHours(body.summit) || !hasHours(body.base)) throw new Error('History service error');
    const data = { summit: body.summit, base: body.base };
    prefs.set(historyKey(id), { at: now, data });
    return data;
  } catch {
    return null;
  }
}

/** Index of the current hour in an hourly block (times are local to the resort). */
export function hourIndex(w) {
  const now = w.current?.time?.slice(0, 13);
  const i = w.hourly.time.findIndex((t) => t.slice(0, 13) === now);
  return i < 0 ? 0 : i;
}

/** Short, plain alerts that matter on the hill. Inputs in metric. */
export function skiNotes(day, cur, fmtSnow = (cm) => `${Math.round(cm)} cm`) {
  const notes = [];
  if (day.snow >= 15) notes.push(['good', `Powder day: about ${fmtSnow(day.snow)} of new snow.`]);
  else if (day.snow >= 5) notes.push(['good', `Fresh snow: about ${fmtSnow(day.snow)}.`]);
  if (day.rain >= 1) notes.push(['bad', 'Rain in the forecast — expect wet or icy surfaces.']);
  if (day.gust >= 22) notes.push(['bad', 'Very strong gusts: wind holds on upper lifts and the tram are likely.']);
  else if (day.gust >= 15) notes.push(['warn', 'Gusty: wind holds on exposed lifts are possible.']);
  if (day.feelsMin <= -26) notes.push(['bad', 'Dangerous wind chill: frostbite on exposed skin within minutes. Cover up.']);
  else if (day.feelsMin <= -18) notes.push(['warn', 'Very cold wind chill: cover exposed skin.']);
  if (day.tMax >= 3 && day.tMin <= -2) notes.push(['warn', 'Freeze–thaw: firm early, softening later.']);
  else if (day.tMin >= 2) notes.push(['warn', 'Above freezing all day: soft, spring-like snow.']);
  if (cur && cur.vis != null && cur.vis < 1000) notes.push(['warn', 'Low visibility: stick to tree-lined trails.']);
  if (!notes.length) notes.push(['good', 'No weather concerns for skiing.']);
  return notes;
}
