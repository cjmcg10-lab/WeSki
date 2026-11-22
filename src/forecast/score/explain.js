import { COMPONENTS, SURFACE_BASELINE, WEIGHTS } from './components.js';

const REFERENCE = { surface: SURFACE_BASELINE, visibility: 100, wind: 100, comfort: 100 };
const MIN_POINTS = 1.5;
const COLD_FEELS = -10;
const WARM_FEELS = 3;

export const pointsFor = (component, score) => WEIGHTS[component] * (score - REFERENCE[component]);

export function factorCode(component, points, d) {
  if (component === 'surface') {
    if (points > 0) return 'F_FRESH_SNOW';
    if (d.crust >= d.wet) return 'F_ICY_REFROZEN';
    return d.wet >= 0.5 || d.rain > 0 ? 'F_WET_SNOW' : 'F_SOFT_SNOW';
  }
  if (component === 'visibility') {
    if (d.fog || (d.vis != null && d.vis < 1000)) return d.site === 'base' ? 'F_FOG' : 'F_SUMMIT_FOG';
    return d.snow >= 1.5 ? 'F_HEAVY_SNOWFALL' : 'F_FLAT_LIGHT';
  }
  if (component === 'wind') return 'F_STRONG_GUSTS';
  if (d.rain > 0) return 'F_RAIN';
  if (d.snow >= 1.5) return 'F_HEAVY_SNOWFALL';
  if (d.feels <= COLD_FEELS) return 'F_COLD';
  return d.feels >= WARM_FEELS ? 'F_TOO_WARM' : 'F_COMFORTABLE';
}

export function siteFactor(site) {
  let best = null;
  for (const c of COMPONENTS) {
    const points = pointsFor(c, site.components[c]) - (c === 'wind' ? site.holdLoss : 0);
    if (!best || Math.abs(points) > Math.abs(best.points)) best = { component: c, points };
  }
  if (Math.abs(best.points) < 1) {
    return { code: site.components.visibility >= 95 ? 'F_GOOD_VISIBILITY' : 'F_FIRM_SURFACE', component: null, params: [], points: 0 };
  }
  return { code: factorCode(best.component, best.points, site.detail), component: best.component, params: [], points: best.points };
}

export function hourFactor(sites) {
  const factors = sites.map(siteFactor);
  return factors.reduce((a, b) => (Math.abs(b.points) > Math.abs(a.points) ? b : a));
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const meanComponent = (rows, c) => mean(rows.map((r) => r.components[c]));
const siteList = (rows) => rows.flatMap((r) => [r.base, r.upper].filter(Boolean));

export function dayDrivers(rows) {
  const sites = siteList(rows);
  const out = [];
  for (const c of COMPONENTS) {
    const holdLoss = c === 'wind' ? mean(rows.map((r) => r.holdLoss)) : 0;
    const points = pointsFor(c, meanComponent(rows, c)) - holdLoss;
    if (Math.abs(points) < MIN_POINTS) continue;
    const driving = sites.filter((s) => s.components[c] < REFERENCE[c]);
    const pool = driving.length ? driving : sites;
    const worst = pool.reduce((a, b) => (b.components[c] < a.components[c] ? b : a));
    const d = { ...worst.detail, crust: Math.max(...pool.map((s) => s.detail.crust)), wet: Math.max(...pool.map((s) => s.detail.wet)), rain: Math.max(...pool.map((s) => s.detail.rain)) };
    out.push({ component: c, code: factorCode(c, points, d), params: [], points });
  }
  return out.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 3);
}

const LOW_VISIBILITY_BELOW = 75;
const AFTERNOON_FROM = 12;
const AFTERNOON_WIND_DROP = 10;

function rainExplanation(rows) {
  const wet = rows.filter((r) => [r.base, r.upper].some((s) => s && s.detail.rain > 0));
  if (!wet.length) return null;
  const snowAbove = wet.some((r) => r.base && r.base.detail.rain > 0 && r.upper && r.upper.detail.rain === 0 && r.upper.detail.snow > 0);
  return { code: snowAbove ? 'EX_RAIN_AT_BASE' : 'EX_RAIN_WHOLE_MOUNTAIN', params: [] };
}

function gustsInAfternoon(rows) {
  const am = rows.filter((r) => r.hour < AFTERNOON_FROM);
  const pm = rows.filter((r) => r.hour >= AFTERNOON_FROM);
  return am.length > 0 && pm.length > 0 && meanComponent(am, 'wind') - meanComponent(pm, 'wind') >= AFTERNOON_WIND_DROP;
}

