// Mountain weather from free sources licensed for commercial use, turned into the same shape the app already reads
// (Open-Meteo's field names and units: °C, cm of snow, mm of rain, m/s wind, m visibility, local "YYYY-MM-DDTHH:00").
// Each source is an adapter (see worker/sources/): the US National Weather Service (public domain) where it covers the place,
// MET Norway Locationforecast (CC BY 4.0) everywhere else. Alert services (NWS, Environment Canada, MET Norway) add warnings.
// One copy per mountain is shared by everyone through Cloudflare's cache, as the services ask.

import { HOURS, LAPSE, hourGrid, hourLabel, sunTimes } from './weather-util.js';
import { adapterById, routeForecast } from './sources/index.js';
import { alertsFor } from './sources/alerts.js';

export { cachedJson, codeFrom, hourGrid, hourLabel, inUS, sunTimes, windChill } from './weather-util.js';
export { FORECAST_ADAPTERS, independentFamilies, routeForecast } from './sources/index.js';

const SEVERITY = (c) => (c >= 95 ? 9 : c === 75 ? 8 : c === 73 ? 7 : c === 66 || c === 68 ? 6 : c === 63 ? 5 : c === 71 ? 4 : c === 61 ? 3 : c === 45 ? 2 : c);

/** Turn hourly points into the Open-Meteo shape the app reads. */
export function shape(hours, grid, tz, lat, lon, now = Date.now()) {
  const time = grid.map((ms) => hourLabel(ms, tz));
  const ci = Math.max(0, Math.min(hours.length - 1, Math.floor((now - grid[0]) / 3600e3)));
  const H = (k) => hours.map((h) => h[k]);
  const dates = [...new Set(time.map((x) => x.slice(0, 10)))].slice(0, 7);
  const daily = { time: dates, weather_code: [], temperature_2m_max: [], temperature_2m_min: [], apparent_temperature_min: [], snowfall_sum: [], rain_sum: [], precipitation_probability_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], sunrise: [], sunset: [] };
  for (const day of dates) {
    const idx = time.map((x, i) => (x.startsWith(day) ? i : -1)).filter((i) => i >= 0);
    const hs = idx.map((i) => hours[i]), skiHours = idx.filter((i) => { const h = +time[i].slice(11, 13); return h >= 8 && h <= 16; }).map((i) => hours[i]);
    const num = (a) => a.filter((x) => x != null && !Number.isNaN(x));
    const pops = num(hs.map((h) => h.pop));
    daily.weather_code.push((skiHours.length ? skiHours : hs).reduce((b, h) => (SEVERITY(h.code) > SEVERITY(b) ? h.code : b), 0));
    daily.temperature_2m_max.push(Math.max(...num(hs.map((h) => h.t))));
    daily.temperature_2m_min.push(Math.min(...num(hs.map((h) => h.t))));
    daily.apparent_temperature_min.push(Math.min(...num(hs.map((h) => h.feels))));
    daily.snowfall_sum.push(hs.reduce((n, h) => n + (h.snow || 0), 0));
    daily.rain_sum.push(hs.reduce((n, h) => n + (h.rain || 0), 0));
    daily.precipitation_probability_max.push(pops.length ? Math.max(...pops) : null);
    daily.wind_speed_10m_max.push(Math.max(...hs.map((h) => h.wind || 0)));
    daily.wind_gusts_10m_max.push(Math.max(...hs.map((h) => h.gust || 0)));
    const [rise, set] = sunTimes(day, lat, lon, tz);
    daily.sunrise.push(rise); daily.sunset.push(set);
  }
  const c = hours[ci];
  return {
    current: { time: time[ci], temperature_2m: c.t, apparent_temperature: c.feels, weather_code: c.code, wind_speed_10m: c.wind, wind_gusts_10m: c.gust, wind_direction_10m: c.dir, cloud_cover: Math.round(c.cloud), snow_depth: null, snowfall: c.snow },
    hourly: { time, temperature_2m: H('t'), apparent_temperature: H('feels'), snowfall: H('snow'), precipitation_probability: H('pop'), wind_speed_10m: H('wind'), wind_gusts_10m: H('gust'), weather_code: H('code'), visibility: H('vis'), freezing_level_height: H('frz') },
    daily,
  };
}

