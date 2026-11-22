import { LAPSE, cachedJson, codeFrom, inUS, windChill } from '../weather-util.js';

function isoDurH(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(s) || [];
  return Math.max(1, (+m[1] || 0) * 24 + (+m[2] || 0) + Math.round((+m[3] || 0) / 60));
}
function nwsSeries(prop, grid, spread = false, intervals = null, covered = null) {
  const out = new Array(grid.length).fill(null);
  for (const v of prop?.values || []) {
    const [start, dur] = v.validTime.split('/');
    const t0 = Date.parse(start), h = isoDurH(dur);
    for (let k = 0; k < h; k++) {
      const i = Math.round((t0 + k * 3600e3 - grid[0]) / 3600e3);
      if (i >= 0 && i < grid.length) {
        out[i] = v.value == null ? null : spread ? v.value / h : v.value;
        if (intervals) intervals[i] = h;
        if (covered && v.value != null) covered[i] = true;
      }
    }
  }
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

async function fetchPoint(lat, lon, alt, tz, grid) {
  const pt = await cachedJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, 86400);
  const g = (await cachedJson(pt.properties.forecastGridData, 3600)).properties;
  const dT = ((g.elevation?.value ?? alt) - alt) * LAPSE; // the grid cell's height is smoothed; correct to the real height
  const tempCovered = new Array(grid.length).fill(false);
  const temp = nwsSeries(g.temperature, grid, false, null, tempCovered).map((x) => (x == null ? null : x + dT));
  const feels = nwsSeries(g.apparentTemperature, grid).map((x) => (x == null ? null : x + dT));
  const wind = nwsSeries(g.windSpeed, grid).map((x) => (x ?? 0) / 3.6);
  const gust = nwsSeries(g.windGust, grid).map((x, i) => Math.max((x ?? 0) / 3.6, wind[i]));
  const dir = nwsSeries(g.windDirection, grid);
  const cloud = nwsSeries(g.skyCover, grid);
  const pop = nwsSeries(g.probabilityOfPrecipitation, grid);
  const qpf = nwsSeries(g.quantitativePrecipitation, grid, true);
  const snowIntervals = new Array(grid.length).fill(null);
  const snow = nwsSeries(g.snowfallAmount, grid, true, snowIntervals).map((mm) => (mm || 0) / 10);
  const vis = nwsSeries(g.visibility, grid);
  const snowLevel = nwsSeries(g.snowLevel, grid);
  const flags = nwsWeatherFlags(g.weather, grid);
  const hours = grid.map((_, i) => {
    const rain = snow[i] > 0.05 ? 0 : (qpf[i] || 0);
    return {
      t: temp[i], feels: feels[i] ?? windChill(temp[i], wind[i]), wind: wind[i], gust: gust[i], dir: dir[i] ?? 0, cloud: cloud[i] ?? 0,
      pop: pop[i], snow: snow[i], rain, vis: vis[i], frz: snowLevel[i], acc: snowIntervals[i] ?? 1, filled: !tempCovered[i] || snowIntervals[i] == null,
      code: codeFrom({ snowCm: snow[i], rainMm: rain, cloud: cloud[i] ?? 0, ...flags[i] }),
    };
  });
  const stamps = [g.updateTime, g.generatedAt].map((x) => Date.parse(x || '')).filter(Number.isFinite);
  return { hours, issued: stamps.length ? Math.max(...stamps) : NaN, gridElevation: g.elevation?.value ?? null };
}

export const nws = {
  id: 'nws',
  model: 'nws_ndfd',
  family: () => 'ncep_blend',
  covers: (lat, lon) => inUS(lat, lon),
  variables: ['temperature', 'feels', 'wind', 'gust', 'snow', 'rain', 'precipitation_probability', 'visibility', 'freezing_level', 'weather_code'],
  horizonHours: 168,
  nominalKm: () => 2.5,
  fetchPoint,
};
