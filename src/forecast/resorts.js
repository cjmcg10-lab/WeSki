const CATALOG_URL = '/data/index.json';
export const SEARCH_LIMIT = 30;

export function toResort(entry) {
  const cut = String(entry.region ?? '').lastIndexOf(', ');
  return {
    id: entry.id,
    name: entry.name,
    region: cut < 0 ? '' : entry.region.slice(0, cut),
    country: cut < 0 ? entry.region ?? '' : entry.region.slice(cut + 2),
    tz: entry.tz,
    lat: entry.lat,
    lon: entry.lon,
    baseLat: entry.baseLat ?? entry.lat,
    baseLon: entry.baseLon ?? entry.lon,
    top: entry.top,
    base: entry.base,
  };
}

let pending = null;

export function loadCatalog(fetchFn = fetch) {
  if (!pending) {
    pending = fetchFn(CATALOG_URL)
      .then((res) => { if (!res.ok) throw new Error(CATALOG_URL); return res.json(); })
      .then((rows) => rows.map(toResort))
      .catch((e) => { pending = null; throw e; });
  }
  return pending;
}

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchResorts(catalog, query, limit = SEARCH_LIMIT) {
  const q = fold(query).trim();
  if (!q) return catalog.slice(0, limit);
  const words = q.split(/\s+/);
  return catalog
    .filter((r) => { const hay = fold(`${r.name} ${r.region} ${r.country}`); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => Number(fold(b.name).startsWith(q)) - Number(fold(a.name).startsWith(q)))
    .slice(0, limit);
}

export const sameName = (list, resort) => list.some((r) => r.id !== resort.id && fold(r.name) === fold(resort.name));
