const CATALOG_PATH = 'forecast/catalog-index.json';
const ASSET_ORIGIN = 'https://assets.invalid';
const MEMORY_MS = 3600e3;
const CACHE_S = 3600;
const FIELDS = ['id', 'lat', 'lon', 'baseLat', 'baseLon', 'top', 'base', 'tz'];

let memo = null;

export function parseCatalog(json) {
  const at = Object.fromEntries(FIELDS.map((f) => [f, json?.fields?.indexOf(f)]));
  if (!Array.isArray(json?.rows) || FIELDS.some((f) => !(at[f] >= 0)) || !Array.isArray(json.tz)) throw new Error('catalog has an unexpected shape');
  const byId = new Map();
  for (const row of json.rows) {
    const place = {
      lat: row[at.lat], lon: row[at.lon], blat: row[at.baseLat], blon: row[at.baseLon], top: row[at.top], base: row[at.base],
      tz: typeof row[at.tz] === 'number' ? json.tz[row[at.tz]] : row[at.tz],
    };
    if ([place.lat, place.lon, place.blat, place.blon, place.top, place.base].every(Number.isFinite) && place.tz) byId.set(row[at.id], place);
  }
  return { byId, aliases: new Map(Object.entries(json.idAliases ?? {})) };
}

async function catalogJson(env) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`${ASSET_ORIGIN}/${CATALOG_PATH}`);
  const hit = cache && (await cache.match(key));
  if (hit) return hit.json();
  if (!env.ASSETS) throw new Error('no ASSETS binding to read the resort list from');
  const res = await env.ASSETS.fetch(key);
  if (!res.ok) throw new Error(`resort list ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text);
  if (cache) await cache.put(key, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_S}` } }));
  return json;
}

/** The server-side resort list: `public/forecast/catalog-index.json`, kept in memory for an hour and in the data centre's cache. */
export async function loadCatalog(env, now = Date.now()) {
  if (memo && now - memo.at < MEMORY_MS) return memo.catalog;
  const catalog = parseCatalog(await catalogJson(env));
  memo = { at: now, catalog };
  return catalog;
}

export function resetCatalogMemory() {
  memo = null;
}

/** `{ id, place }` for a listed resort (old ids resolve through `idAliases`), or null for any other id or when the list cannot be read. */
export async function resortPlace(env, id, now = Date.now()) {
  try {
    const { byId, aliases } = await loadCatalog(env, now);
    const canonical = byId.has(id) ? id : aliases.get(id);
    const place = byId.get(canonical);
    return place ? { id: canonical, place } : null;
  } catch (e) {
    console.error('resort list unavailable', { message: e.message });
    return null;
  }
}
