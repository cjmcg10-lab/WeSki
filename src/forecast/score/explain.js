import { COMPONENTS, SURFACE_BASELINE, WEIGHTS } from './components.js';

const REFERENCE = { surface: SURFACE_BASELINE, visibility: 100, wind: 100, comfort: 100 };
const MIN_POINTS = 1.5;

export const pointsFor = (component, score) => WEIGHTS[component] * (score - REFERENCE[component]);

export function factorCode(component, points, d) {
  if (component === 'surface') {
    if (points > 0) return 'F_FRESH_SNOW';
    if (d.crust >= d.wet) return 'F_ICY_REFROZEN';
    return d.wet >= 0.5 || d.rain > 0 ? 'F_WET_SNOW' : 'F_SOFT_SNOW';
  }
  if (component === 'visibility') {
    if (d.fog || (d.vis != null && d.vis < 1000)) return 'F_SUMMIT_FOG';
    return d.snow >= 1.5 ? 'F_HEAVY_SNOWFALL' : 'F_FLAT_LIGHT';
  }
  if (component === 'wind') return 'F_STRONG_GUSTS';
  if (d.rain > 0) return 'F_RAIN';
  return d.feels < 0 ? 'F_COLD' : 'F_COMFORTABLE';
}

export function siteFactor(site) {
  let best = null;
  for (const c of COMPONENTS) {
    const points = pointsFor(c, site.components[c]);
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

export function dayDrivers(rows) {
  const sites = rows.flatMap((r) => [r.base, r.upper].filter(Boolean));
  const out = [];
  for (const c of COMPONENTS) {
    const points = pointsFor(c, mean(rows.map((r) => r.components[c])));
    if (Math.abs(points) < MIN_POINTS) continue;
    const worst = sites.reduce((a, b) => (b.components[c] < a.components[c] ? b : a));
    const d = { ...worst.detail, crust: Math.max(...sites.map((s) => s.detail.crust)), wet: Math.max(...sites.map((s) => s.detail.wet)), rain: Math.max(...sites.map((s) => s.detail.rain)) };
    out.push({ component: c, code: factorCode(c, points, d), params: [], points });
  }
  return out.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 3);
}

export function dayExplanation(rows, drivers) {
  const sites = rows.flatMap((r) => [r.base, r.upper].filter(Boolean));
  const maxOf = (f) => Math.max(...sites.map(f));
  const top = drivers[0];
  if (!top) {
    const clear = rows.every((r) => r.components.visibility >= 85 && r.components.wind >= 80);
    return { code: clear ? 'EX_GROOMED_FIRM_FAST' : 'EX_MIXED', params: [] };
  }
  if (top.component === 'surface' && top.points > 0) {
    const gusty = rows[0].components.wind < 70;
    const eased = gusty ? rows.find((r) => r.components.wind >= 80) : null;
    return eased ? { code: 'EX_FRESH_SNOW_WIND_EASES', params: [eased.hour] } : { code: 'EX_FRESH_SNOW_FIRM_BASE', params: [] };
  }
  if (top.component === 'surface') {
    if (maxOf((s) => s.detail.rain) > 0) return { code: 'EX_RAIN_AT_BASE', params: [] };
    if (top.code === 'F_ICY_REFROZEN') return { code: 'EX_THAW_REFREEZE', params: [] };
    const soften = rows.find((r) => [r.base, r.upper].some((s) => s && s.detail.wet >= 0.2));
    const dryStart = soften && soften !== rows[0] && rows[0] && [rows[0].base, rows[0].upper].every((s) => !s || s.detail.wet < 0.2);
    return dryStart ? { code: 'EX_SOFTENING_SUN', params: [soften.hour] } : { code: 'EX_WARM_WET', params: [] };
  }
  if (top.component === 'visibility') {
    const windy = drivers.some((d) => d.component === 'wind');
    return { code: windy ? 'EX_FLAT_LIGHT_GUSTS_PM' : 'EX_LOW_VISIBILITY', params: [] };
  }
  if (top.component === 'wind') return { code: 'EX_SUMMIT_WIND', params: [] };
  return { code: maxOf((s) => s.detail.rain) > 0 ? 'EX_RAIN_AT_BASE' : 'EX_COLD', params: [] };
}

const FAR_AHEAD_DAYS = 3;
const VERY_FAR_AHEAD_DAYS = 6;
const STALE_HOURS = 6;

export function dayConfidence({ single, partial, daysAhead, ageHours }) {
  const limited = { reason: { code: 'CR_SNOW_HISTORY_LIMITED', params: [] } };
  if (single) return { level: 'Low', reason: { code: 'CR_ONE_ESTIMATE', params: [] } };
  if (partial) return { level: 'Low', reason: { code: 'CR_PARTIAL_SITES', params: [] } };
  if (ageHours != null && ageHours >= STALE_HOURS) return { level: 'Low', reason: { code: 'CR_STALE', params: [Math.round(ageHours)] } };
  if (daysAhead >= FAR_AHEAD_DAYS) return { level: daysAhead >= VERY_FAR_AHEAD_DAYS ? 'Low' : 'Medium', reason: { code: 'CR_FAR_AHEAD', params: [daysAhead] } };
  return { level: 'Medium', ...limited };
}

export function windowConfidence({ window, assumed, daysAhead }) {
  if (!window) return { level: 'Low', reason: { code: 'WR_NO_WINDOW', params: [] } };
  if (daysAhead >= FAR_AHEAD_DAYS) return { level: 'Low', reason: { code: 'WR_TOO_FAR_AHEAD', params: [] } };
  return { level: 'Medium', reason: { code: assumed ? 'WR_HOURS_ASSUMED' : 'WR_STABLE', params: [] } };
}
