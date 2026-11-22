// Backtest for the ski-day score: hourly airport observations (NOAA NCEI "global-hourly", public domain) turned into the
// weather shape the engine reads, then scored. Used for "Calibration round 1" in docs/FORECAST_SCORING.md.
// Run:  node tools/forecast_backtest.mjs                 (scores the recorded days in tests/fixtures/forecast/backtest/)
//       node tools/forecast_backtest.mjs --fetch        (downloads them again from NOAA, then scores)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { scoreForecast, SCORING_VERSION } from '../src/forecast/score/index.js';
import { hourLabel } from '../worker/weather.js';

const DIR = new URL('../tests/fixtures/forecast/backtest/', import.meta.url);
const NCEI = 'https://www.ncei.noaa.gov/access/services/data/v1';
const KNOT = 0.514444;

/** The recordings used in round 1: one or two stations per resort (summit and base), a local zone and the window fetched. */
export const EVENTS = [
  { id: 'mammoth', name: 'Mammoth Lakes, California', tz: 'America/Los_Angeles', from: '2023-02-20', to: '2023-03-20', summit: '72389403181', base: '72389403181' },
  { id: 'stowe', name: 'Stowe area, Vermont', tz: 'America/New_York', from: '2023-12-08', to: '2023-12-23', summit: '72611454771', base: '72611454771' },
  { id: 'washington', name: 'Mount Washington, New Hampshire (summit) and Whitefield airport (valley)', tz: 'America/New_York', from: '2023-01-25', to: '2023-02-12', summit: '72613014755', base: '72616454728' },
];

/** The days checked in round 1 and what each one should show. */
export const PICKS = [
  { event: 'mammoth', date: '2023-02-24', kind: 'powder', label: 'Powder storm, heavy snow and low visibility' },
  { event: 'mammoth', date: '2023-02-26', kind: 'powder', label: 'Bluebird day after the storm' },
  { event: 'stowe', date: '2023-12-18', kind: 'rain', label: 'Rain on snow, 16 C and gusts to 22 m/s' },
  { event: 'stowe', date: '2023-12-22', kind: 'rain', label: 'Cold and calm four days later' },
  { event: 'washington', date: '2023-02-03', kind: 'wind', label: 'Summit gale of 45 m/s, valley calm' },
  { event: 'washington', date: '2023-01-31', kind: 'wind', label: 'Summit gale of 34 m/s, valley calm' },
  { event: 'mammoth', date: '2023-03-14', kind: 'refreeze', label: 'Warm wet snow and rain' },
  { event: 'mammoth', date: '2023-03-18', kind: 'refreeze', label: 'Clear day after the warm spell refroze' },
];

const num = (field, scale, missing) => {
  const v = Number(String(field ?? '').split(',')[0]);
  return Number.isFinite(v) && v !== missing && field != null ? v / scale : null;
};

const WEATHER_TOKEN = /^(-|\+)?(VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ)+)$/;
const SNOW_CM_PER_HOUR = { '-': 0.4, '': 1, '+': 2 };
const SNOW_CODE = { '-': 71, '': 73, '+': 75 };
const RAIN_CODE = { '-': 61, '': 63, '+': 65 };
const DRIZZLE_CODE = { '-': 51, '': 53, '+': 55 };

/** Present weather in a METAR's text: snow rate (cm an hour, estimated from the reported intensity) and a WMO code. */
export function presentWeather(metar) {
  const body = (metar.split(' RMK')[0].split(/ METAR | SPECI /)[1] ?? '').split(/\s+/);
  let snow = 0, code = 0, rain = false, fog = false;
  for (const token of body) {
    const m = WEATHER_TOKEN.exec(token);
    if (!m) continue;
    const [, level = '', , descriptor = '', kinds] = m;
    if (descriptor === 'BL') continue;
    if (/SN|SG/.test(kinds)) { snow = Math.max(snow, kinds.includes('SG') ? 0.2 : SNOW_CM_PER_HOUR[level]); code = Math.max(code, SNOW_CODE[level]); }
    if (/RA|DZ/.test(kinds)) { rain = true; code = descriptor === 'FZ' ? (level === '+' ? 67 : 66) : descriptor === 'TS' ? 95 : kinds.includes('DZ') ? DRIZZLE_CODE[level] : RAIN_CODE[level]; }
    if (kinds.includes('FG') && descriptor !== 'MI' && descriptor !== 'BC') fog = true;
  }
  if (rain && snow > 0) return { snow: Math.max(snow, 0.3), code: 68 };
  if (snow > 0) return { snow, code };
  if (rain) return { snow: 0, code };
  return { snow: 0, code: fog ? 45 : 0 };
}

const windChill = (t, windMs) => {
  const v = windMs * 3.6;
  return t <= 10 && v > 4.8 ? 13.12 + 0.6215 * t - 11.37 * v ** 0.16 + 0.3965 * t * v ** 0.16 : t;
};

const preferred = (a, b) => (Math.abs(new Date(a.DATE).getUTCMinutes() - 53) <= Math.abs(new Date(b.DATE).getUTCMinutes() - 53) ? a : b);

