import { cachedJson, codeFrom, windChill } from './weather.js';

const OBSERVATION_HEADERS = { 'user-agent': 'weski-build' };
const HOUR = 3600e3;
const LOOKBACK_HOURS = 72;
export const STATION_MAX_KM = 25;
export const STATION_MAX_ELEVATION_M = 300;
const HEIGHT_COST_M_PER_KM = 50;
const TOTAL_WINDOWS = [[1, 'precipitationLastHour'], [3, 'precipitationLast3Hours'], [6, 'precipitationLast6Hours']];

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The nearest usable NWS station for a site: within STATION_MAX_KM and STATION_MAX_ELEVATION_M of its height. */
export function pickStation(stations, site) {
  let best = null;
  for (const f of stations?.features ?? []) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    const elevation = f.properties?.elevation?.value;
    const id = f.properties?.stationIdentifier;
    if (!id || ![lon, lat, elevation].every(Number.isFinite)) continue;
    const km = distanceKm(site, { lat, lon }), heightGap = Math.abs(elevation - site.alt);
    if (km > STATION_MAX_KM || heightGap > STATION_MAX_ELEVATION_M) continue;
    const cost = km + heightGap / HEIGHT_COST_M_PER_KM;
    if (!best || cost < best.cost) best = { id, km, heightGap, cost };
  }
  return best;
}

function speedMs(q) {
  if (q?.value == null) return null;
  const unit = String(q.unitCode || '');
  if (unit.includes('km_h')) return q.value / 3.6;
  if (unit.includes('kt') || unit.includes('knot')) return q.value * 0.514444;
  return q.value;
}

/**
 * Hourly liquid totals (mm) from observations that report the last 1, 3 or 6 hours. The finest total claims its hours first;
 * a longer total then only spreads what is left over the hours nobody claimed, so overlapping totals are never added twice.
 */
export function claimTotals(totals) {
  const claimed = new Map();
  const ordered = [...totals].sort((a, b) => a.hours - b.hours || b.end - a.end);
  for (const { hours, end, mm } of ordered) {
    const window = Array.from({ length: hours }, (_, k) => end - (hours - k) * HOUR);
    const free = window.filter((h) => !claimed.has(h));
    if (!free.length) continue;
    const taken = window.reduce((sum, h) => sum + (claimed.get(h) ?? 0), 0);
    const each = Math.max(0, mm - taken) / free.length;
    for (const h of free) claimed.set(h, each);
  }
  return claimed;
}

const weatherTypes = (p) => (p.presentWeather ?? []).map((w) => w.weather).filter(Boolean);

/** NWS observations into hourly history rows. `snow` is null for an hour where the station reported no precipitation total. */
export function observationRows(features, station) {
  const latest = new Map();
  const totals = [];
  for (const { properties: p } of features ?? []) {
    const at = Date.parse(p?.timestamp);
    if (!Number.isFinite(at)) continue;
    const hour = Math.floor(at / HOUR) * HOUR;
    if (!latest.has(hour) || at > latest.get(hour).at) latest.set(hour, { at, p });
    for (const [hours, key] of TOTAL_WINDOWS) {
      const mm = p[key]?.value;
      if (mm != null) totals.push({ hours, end: Math.round(at / HOUR) * HOUR, mm });
    }
  }
  const liquid = claimTotals(totals);
  const rows = [];
  for (const [ms, { at, p }] of [...latest].sort((a, b) => a[0] - b[0])) {
    const t = p.temperature?.value, wind = speedMs(p.windSpeed);
    if (t == null || wind == null) continue;
    const types = weatherTypes(p);
    const snowing = types.some((x) => /snow|ice_pellets/.test(x));
    const raining = types.some((x) => /rain|drizzle/.test(x));
    const mm = liquid.has(ms) ? liquid.get(ms) : null;
    const snowType = snowing || (t <= 0 && !raining);
    const snow = mm == null ? null : snowType ? mm : 0;
    const rainMm = mm == null ? (raining ? 0.2 : 0) : snowType ? 0 : mm;
    rows.push({
      ms, t, feels: windChill(t, wind), snow, wind, gust: Math.max(wind, speedMs(p.windGust) ?? wind), vis: p.visibility?.value ?? null,
      code: codeFrom({ snowCm: snow ?? (snowing ? 0.1 : 0), rainMm, fog: types.some((x) => /fog/.test(x)), thunder: types.includes('thunderstorms'), freezing: types.some((x) => /freezing/.test(x)), sleet: types.includes('sleet') }),
      acc: 1, issued: at, src: 'nws-obs', model: `obs:${station}`,
    });
  }
  return rows;
}

/** Recent observations from the nearest suitable NWS station for a site, or `{ station: null, rows: [] }` when none is close enough. */
export async function siteObservations(site, now = Date.now(), fetchJson = cachedJson) {
  const point = await fetchJson(`https://api.weather.gov/points/${site.lat.toFixed(4)},${site.lon.toFixed(4)}`, 86400, OBSERVATION_HEADERS);
  const stations = await fetchJson(point.properties.observationStations, 86400, OBSERVATION_HEADERS);
  const station = pickStation(stations, site);
  if (!station) return { station: null, rows: [] };
  const start = new Date(Math.floor((now - LOOKBACK_HOURS * HOUR) / HOUR) * HOUR).toISOString();
  const observations = await fetchJson(`https://api.weather.gov/stations/${station.id}/observations?start=${start}&limit=500`, 900, OBSERVATION_HEADERS);
  return { station, rows: observationRows(observations.features, station.id).filter((r) => r.ms <= now) };
}
