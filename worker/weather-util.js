export const UA = 'weski-build';
export const LAPSE = 0.0065; // °C per metre, standard atmosphere
export const HOURS = 7 * 24;
const FETCH_TIMEOUT_MS = 8000;

export const inUS = (lat, lon) => (lat > 24 && lat < 50 && lon > -125 && lon < -66) || (lat > 51 && lat < 72 && lon > -170 && lon < -129);
export const inCanada = (lat, lon) => lat > 41.5 && lat < 84 && lon > -141 && lon < -52;
export const inNordics = (lat, lon) => lat > 54 && lat < 72 && lon > 3 && lon < 32;
export const inNorway = (lat, lon) => lat > 57.5 && lat < 72 && lon > 4 && lon < 31.5;

/** Fetch JSON through Cloudflare's cache for ttl seconds (the upstream's own expiry when it is longer). */
export async function cachedJson(url, ttl, headers = {}) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(url);
  const hit = cache && (await cache.match(key));
  if (hit) return hit.json();
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/geo+json, application/json', ...headers }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`weather source ${res.status}`);
  const body = await res.text();
  const exp = Date.parse(res.headers.get('expires') || '') || 0;
  const age = Math.max(ttl, Math.round((exp - Date.now()) / 1000));
  if (cache) await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${age}` } }));
  return JSON.parse(body);
}

// ---------- local time helpers
export function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, min: p.minute };
}
/** UTC start times (ms) of each hour from local midnight today, for 7 days. */
export function hourGrid(tz, now = Date.now()) {
  let t = Math.floor(now / 3600e3) * 3600e3;
  for (let i = 0; i < 30 && localParts(t, tz).hour !== 0; i++) t -= 3600e3;
  return Array.from({ length: HOURS }, (_, i) => t + i * 3600e3);
}
export const hourLabel = (ms, tz) => { const p = localParts(ms, tz); return `${p.date}T${String(p.hour).padStart(2, '0')}:00`; };

/** Sunrise and sunset (NOAA's simple formula, about a minute's accuracy) as local "YYYY-MM-DDTHH:MM". */
export function sunTimes(dateStr, lat, lon, tz) {
  const d0 = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
  const n = Math.round((d0 - Date.UTC(+dateStr.slice(0, 4), 0, 1)) / 864e5) + 1;
  const g = (2 * Math.PI / 365) * (n - 1 + 0.5);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = lat * Math.PI / 180;
  const c = (Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(dec))) - Math.tan(la) * Math.tan(dec);
  const ha = Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  const fmt = (mins) => { const ms = d0 + mins * 60e3; const p = localParts(ms, tz); return `${p.date}T${String(p.hour).padStart(2, '0')}:${p.min}`; };
  return [fmt(720 - 4 * (lon + ha) - eq), fmt(720 - 4 * (lon - ha) - eq)];
}

// ---------- weather codes (WMO, as the app's describeCode reads them)
export function codeFrom({ snowCm = 0, rainMm = 0, cloud = 0, fog = false, thunder = false, freezing = false, sleet = false }) {
  if (thunder) return 95;
  if (snowCm > 0.05 && !sleet) return snowCm >= 1.5 ? 75 : snowCm >= 0.3 ? 73 : 71;
  if (sleet) return 68;
  if (rainMm > 0.1) return freezing ? 66 : rainMm >= 2.5 ? 63 : 61;
  if (fog) return 45;
  return cloud < 20 ? 0 : cloud < 70 ? 2 : 3;
}

/** Windchill (Environment Canada / NWS formula), °C, wind m/s. */
export const windChill = (t, ms) => { const v = ms * 3.6; return t <= 10 && v > 4.8 ? 13.12 + 0.6215 * t - 11.37 * v ** 0.16 + 0.3965 * t * v ** 0.16 : t; };