export function dayExplanation(rows, drivers) {
  const lowVisibility = meanComponent(rows, 'visibility') < LOW_VISIBILITY_BELOW;
  const top = drivers.find((d) => d.component !== 'visibility' || lowVisibility);
  if (!top) {
    const clear = !lowVisibility && meanComponent(rows, 'wind') >= 75;
    return { code: clear ? 'EX_GROOMED_FIRM_FAST' : 'EX_MIXED', params: [] };
  }
  if (top.component === 'surface' && top.points > 0) {
    const gusty = rows[0].components.wind < 70;
    const eased = gusty ? rows.find((r) => r.components.wind >= 80) : null;
    return eased ? { code: 'EX_FRESH_SNOW_WIND_EASES', params: [eased.hour] } : { code: 'EX_FRESH_SNOW_FIRM_BASE', params: [] };
  }
  if (top.component === 'surface') {
    const rain = rainExplanation(rows);
    if (rain) return rain;
    if (top.code === 'F_ICY_REFROZEN') return { code: 'EX_THAW_REFREEZE', params: [] };
    const wetAt = (r) => [r.base, r.upper].some((s) => s && s.detail.wet >= 0.2);
    const soften = rows.find(wetAt);
    return soften && soften !== rows[0] && !wetAt(rows[0]) ? { code: 'EX_SOFTENING_SUN', params: [soften.hour] } : { code: 'EX_WARM_WET', params: [] };
  }
  if (top.component === 'visibility') {
    const windy = drivers.some((d) => d.component === 'wind') && gustsInAfternoon(rows);
    return { code: windy ? 'EX_FLAT_LIGHT_GUSTS_PM' : 'EX_LOW_VISIBILITY', params: [] };
  }
  if (top.component === 'wind') return { code: 'EX_SUMMIT_WIND', params: [] };
  const rain = rainExplanation(rows);
  if (rain) return rain;
  const feels = Math.min(...siteList(rows).map((s) => s.detail.feels));
  if (feels <= COLD_FEELS) return { code: 'EX_COLD', params: [] };
  return { code: feels >= WARM_FEELS ? 'EX_WARM_SOFT' : 'EX_MIXED', params: [] };
}

export const FAR_AHEAD_DAYS = 3;
export const VERY_FAR_AHEAD_DAYS = 6;
export const STALE_HOURS = 6;
export const SNOW_HISTORY_MIN_HOURS = 48;
export const OBSERVED_MIN_HOURS = 24;
export const COARSE_GRID_KM = 8;
export const ELEVATION_MISMATCH_MEDIUM_M = 500;
export const ELEVATION_MISMATCH_LOW_M = 1000;

const rated = (level, code, params = []) => ({ level, reason: { code, params } });

export function dayConfidence({ single, partial, daysAhead, ageHours, stale = false, history = { hours: 0, observed: 0 }, resolutionKm = null, elevationMismatchM = null }) {
  if (single) return rated('Low', 'CR_ONE_ESTIMATE');
  if (partial) return rated('Low', 'CR_PARTIAL_SITES');
  if (stale || (ageHours != null && ageHours >= STALE_HOURS)) return rated('Low', 'CR_STALE', [Math.round(ageHours ?? 0)]);
  if (daysAhead >= VERY_FAR_AHEAD_DAYS) return rated('Low', 'CR_FAR_AHEAD', [daysAhead]);
  if (elevationMismatchM >= ELEVATION_MISMATCH_LOW_M) return rated('Low', 'CR_ELEVATION_MISMATCH', [Math.round(elevationMismatchM)]);
  if (daysAhead >= FAR_AHEAD_DAYS) return rated('Medium', 'CR_FAR_AHEAD', [daysAhead]);
  if (elevationMismatchM >= ELEVATION_MISMATCH_MEDIUM_M) return rated('Medium', 'CR_ELEVATION_MISMATCH', [Math.round(elevationMismatchM)]);
  if (resolutionKm >= COARSE_GRID_KM) return rated('Medium', 'CR_COARSE_GRID', [resolutionKm]);
  if (history.hours < SNOW_HISTORY_MIN_HOURS) return rated('Medium', 'CR_SNOW_HISTORY_LIMITED');
  if (history.observed < OBSERVED_MIN_HOURS) return rated('Medium', 'CR_NO_OBSERVATIONS');
  return rated('High', 'CR_HISTORY_COVERED');
}

export function windowConfidence({ window, assumed, daysAhead, stale = false, ageHours, dayLevel }) {
  if (!window) return rated('Low', 'WR_NO_WINDOW');
  if (daysAhead >= FAR_AHEAD_DAYS) return rated('Low', 'WR_TOO_FAR_AHEAD');
  if (stale || (ageHours != null && ageHours >= STALE_HOURS)) return rated('Low', 'WR_STALE', [Math.round(ageHours ?? 0)]);
  if (assumed) return rated('Medium', 'WR_HOURS_ASSUMED');
  return rated(dayLevel === 'High' && daysAhead <= 1 ? 'High' : 'Medium', 'WR_STABLE');
}