/** One row per UTC hour from raw ISD records (the report nearest to :53 wins), in the Open-Meteo shape the engine reads. */
export function isdToHourly(records, tz) {
  const byHour = new Map();
  for (const r of records) {
    const ms = Date.parse(`${r.DATE}Z`);
    if (!Number.isFinite(ms)) continue;
    const hour = Math.floor(ms / 3600e3) * 3600e3;
    const old = byHour.get(hour);
    byHour.set(hour, old ? preferred(old, r) : r);
  }
  const cols = { time: [], temperature_2m: [], apparent_temperature: [], snowfall: [], wind_speed_10m: [], wind_gusts_10m: [], weather_code: [], visibility: [] };
  for (const [hour, r] of [...byHour].sort((a, b) => a[0] - b[0])) {
    const t = num(r.TMP, 10, 9999), wind = num(r.WND?.split(',').slice(3).join(','), 10, 9999);
    const gust = String(r.REM ?? '').match(/\d{3}\d{2,3}G(\d{2,3})KT/)?.[1];
    const { snow, code } = presentWeather(String(r.REM ?? ''));
    const gustMs = gust ? Number(gust) * KNOT : num(r.OC1, 10, 9999) ?? wind;
    cols.time.push(hourLabel(hour, tz));
    cols.temperature_2m.push(t);
    cols.apparent_temperature.push(t == null || wind == null ? t : Math.round(windChill(t, wind) * 10) / 10);
    cols.snowfall.push(snow);
    cols.wind_speed_10m.push(wind);
    cols.wind_gusts_10m.push(gustMs == null ? null : Math.round(Math.max(gustMs, wind ?? 0) * 10) / 10);
    cols.weather_code.push(code);
    cols.visibility.push(num(r.VIS, 1, 999999));
  }
  return { hourly: cols };
}

async function fetchStation(station, event) {
  const url = `${NCEI}?dataset=global-hourly&stations=${station}&startDate=${event.from}T00:00:00&endDate=${event.to}T23:59:59&format=json`;
  const res = await fetch(url, { headers: { 'user-agent': 'weski-build' } });
  if (!res.ok) throw new Error(`${event.id}: NOAA answered ${res.status}`);
  const records = await res.json();
  return { station, name: records[0]?.NAME, elevation: Number(records[0]?.ELEVATION), weather: isdToHourly(records, event.tz) };
}

export const loadRecorded = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8'));

export async function record(events = EVENTS) {
  mkdirSync(DIR, { recursive: true });
  for (const event of events) {
    const summit = await fetchStation(event.summit, event);
    const base = event.base === event.summit ? summit : await fetchStation(event.base, event);
    writeFileSync(new URL(`${event.id}.json`, DIR), `${JSON.stringify({ ...event, summit, base })}\n`);
  }
}

/** Score recorded observations. `profile` ({ id, top, base }) says what kind of resort it is; by default the stations' own heights. */
export function scoreRecorded(recorded, profile) {
  const resort = profile ?? { id: recorded.id, top: recorded.summit.elevation, base: recorded.base.elevation };
  return scoreForecast(resort, { summit: recorded.summit.weather, base: recorded.base.weather });
}

export const bandOf = (score) => [[85, 'Epic'], [70, 'Great'], [55, 'Good'], [40, 'Fair'], [0, 'Poor']].find(([min]) => score >= min)[1];

/** The picked days scored by the current engine. */
export function scorePicks() {
  const scored = Object.fromEntries(EVENTS.map((e) => [e.id, scoreRecorded(loadRecorded(e.id))]));
  return PICKS.map((p) => {
    const day = scored[p.event].days.find((d) => d.date === p.date);
    return { ...p, score: day.score, band: bandOf(day.score), mean: day.mean, window: day.window, explain: day.explain?.code, hold: Math.max(...day.hours.filter((h) => h.ski).map((h) => h.hold)) };
  });
}

/** Four very different resorts given the same weather at their summit and base: only height, zone and hemisphere differ. */
export const PROFILES = [
  { id: 'small-hill', name: 'Small low hill (vertical 70 m)', top: 270, base: 200 },
  { id: 'alpine', name: 'High Alpine resort (1,500 m vertical)', top: 3300, base: 1800 },
  { id: 'japan', name: 'Japanese resort', top: 1400, base: 700 },
  { id: 'southern', name: 'Southern Hemisphere resort (Perisher-like)', top: 2054, base: 1720 },
];

export function sameWeatherAcrossResorts(recorded) {
  return Object.fromEntries(PROFILES.map((p) => [p.id, scoreRecorded(recorded, p)]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--fetch')) await record();
  console.log(`Scoring version ${SCORING_VERSION}`);
  for (const r of scorePicks()) console.log(`${r.kind.padEnd(9)} ${r.event.padEnd(10)} ${r.date}  ${r.score.toFixed(1).padStart(5)} ${r.band.padEnd(5)} mean ${r.mean.toFixed(1)}  hold ${r.hold.toFixed(2)}  ${r.label}`);
  const across = sameWeatherAcrossResorts(loadRecorded('washington'));
  for (const date of ['2023-01-26', '2023-02-03', '2023-02-09']) {
    console.log(date, PROFILES.map((p) => `${p.id} ${across[p.id].days.find((d) => d.date === date).score.toFixed(1)} (${across[p.id].siteMode})`).join('  '));
  }
}
