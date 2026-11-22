const INDEX_VERSION = 1;
const DEFAULT_BASE = '/forecast';
const DEFAULT_LIMIT = 20;
const MIN_SUBSTRING_LENGTH = 3;
const FLAG = { topMissing: 1, baseMissing: 2, approximate: 4, hasMap: 8 };
const FIELD_RANK = { name: 0, alias: 1, town: 2 };

export const normalise = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function matchTier(text, query, words) {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const textWords = text.split(' ');
  if (words.every((w) => textWords.some((t) => t.startsWith(w)))) return 2;
  if (query.length >= MIN_SUBSTRING_LENGTH && text.includes(query)) return 3;
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
    tz: zones[r.tz] ?? null,
    strings,
    context: normalise([r.region, country].join(' ')),
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
  const pool = [...new Set([...entry.strings.flatMap((s) => s.key.split(' ')), ...entry.context.split(' ')])];
  if (!words.every((w) => pool.some((p) => p.startsWith(w)))) return null;
  return { rank: 40, field: 'name', text: entry.row.name };
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
    const query = normalise(text);
    if (!query) return [];
    const words = query.split(' ');
    const hits = [];
    for (const entry of entries) {
      const match = rankEntry(entry, query, words);
      if (match) hits.push({ entry, match });
    }
    hits.sort((a, b) =>
      a.match.rank - b.match.rank ||
      a.entry.row.name.length - b.entry.row.name.length ||
      b.entry.vertical - a.entry.vertical ||
      (a.entry.row.id < b.entry.row.id ? -1 : 1));
    return hits.slice(0, limit).map(({ entry, match }) => describe(entry, match));
  }

  function getResort(id) {
    const entry = byId.get(id);
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
    const entry = byId.get(id);
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
    return (await shards.get(cc))[id] ?? null;
  }

  return { size: entries.length, source: index.source, search, getResort, loadDetail };
}

export async function loadCatalog({ fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE } = {}) {
  const res = await fetchImpl(`${baseUrl}/catalog-index.json`);
  if (!res.ok) throw new Error(`resort catalog unavailable (${res.status})`);
  return catalogFromIndex(await res.json(), { fetchImpl, baseUrl });
}
