// Ski weather from Open-Meteo (free, no API key). Two points are requested: summit and base,
// each at its real elevation, because conditions differ a lot over 2,000 vertical feet.
import { prefs } from './store.js';

const CACHE_MS = 20 * 60 * 1000;
const CURRENT = 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,snow_depth,snowfall';
const HOURLY = 'temperature_2m,apparent_temperature,snowfall,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code,visibility,freezing_level_height';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_min,snowfall_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset';

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
export async function loadWeather(place, force = false) {
  const key = 'weather:' + place.id;
  const hit = prefs.get(key, null);
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return { ...hit, cached: true };
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${place.lat},${place.baseLat ?? place.lat}&longitude=${place.lon},${place.baseLon ?? place.lon}`
    + `&elevation=${Math.round(place.top)},${Math.round(place.base)}`
    + `&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}`
    + `&timezone=${encodeURIComponent(place.tz)}&forecast_days=7&wind_speed_unit=ms`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.reason || 'Weather service error');
    const [summit, base] = Array.isArray(data) ? data : [data, data];
    const out = { at: Date.now(), summit, base };
    prefs.set(key, out);
    return out;
  } catch (e) {
    // Offline or the service is busy: fall back to the last forecast saved on the phone.
    if (hit) return { ...hit, cached: true, stale: true, error: e.message };
    throw e;
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
