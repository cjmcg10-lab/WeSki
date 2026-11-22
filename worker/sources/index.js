import { met } from './met.js';
import { nws } from './nws.js';

export const FORECAST_ADAPTERS = [nws, met];

/** Adapters that can answer for the place, height, variable and lead time, best first. MET Norway covers everywhere and comes last. */
export function routeForecast({ lat, lon, alt = 0, variable = null, leadHours = 0 }, adapters = FORECAST_ADAPTERS) {
  return adapters.filter((a) => a.covers(lat, lon, alt) && (!variable || a.variables.includes(variable)) && leadHours <= a.horizonHours);
}

export const adapterById = (id, adapters = FORECAST_ADAPTERS) => adapters.find((a) => a.id === id);

/** How many of the picked sources are independent: two services that distribute the same model family count once. */
export const independentFamilies = (picked, lat, lon) => new Set(picked.map((a) => a.family(lat, lon))).size;
