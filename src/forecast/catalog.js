const INDEX_VERSION = 1;
const DEFAULT_BASE = '/forecast';
const DEFAULT_LIMIT = 20;
const MIN_SUBSTRING_LENGTH = 3;
const FLAG = { topMissing: 1, baseMissing: 2, approximate: 4, hasMap: 8 };
const INCOMPLETE_FLAGS = FLAG.topMissing | FLAG.baseMissing | FLAG.approximate;
const CONTEXT_RANK = 60;
const FIELD_RANK = { name: 0, alias: 1, town: 2 };

const WORD_FORMS = { mt: 'mount', st: 'saint', sankt: 'saint', san: 'saint', sant: 'saint', ste: 'sainte' };

const plain = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const EARTH_KM = 6371;

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export const normalise =(text) => plain(text).split(' ').map((w) => WORD_FORMS[w] ?? w).join(' ');

function queryForms(text) {
  const words = plain(text).split(' ');
  const last = words.pop();
  const spelled = words.map((w) => WORD_FORMS[w] ?? w);
  const forms = [[...spelled, WORD_FORMS[last] ?? last].join(' '), [...spelled, last].join(' ')];
  return forms.filter((f, i) => f.trim() && forms.indexOf(f) === i);
}

function matchTier(text, query, words) {
  if (text === query) return 0;
  if (text.startsWith(`${query} `)) return 1;
  if (text.startsWith(query)) return 2;
  const textWords = text.split(' ');
  if (words.every((w) => textWords.includes(w))) return 3;
  if (words.every((w) => textWords.some((t) => t.startsWith(w)))) return 4;
  if (query.length >= MIN_SUBSTRING_LENGTH && text.includes(query)) return 5;
  return Infinity;
}

function toEntry(row, fields, countries, zones) {
  const r = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
  const strings = [
    { field: 'name', text: r.name },
    ...r.aliases.map((text) => ({ field: 'alias', text })),
    ...r.towns.map((text) => ({ field: 'town', text })),
  ].map((s) => ({ ...s, key: normalise(s.text) }));
  const country = countries[r.cc] ?? '';
  return {
    row: r,
    country,
    incomplete: Boolean(r.flags & INCOMPLETE_FLAGS),
    pool: [...new Set([...strings.flatMap((s) => s.key.split(' ')), ...normalise(`${r.region} ${country}`).split(' ')])],
    tz: zones[r.tz] ?? null,
    strings,
    vertical: r.top != null && r.base != null ? r.top - r.base : 0,
  };
}

function rankEntry(entry, query, words) {
  let best = null;
  for (const s of entry.strings) {
    const tier = matchTier(s.key, query, words);
    if (tier === Infinity) continue;
    const rank = tier * 10 + FIELD_RANK[s.field];
    if (!best || rank < best.rank) best = { rank, field: s.field, text: s.text };
  }
  if (best) return best;
  if (words.length < 2) return null;
  if (!words.every((w) => entry.pool.some((p) => p.startsWith(w)))) return null;
  return { rank: CONTEXT_RANK, field: 'name', text: entry.row.name };
}

function describe(entry, match) {
  const { row } = entry;
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    country: entry.country,
    cc: row.cc,
    lat: row.lat,
    lon: row.lon,
    hasMap: Boolean(row.flags & FLAG.hasMap),
    match: match ? { field: match.field, text: match.text } : null,
  };
}

function missingOf(flags) {
  const missing = [];
  if (flags & FLAG.topMissing) missing.push('top');
  if (flags & FLAG.baseMissing) missing.push('base');
  if (flags & FLAG.approximate) missing.push('points');
  return missing;
}

export function catalogFromIndex(index, { fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE } = {}) {
  if (!index || index.v !== INDEX_VERSION || !Array.isArray(index.rows)) throw new Error('resort catalog index is not the expected version');
  const entries = index.rows.map((row) => toEntry(row, index.fields, index.countries, index.tz));
  const byId = new Map(entries.map((e) => [e.row.id, e]));
  const shards = new Map();

  function search(text, { limit = DEFAULT_LIMIT } = {}) {
    const forms = queryForms(text);
    const hits = [];
    for (const entry of entries) {
      let match = null;
      for (const query of forms) {
        const found = rankEntry(entry, query, query.split(' '));
        if (found && (!match || found.rank < match.rank)) match = found;
      }
      if (match) hits.push({ entry, match });
    }
    const tierOf = (hit) => Math.floor(hit.match.rank / 10);
    hits.sort((a, b) =>
      tierOf(a) - tierOf(b) ||
      Number(a.entry.incomplete) - Number(b.entry.incomplete) ||
      a.match.rank - b.match.rank ||
      a.entry.row.name.length - b.entry.row.name.length ||
      b.entry.vertical - a.entry.vertical ||
      (a.entry.row.id < b.entry.row.id ? -1 : 1));
    return hits.slice(0, limit).map(({ entry, match }) => describe(entry, match));
  }

  function nearby(lat, lon, { maxKm = 3, limit = 3 } = {}) {
    return entries
      .map((entry) => ({ entry, km: Math.min(...[[entry.row.lat, entry.row.lon], [entry.row.baseLat, entry.row.baseLon]].filter(([a, b]) => a != null && b != null).map(([a, b]) => distanceKm(lat, lon, a, b))) }))
      .filter(({ km }) => km <= maxKm)
      .sort((a, b) => a.km - b.km || (a.entry.row.id < b.entry.row.id ? -1 : 1))
      .slice(0, limit)
      .map(({ entry, km }) => ({ ...describe(entry, null), tz: entry.tz, km }));
  }

  const idOf = (id) => index.idAliases?.[id] ?? id;

  function getResort(id) {
    const entry = byId.get(idOf(id));
    if (!entry) return null;
    const { row } = entry;
    return {
      id: row.id,
      name: row.name,
      region: row.region,
      country: entry.country,
      tz: entry.tz,
      lat: row.lat,
      lon: row.lon,
      baseLat: row.baseLat,
      baseLon: row.baseLon,
      top: row.top,
      base: row.base,
      missing: missingOf(row.flags),
      hasMap: Boolean(row.flags & FLAG.hasMap),
    };
  }

  async function loadDetail(id) {
    const entry = byId.get(idOf(id));
    if (!entry) return null;
    const cc = entry.row.cc ?? 'XX';
    if (!shards.has(cc)) {
      shards.set(cc, fetchImpl(`${baseUrl}/detail/${cc}.json`).then((res) => {
        if (!res.ok) throw new Error(`resort detail ${cc} unavailable (${res.status})`);
        return res.json();
      }).catch((err) => {
        shards.delete(cc);
        throw err;
      }));
    }
    return (await shards.get(cc))[entry.row.id] ?? null;
  }

  return { size: entries.length, source: index.source, search, nearby, getResort, loadDetail };
}

export async function loadCatalog({ fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE } = {}) {
  const res = await fetchImpl(`${baseUrl}/catalog-index.json`);
  if (!res.ok) throw new Error(`resort catalog unavailable (${res.status})`);
  return catalogFromIndex(await res.json(), { fetchImpl, baseUrl });
}

export function forecastPoints(resort) {
  if (!resort || (resort.top == null && resort.base == null)) return null;
  return { ...resort, top: resort.top ?? resort.base, base: resort.base ?? resort.top };
}
