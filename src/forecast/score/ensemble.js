// Ensemble ranges for days 6 to 8 (version 1.8.0, issue #57; docs/FORECAST_SCORING.md "Ranges").
//
// `/api/weather` adds `ensemble` for Swiss resorts: MeteoSwiss local forecasts for whole local days from day 6 on, each
// hour with a central value and the 10% and 90% quantiles of the ensemble for temperature, precipitation, wind and gust,
// at the summit and the base. The engine puts the central series in place of the main source's hours for those days,
// then scores six more versions of the forecast in which one quantity at a time is at its 10% or its 90% value. The
// lowest and highest of the seven day scores are the range. The quantiles are per quantity (not whole ensemble members),
// so the range is how much the day moves when temperature, snow or wind lands at the edge of the ensemble, not a 10 to 90
// percentile of the day score itself.

export const RANGE_DAYS = { from: 6, to: 8 };
/** Each scenario moves one quantity to one quantile. Wind and gust move together. */
export const SCENARIOS = { t10: { t: 't10' }, t90: { t: 't90' }, p10: { p: 'p10' }, p90: { p: 'p90' }, w10: { w: 'w10', g: 'g10' }, w90: { w: 'w90', g: 'g90' } };

const SNOW_BELOW_C = 0; // precipitation at or below 0 °C falls as snow (as for MET Norway on the server)
const SLEET_BELOW_C = 1.5; // between 0 and 1.5 °C half snow, half rain

const windChill = (t, ms) => { const v = ms * 3.6; return t <= 10 && v > 4.8 ? 13.12 + 0.6215 * t - 11.37 * v ** 0.16 + 0.3965 * t * v ** 0.16 : t; };

function weatherCode(snow, rain, sleet) {
  if (sleet) return 68;
  if (snow > 0.05) return snow >= 1.5 ? 75 : snow >= 0.3 ? 73 : 71;
  if (rain > 0.1) return rain >= 2.5 ? 63 : 61;
  return 2; // no cloud amount in the ensemble data: partly cloudy, which the engine treats as dry and clear enough
}

/** One hour of the ensemble in the engine's weather fields, for a scenario (null = central). */
function hourOf(site, i, pick) {
  const val = (field, alt) => site[alt]?.[i] ?? site[field]?.[i] ?? null;
  const t = val('t', pick?.t), mm = val('p', pick?.p), wind = val('w', pick?.w), gust0 = val('g', pick?.g);
  if (t == null || mm == null || wind == null) return null;
  const gust = Math.max(gust0 ?? wind, wind);
  const sleet = mm > 0.1 && t > SNOW_BELOW_C && t < SLEET_BELOW_C;
  const snow = t <= SNOW_BELOW_C ? mm : sleet ? mm / 2 : 0;
  const rain = mm - snow;
  return { t, feels: windChill(t, wind), snow, wind, gust, code: weatherCode(snow, rain, sleet) };
}

const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const firstDateOf = (weather) => (weather?.summit?.hourly?.time ?? weather?.base?.hourly?.time ?? [])[0]?.slice(0, 10);

/**
 * The dates the ensemble can stand in for: days 6 to 8 after `today`, each with every hour from 00:00 to 23:00 present
 * at both sites, consecutive, and following on from the main source's last kept day.
 */
export function ensembleDates(weather, today) {
  const ens = weather?.ensemble;
  if (!ens?.time?.length || !ens.summit || !ens.base) return [];
  const byDate = new Map();
  ens.time.forEach((label, i) => {
    const d = label.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(i);
  });
  const mainDates = new Set((weather.summit?.hourly?.time ?? []).map((x) => x.slice(0, 10)));
  const out = [];
  for (let k = RANGE_DAYS.from; k <= RANGE_DAYS.to; k++) {
    const d = addDays(today, k);
    const idx = byDate.get(d) ?? [];
    const whole = idx.length >= 23 && ens.time[idx[0]].endsWith('T00:00') && ens.time[idx[idx.length - 1]].endsWith('T23:00')
      && idx.every((i) => hourOf(ens.summit, i) && hourOf(ens.base, i));
    if (!whole) break;
    if (!out.length && !mainDates.has(addDays(d, -1))) break; // a gap between the main source and the ensemble
    out.push(d);
  }
  return out;
}

const FIELDS = ['time', 'temperature_2m', 'apparent_temperature', 'snowfall', 'wind_speed_10m', 'wind_gusts_10m', 'visibility', 'weather_code'];

function mergeSite(main, ens, site, dates, pick) {
  const first = dates[0];
  const h = main?.hourly ?? {};
  const keep = (h.time ?? []).map((t, i) => (t.slice(0, 10) < first ? i : -1)).filter((i) => i >= 0);
  const out = Object.fromEntries(FIELDS.map((f) => [f, keep.map((i) => h[f]?.[i] ?? null)]));
  const want = new Set(dates);
  ens.time.forEach((label, i) => {
    if (!want.has(label.slice(0, 10))) return;
    const x = hourOf(ens[site], i, pick);
    out.time.push(label);
    out.temperature_2m.push(x.t);
    out.apparent_temperature.push(x.feels);
    out.snowfall.push(x.snow);
    out.wind_speed_10m.push(x.wind);
    out.wind_gusts_10m.push(x.gust);
    out.visibility.push(null);
    out.weather_code.push(x.code);
  });
  return { ...main, hourly: out };
}

/**
 * The weather with the ensemble's hours in place of the main source's for the dates it covers (`scenario` null for the
 * central values, or a key of SCENARIOS), plus those dates. Null when the ensemble covers no date.
 */
export function mergeEnsemble(weather, today = firstDateOf(weather), scenario = null) {
  if (!today) return null;
  const dates = ensembleDates(weather, today);
  if (!dates.length) return null;
  const pick = scenario ? SCENARIOS[scenario] : null;
  return {
    dates,
    weather: { ...weather, summit: mergeSite(weather.summit, weather.ensemble, 'summit', dates, pick), base: mergeSite(weather.base, weather.ensemble, 'base', dates, pick) },
  };
}

/**
 * Adds `range` and `uncertainty` to the days the ensemble covers. `score(weather)` scores a whole forecast; `out` is
 * the central result. A day gets a range only when it is scored in the central forecast and in every scenario.
 */
export function addRanges(out, weather, today, score) {
  const merged = mergeEnsemble(weather, today);
  if (!merged) return out;
  const runs = Object.keys(SCENARIOS).map((k) => score(mergeEnsemble(weather, today, k).weather));
  for (const day of out.days) {
    if (!merged.dates.includes(day.date) || day.status !== 'ok') continue;
    const others = runs.map((r) => r.days.find((d) => d.date === day.date));
    if (others.some((d) => d?.status !== 'ok')) continue;
    const all = [day.score, ...others.map((d) => d.score)];
    const low = Math.min(...all), high = Math.max(...all);
    day.range = { low, high };
    day.uncertainty = (high - low) / 2;
  }
  out.ensemble = { source: weather.ensemble.source ?? null, model: weather.ensemble.model ?? null, run: weather.ensemble.run ?? null, dates: merged.dates };
  return out;
}

export { firstDateOf };