/** Freezing level from the summit and base temperatures (where the 0 °C line falls between or beyond them). */
export function fillFreezing(sum, bas, top, base) {
  for (let i = 0; i < sum.length; i++) {
    if (sum[i].frz != null && bas[i].frz != null) continue;
    const ts = sum[i].t, tb = bas[i].t;
    let f = null;
    if (ts != null && tb != null) {
      const rate = top > base + 50 && tb - ts > 0.5 ? (tb - ts) / (top - base) : LAPSE;
      f = Math.max(0, Math.round(base + tb / rate));
    }
    sum[i].frz = sum[i].frz ?? f; bas[i].frz = bas[i].frz ?? f;
  }
}

const toIso = (ms) => new Date(ms).toISOString();

/** Nominal grid spacing of the model behind a source at a place: the US grid and MET's Nordic model are fine, MET's global model elsewhere is coarse. */
export const resolutionKm = (source, lat, lon) => adapterById(source).nominalKm(lat, lon);

export function placeFrom(url) {
  const q = (k) => (url.searchParams.get(k) ? Number(url.searchParams.get(k)) : NaN);
  const lat = q('lat'), lon = q('lon'), top = q('top'), base = q('base');
  const blat = url.searchParams.has('blat') ? q('blat') : lat, blon = url.searchParams.has('blon') ? q('blon') : lon;
  const tz = url.searchParams.get('tz') || 'UTC';
  if (![lat, lon, top, base, blat, blon].every(Number.isFinite) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return { error: 'bad place', status: 400 };
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return { error: 'bad time zone', status: 400 }; }
  return { lat, lon, top, base, blat, blon, tz };
}

const localAlert = (a, tz) => ({ event: a.event, level: a.level, from: hourLabel(a.from, tz), to: hourLabel(a.to, tz), source: a.source });

async function fetchHours(candidates, { lat, lon, top, base, blat, blon, tz }, grid) {
  let failure = new Error('no weather source');
  for (const adapter of candidates) {
    try {
      const [sum, bas] = await Promise.all([adapter.fetchPoint(lat, lon, top, tz, grid), adapter.fetchPoint(blat, blon, base, tz, grid)]);
      return { adapter, sum, bas };
    } catch (e) {
      failure = e;
    }
  }
  throw failure;
}

/** The forecast plus the raw hourly points (`hours`) the history store records. */
export async function forecast(url, now = Date.now()) {
  const place = placeFrom(url);
  if (place.error) return place;
  const { lat, lon, top, base, blat, blon, tz } = place;
  const grid = hourGrid(tz, now);
  const [{ adapter, sum, bas }, alerts] = await Promise.all([
    fetchHours(routeForecast({ lat, lon, alt: top, leadHours: HOURS }), place, grid),
    alertsFor(lat, lon),
  ]);
  fillFreezing(sum.hours, bas.hours, top, base);
  const issued = Math.min(...[sum.issued, bas.issued].filter(Number.isFinite), now);
  return {
    source: adapter.id,
    model: adapter.model,
    family: adapter.family(lat, lon),
    issuedAt: toIso(issued),
    fetchedAt: toIso(now),
    ageHours: Math.round(Math.max(0, now - issued) / 360e3) / 10,
    stale: false,
    resolutionKm: adapter.nominalKm(lat, lon),
    gridElevation: { summit: sum.gridElevation, base: bas.gridElevation },
    alerts: alerts.map((a) => localAlert(a, tz)),
    summit: shape(sum.hours, grid, tz, lat, lon, now),
    base: shape(bas.hours, grid, tz, blat, blon, now),
    hours: { grid, summit: sum.hours, base: bas.hours },
  };
}

/** GET /api/weather?lat&lon&blat&blon&top&base&tz → the forecast without its raw hourly points */
export async function weather(url) {
  const out = { ...(await forecast(url)) };
  delete out.hours;
  return out;
}
