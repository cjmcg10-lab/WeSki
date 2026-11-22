export const WEIGHTS = { surface: 0.45, visibility: 0.25, wind: 0.2, comfort: 0.1 };
export const COMPONENTS = Object.keys(WEIGHTS);
export const SURFACE_BASELINE = 78;

const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const smoothstep = (t) => t * t * (3 - 2 * t);

export function curve(points) {
  return (x) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i];
      if (x <= x1) {
        const [x0, y0] = points[i - 1];
        return y0 + (y1 - y0) * smoothstep((x - x0) / (x1 - x0));
      }
    }
    return points[points.length - 1][1];
  };
}

const RAIN_LEVEL = { 51: 1, 53: 1, 55: 1, 56: 2, 57: 2, 61: 1, 63: 2, 65: 3, 66: 2, 67: 3, 68: 1, 80: 1, 81: 2, 82: 3 };
const THUNDER_RAIN_LEVEL = { 95: 2, 96: 2, 99: 3 };
export const HOLD = { sustained: [14, 18], gust: [20, 25], cap: 35 };
const FREEZING_CODES = [56, 57, 66, 67];
const FOG_CODES = [45, 48];

const visibilityByDistance = curve([[100, 0], [500, 25], [2000, 60], [6000, 90], [12000, 100]]);
const visibilityBySnowfall = curve([[0, 100], [0.5, 92], [1.5, 65], [3, 35], [5, 10]]);
const windByStrength = curve([[0, 100], [4, 98], [8, 86], [12, 60], [16, 30], [20, 10], [26, 0]]);
const comfortByFeelsLike = curve([[-35, 0], [-25, 25], [-18, 58], [-10, 92], [-4, 100], [3, 100], [6, 85], [9, 60], [13, 30]]);
const comfortBySnowfall = curve([[0, 1], [1, 0.92], [3, 0.78]]);
const RAIN_COMFORT = [1, 0.4, 0.25, 0.15];
const RAIN_VISIBILITY = [100, 65, 45, 30];

export function normalizeHour(raw) {
  if (raw.t == null || raw.wind == null || raw.snow == null) return null;
  const code = raw.code ?? 0;
  return {
    t: raw.t,
    feels: raw.feels ?? raw.t,
    snow: raw.snow,
    wind: raw.wind,
    gust: raw.gust ?? raw.wind,
    vis: raw.vis ?? null,
    code,
    rain: RAIN_LEVEL[code] ?? (raw.snow <= 0.05 && raw.t > 0 ? THUNDER_RAIN_LEVEL[code] ?? 0 : 0),
    fog: FOG_CODES.includes(code),
    code68: code === 68,
    freezing: FREEZING_CODES.includes(code),
  };
}

export const surfaceScore = (s) => clamp(SURFACE_BASELINE + 22 * (1 - Math.exp(-s.fresh / 6)) - 55 * s.crust - 60 * s.wet);

export function visibilityScore(x) {
  const byDistance = x.vis == null ? 100 : visibilityByDistance(x.vis);
  return Math.min(byDistance, visibilityBySnowfall(x.snow), RAIN_VISIBILITY[x.rain], x.fog ? 20 : 100);
}

export const windStrength = (x) => Math.max(x.wind, 0.65 * x.gust);
export const windScore = (x) => windByStrength(windStrength(x));

const ramp = (v, [lo, hi]) => smoothstep(clamp((v - lo) / (hi - lo), 0, 1));
export const holdRisk = (x) => Math.max(ramp(x.wind, HOLD.sustained), ramp(x.gust, HOLD.gust));

export const comfortScore = (x) => clamp(comfortByFeelsLike(x.feels) * RAIN_COMFORT[x.rain] * comfortBySnowfall(x.snow));

const isDaytime = (hour) => hour >= 9 && hour < 16;

export function initialSurface(x) {
  return { fresh: 0, crust: 0, wet: x.t > 1 ? 0.2 : 0 };
}

export function stepSurface(state, x, hour) {
  let { fresh, crust, wet } = state;
  if (x.snow > 0) {
    if (x.t <= -0.5) fresh += x.snow;
    else {
      fresh += x.snow * 0.5;
      wet = Math.min(1, wet + 0.2);
    }
    crust *= Math.max(0, 1 - x.snow / 3);
  }
  if (x.rain > 0) {
    wet = Math.min(1, wet + 0.3 * x.rain);
    fresh *= 0.85;
  }
  if (x.t > 0) {
    const warmth = Math.min(1, x.t / 6);
    wet = Math.min(1, wet + warmth * (isDaytime(hour) ? 0.3 : 0.15));
    crust = Math.max(0, crust - 0.15 * Math.min(1, x.t / 3));
    fresh *= 1 - 0.03 * Math.min(1, x.t / 3);
  } else if (x.t < -1) {
    const frozen = wet * 0.3;
    wet -= frozen;
    crust = Math.min(1, crust + frozen);
  }
  crust *= 0.985;
  fresh *= isDaytime(hour) ? 0.97 : 0.995;
  if (x.wind > 10) fresh *= 0.98;
  return { fresh, crust, wet };
}

export function surfaceCode(state, x) {
  if (state.crust >= 0.4 && state.fresh < 3) return 'surf.icy';
  if (state.wet >= 0.5 || (x.rain > 0 && state.wet >= 0.3)) return 'surf.wet_snow';
  if (state.fresh >= 15) return 'surf.deep_fresh';
  if (state.fresh >= 3) return x.wind >= 10 ? 'surf.fresh_packed' : 'surf.fresh_firm';
  if (state.wet >= 0.2) return 'surf.softening';
  if (x.wind >= 14 && x.t < -2) return 'surf.scoured';
  return 'surf.firm_groomed';
}

export function precipCode(x) {
  if (x.rain > 0 && x.snow > 0.05) return 'precip.mixed';
  if (x.rain > 0) {
    if (x.freezing) return 'precip.freezing_rain';
    if (x.code68) return 'precip.mixed';
    if (x.code <= 55) return 'precip.drizzle';
    return x.rain >= 3 ? 'precip.heavy_rain' : 'precip.rain';
  }
  if (x.snow >= 1.5) return 'precip.heavy_snow';
  if (x.snow >= 0.5) return 'precip.snow';
  if (x.snow > 0.05) return 'precip.light_snow';
  return 'precip.none';
}

export function scoreSite(x, state) {
  const components = { surface: surfaceScore(state), visibility: visibilityScore(x), wind: windScore(x), comfort: comfortScore(x) };
  const raw = COMPONENTS.reduce((sum, k) => sum + WEIGHTS[k] * components[k], 0);
  const hold = holdRisk(x);
  const holdLoss = hold * Math.max(0, raw - HOLD.cap);
  return {
    score: raw - holdLoss,
    hold,
    holdLoss,
    components,
    precip: { code: precipCode(x), params: [] },
    surface: { code: surfaceCode(state, x), params: [] },
    detail: { ...state, rain: x.rain, snow: x.snow, fog: x.fog, vis: x.vis, feels: x.feels, wind: x.wind, gust: x.gust, t: x.t },
  };
}
