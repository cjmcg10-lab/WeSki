// Mountain weather from free sources licensed for commercial use, turned into the same shape the app already reads
// (Open-Meteo's field names and units: °C, cm of snow, mm of rain, m/s wind, m visibility, local "YYYY-MM-DDTHH:00").
//   USA: US National Weather Service (api.weather.gov), public domain.
//   Elsewhere: MET Norway Locationforecast (api.met.no), CC BY 4.0, credit "Weather data from MET Norway".
// One copy per mountain is shared by everyone through Cloudflare's cache, as both services ask.

const UA = 'SkiWithMe/1.0 (+https://skiwithme.builtbyroger.app/about)';
const LAPSE = 0.0065; // °C per metre, standard atmosphere
const HOURS = 7 * 24;

const inUS = (lat, lon) => (lat > 24 && lat < 50 && lon > -125 && lon < -66) || (lat > 51 && lat < 72 && lon > -170 && lon < -129);

/** Fetch JSON through Cloudflare's cache for ttl seconds (the upstream's own expiry when it is longer). */
async function cachedJson(url, ttl, headers = {}) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(url);
  const hit = cache && (await cache.match(key));
  if (hit) return hit.json();
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/geo+json, application/json', ...headers } });
  if (!res.ok) throw new Error(`weather source ${res.status}`);
  const body = await res.text();
  const exp = Date.parse(res.headers.get('expires') || '') || 0;
  const age = Math.max(ttl, Math.round((exp - Date.now()) / 1000));
  if (cache) await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${age}` } }));
  return JSON.parse(body);
}

// ---------- local time helpers
function localParts(ms, tz) {
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
const label = (ms, tz) => { const p = localParts(ms, tz); return `${p.date}T${String(p.hour).padStart(2, '0')}:00`; };

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
function codeFrom({ snowCm = 0, rainMm = 0, cloud = 0, fog = false, thunder = false, freezing = false, sleet = false }) {
  if (thunder) return 95;
  if (snowCm > 0.05 && !sleet) return snowCm >= 1.5 ? 75 : snowCm >= 0.3 ? 73 : 71;
  if (sleet) return 68;
  if (rainMm > 0.1) return freezing ? 66 : rainMm >= 2.5 ? 63 : 61;
  if (fog) return 45;
  return cloud < 20 ? 0 : cloud < 70 ? 2 : 3;
}
const SEVERITY = (c) => (c >= 95 ? 9 : c === 75 ? 8 : c === 73 ? 7 : c === 66 || c === 68 ? 6 : c === 63 ? 5 : c === 71 ? 4 : c === 61 ? 3 : c === 45 ? 2 : c);

/** Windchill (Environment Canada / NWS formula), °C, wind m/s. */
const windChill = (t, ms) => { const v = ms * 3.6; return t <= 10 && v > 4.8 ? 13.12 + 0.6215 * t - 11.37 * v ** 0.16 + 0.3965 * t * v ** 0.16 : t; };

// ---------- NWS: series of {validTime: "2026-11-20T12:00:00+00:00/PT6H", value} → value per hour
function isoDurH(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(s) || [];
  return Math.max(1, (+m[1] || 0) * 24 + (+m[2] || 0) + Math.round((+m[3] || 0) / 60));
}
function nwsSeries(prop, grid, spread = false) {
  const out = new Array(grid.length).fill(null);
  for (const v of prop?.values || []) {
    const [start, dur] = v.validTime.split('/');
    const t0 = Date.parse(start), h = isoDurH(dur);
    for (let k = 0; k < h; k++) {
      const i = Math.round((t0 + k * 3600e3 - grid[0]) / 3600e3);
      if (i >= 0 && i < grid.length) out[i] = v.value == null ? null : spread ? v.value / h : v.value;
    }
  }
  // hours before the first value (earlier today) take the first known value; gaps take the previous one
  const first = out.find((x) => x != null) ?? null;
  for (let i = 0, last = first; i < out.length; i++) { if (out[i] == null) out[i] = spread ? 0 : last; else last = out[i]; }
  return out;
}
function nwsWeatherFlags(prop, grid) {
  const out = grid.map(() => ({}));
  for (const v of prop?.values || []) {
    const [start, dur] = v.validTime.split('/');
    const t0 = Date.parse(start), h = isoDurH(dur);
    const types = (v.value || []).filter((w) => w.weather && w.coverage !== 'slight_chance' && w.coverage !== 'chance').map((w) => w.weather);
    for (let k = 0; k < h; k++) {
      const i = Math.round((t0 + k * 3600e3 - grid[0]) / 3600e3);
      if (i >= 0 && i < grid.length) out[i] = { thunder: types.includes('thunderstorms'), fog: types.some((x) => /fog/.test(x)), freezing: types.some((x) => /freezing/.test(x)), sleet: types.includes('sleet') };
    }
  }
  return out;
}

async function nwsPoint(lat, lon, alt, tz, grid) {
  const pt = await cachedJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, 86400);
  const g = (await cachedJson(pt.properties.forecastGridData, 3600)).properties;
  const dT = ((g.elevation?.value ?? alt) - alt) * LAPSE; // the grid cell's height is smoothed; correct to the real height
  const temp = nwsSeries(g.temperature, grid).map((x) => (x == null ? null : x + dT));
  const feels = nwsSeries(g.apparentTemperature, grid).map((x) => (x == null ? null : x + dT));
  const wind = nwsSeries(g.windSpeed, grid).map((x) => (x ?? 0) / 3.6);
  const gust = nwsSeries(g.windGust, grid).map((x, i) => Math.max((x ?? 0) / 3.6, wind[i]));
  const dir = nwsSeries(g.windDirection, grid);
  const cloud = nwsSeries(g.skyCover, grid);
  const pop = nwsSeries(g.probabilityOfPrecipitation, grid);
  const qpf = nwsSeries(g.quantitativePrecipitation, grid, true);
  const snow = nwsSeries(g.snowfallAmount, grid, true).map((mm) => (mm || 0) / 10);
  const vis = nwsSeries(g.visibility, grid);
  const snowLevel = nwsSeries(g.snowLevel, grid);
  const flags = nwsWeatherFlags(g.weather, grid);
  return grid.map((_, i) => {
    const rain = snow[i] > 0.05 ? 0 : (qpf[i] || 0);
    return {
      t: temp[i], feels: feels[i] ?? windChill(temp[i], wind[i]), wind: wind[i], gust: gust[i], dir: dir[i] ?? 0, cloud: cloud[i] ?? 0,
      pop: pop[i], snow: snow[i], rain, vis: vis[i], frz: snowLevel[i],
      code: codeFrom({ snowCm: snow[i], rainMm: rain, cloud: cloud[i] ?? 0, ...flags[i] }),
    };
  });
}

// ---------- MET Norway
const MET_CODE = (s, t, mm) => {
  const sym = (s || '').replace(/_(day|night|polartwilight)$/, '');
  const heavy = /^heavy/.test(sym), light = /^light/.test(sym);
  if (/thunder/.test(sym)) return { thunder: true };
  if (/snow/.test(sym)) return { snowCm: heavy ? Math.max(mm, 1.5) : light ? Math.min(mm, 0.29) || 0.1 : Math.max(mm, 0.3) };
  if (/sleet/.test(sym)) return { sleet: true };
  if (/rain/.test(sym)) return { rainMm: heavy ? Math.max(mm, 2.5) : Math.max(mm, 0.2), freezing: t < 0 };
  if (sym === 'fog') return { fog: true };
  return { cloud: sym === 'clearsky' ? 0 : sym === 'fair' ? 15 : sym === 'partlycloudy' ? 50 : 90 };
};
async function metPoint(lat, lon, alt, grid) {
  const m = await cachedJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&altitude=${Math.round(alt)}`, 3600);
  const ts = m.properties.timeseries.map((x) => ({ at: Date.parse(x.time), ...x.data }));
  return grid.map((h) => {
    let e = ts[0];
    for (const x of ts) { if (x.at <= h) e = x; else break; }
    const d = e.instant.details;
    // precipitation for this hour: the 1-hour block when there is one, else a sixth of the 6-hour block
    const one = e.at === h && e.next_1_hours;
    const blk = one ? e.next_1_hours : e.next_6_hours || e.next_12_hours || {};
    const mm = one ? (blk.details?.precipitation_amount ?? 0) : (blk.details?.precipitation_amount ?? 0) / 6;
    const t = d.air_temperature, wind = d.wind_speed ?? 0;
    const sym = blk.summary?.symbol_code || '';
    // snow from precipitation and temperature: 1 mm of water is about 1 cm of snow; sleet counts half
    const snow = /snow/.test(sym) || (mm > 0 && t <= 0) ? mm : /sleet/.test(sym) ? mm / 2 : 0;
    const rain = snow > 0 ? (/sleet/.test(sym) ? mm / 2 : 0) : mm;
    const pop = one ? e.next_1_hours.details?.probability_of_precipitation : e.next_6_hours?.details?.probability_of_precipitation;
    const fog = d.fog_area_fraction;
    const c = MET_CODE(sym, t, snow);
    return {
      // MET's own feels-like is for the model's height, not the summit's: work it out from the summit's temperature
      t, feels: windChill(t, wind), wind,
      // MET gives gusts near Scandinavia only; elsewhere they are estimated as 1.5 times the wind (a common gust factor)
      gust: d.wind_speed_of_gust ?? wind * 1.5, dir: d.wind_from_direction ?? 0, cloud: d.cloud_area_fraction ?? 0,
      pop: pop ?? null, snow, rain, vis: fog == null ? null : fog >= 50 ? 500 : fog >= 20 ? 3000 : 20000, frz: null,
      code: codeFrom({ cloud: d.cloud_area_fraction ?? 0, fog: fog >= 50, rainMm: rain, ...c, snowCm: snow > 0.05 ? snow : (c.snowCm ?? 0) }),
    };
  });
}

