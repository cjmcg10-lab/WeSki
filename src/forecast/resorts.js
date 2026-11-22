import { loadCatalog as fetchCatalog } from './catalog.js';

export const SEARCH_LIMIT = 30;

export function toResort(entry) {
  return {
    id: entry.id,
    name: entry.name,
    region: entry.region ?? '',
    country: entry.country ?? '',
    tz: entry.tz ?? null,
    lat: entry.lat,
    lon: entry.lon,
    baseLat: entry.baseLat ?? entry.lat,
    baseLon: entry.baseLon ?? entry.lon,
    top: entry.top ?? null,
    base: entry.base ?? null,
    missing: entry.missing ?? [],
  };
}

let pending = null;

export function loadCatalog(options) {
  if (!pending) pending = fetchCatalog(options).catch((e) => { pending = null; throw e; });
  return pending;
}

export function searchResorts(catalog, query, limit = SEARCH_LIMIT) {
  return query.trim() ? catalog.search(query, { limit }) : [];
}

export const resortFor = (catalog, id) => {
  const found = catalog.getResort(id);
  return found ? toResort(found) : null;
};

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const sameName = (list, resort) => list.some((r) => r.id !== resort.id && fold(r.name) === fold(resort.name));

export const hasHeights = (resort) => resort.top != null || resort.base != null;

export const canForecast = (resort) => hasHeights(resort) && typeof resort.tz === 'string' && resort.tz !== '';