/** Turn hourly points into the Open-Meteo shape the app reads. */
export function shape(hours, grid, tz, lat, lon, now = Date.now()) {
  const time = grid.map((ms) => label(ms, tz));
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

/** GET /api/weather?lat&lon&blat&blon&top&base&tz → {source, summit, base} */
export async function weather(url) {
  const q = (k) => Number(url.searchParams.get(k));
  const lat = q('lat'), lon = q('lon'), top = q('top'), base = q('base');
  const blat = url.searchParams.has('blat') ? q('blat') : lat, blon = url.searchParams.has('blon') ? q('blon') : lon;
  const tz = url.searchParams.get('tz') || 'UTC';
  if (![lat, lon, top, base, blat, blon].every(Number.isFinite) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return { error: 'bad place', status: 400 };
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return { error: 'bad time zone', status: 400 }; }
  const grid = hourGrid(tz);
  let source = 'nws', sum, bas;
  try {
    if (!inUS(lat, lon)) throw new Error('outside the US');
    [sum, bas] = await Promise.all([nwsPoint(lat, lon, top, tz, grid), nwsPoint(blat, blon, base, tz, grid)]);
  } catch {
    source = 'met';
    [sum, bas] = await Promise.all([metPoint(lat, lon, top, grid), metPoint(blat, blon, base, grid)]);
  }
  fillFreezing(sum, bas, top, base);
  return { source, summit: shape(sum, grid, tz, lat, lon), base: shape(bas, grid, tz, blat, blon) };
}
