import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { catalogFromIndex, loadCatalog, normalise, forecastPoints } from '../src/forecast/catalog.js';

const readJson = (url) => JSON.parse(readFileSync(new URL(url, import.meta.url), 'utf8'));
const fixture = (name) => readJson(`./fixtures/forecast/${name}.json`);
const index = () => fixture('catalog-index');
const catalog = () => catalogFromIndex(index());
const ids = (hits) => hits.map((h) => h.id);

const FIELDS = ['id', 'name', 'aliases', 'towns', 'region', 'cc', 'lat', 'lon', 'baseLat', 'baseLon', 'top', 'base', 'tz', 'flags'];
const row = (id, name, { aliases = [], towns = [], top = 2000, base = 1000 } = {}) =>
  [id, name, aliases, towns, 'Region', 'US', 40, -111, 40, -111, top, base, 0, 0];
const synthetic = (rows) => catalogFromIndex({ v: 1, fields: FIELDS, countries: { US: 'United States' }, tz: ['America/Denver'], rows });

const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const fakeFetch = (routes) => vi.fn(async (url) => (url in routes ? jsonResponse(routes[url]) : jsonResponse({}, false, 404)));

describe('search ranking', () => {
  const ranked = synthetic([
    row('a-substring', 'Superwhistlerville'),
    row('b-word', 'Mount Whistler Hill'),
    row('c-prefix', 'Whistler Blackcomb'),
    row('d-town', 'Valley Chair', { towns: ['Whistler'] }),
    row('e-alias', 'Garibaldi Lifts', { aliases: ['Whistler'] }),
    row('f-exact', 'Whistler'),
  ]);

  it('puts an exact name first, then an exact alias, an exact town, a prefix, a word start and a substring', () => {
    expect(ids(ranked.search('whistler'))).toEqual(['f-exact', 'e-alias', 'd-town', 'c-prefix', 'b-word', 'a-substring']);
  });

  it('breaks ties with the shorter name, then the bigger vertical', () => {
    const tied = synthetic([
      row('long-name', 'Alpine Meadows Village', { top: 3000, base: 1000 }),
      row('short-big', 'Alpine Rune', { top: 3000, base: 1000 }),
      row('short-small', 'Alpine Rung', { top: 1200, base: 1000 }),
    ]);
    expect(ids(tied.search('alpine'))).toEqual(['short-big', 'short-small', 'long-name']);
  });

  it('skips substring matches for queries under three letters and ignores empty or unmatched queries', () => {
    const c = synthetic([row('x', 'Xylophone Hill')]);
    expect(c.search('yl')).toEqual([]);
    expect(c.search('ylo')).toHaveLength(1);
    expect(c.search('   ')).toEqual([]);
    expect(c.search('nowhere')).toEqual([]);
  });

  it('honours the result limit', () => {
    const many = synthetic(Array.from({ length: 30 }, (_, i) => row(`m-${i}`, `Maple ${i}`)));
    expect(many.search('maple')).toHaveLength(20);
    expect(many.search('maple', { limit: 5 })).toHaveLength(5);
  });
});

describe('duplicates and word forms', () => {
  const LEVIN = 'osd-6ff3d800655f463f2ea8d24980630b01000c';
  const OLD_LEVI = 'osd-320399283a80967e546c20333d2abd884201';
  const TRYSIL = 'osd-24ab41e1438aff639aa8ef5ad91c3e187e2f';
  const OLD_TRYSIL = 'osd-2c88b829f47e39a1ec21f81e37abb7d5b668';

  it('puts the real resort first when its empty duplicate was folded in as an alias', () => {
    const hits = catalog().search('levi');
    expect(hits[0]).toMatchObject({ id: LEVIN, name: 'Levin hiihtokeskus', match: { field: 'alias', text: 'Levi' } });
    expect(catalog().getResort(OLD_LEVI)).toMatchObject({ id: LEVIN, top: 530, missing: [] });
  });

  it('returns one Trysil and resolves the folded id to it', () => {
    expect(ids(catalog().search('trysil'))).toEqual([TRYSIL]);
    expect(catalog().getResort(OLD_TRYSIL).id).toBe(TRYSIL);
  });

  it('ranks a resort with missing heights or approximate points below a complete one in the same tier', () => {
    const flagged = (id, name, flags) => [id, name, [], [], 'Region', 'US', 40, -111, 40, -111, flags & 1 ? null : 2000, 1000, 0, flags];
    const c = synthetic([flagged('a-empty', 'Pine Hill', 5), flagged('b-complete', 'Pine Mountain', 0), flagged('c-exact-empty', 'Pine', 1)]);
    expect(ids(c.search('pine'))).toEqual(['c-exact-empty', 'b-complete', 'a-empty']);
  });

  it('treats Mt and Mount, and St, Saint and Sankt, as the same word on both sides', () => {
    const c = catalog();
    expect(normalise('St. Anton')).toBe(normalise('Sankt Anton'));
    expect(c.search('mt buller')[0].name).toBe('Mount Buller');
    expect(c.search('mount buller')[0].name).toBe('Mount Buller');
    expect(c.search('mount hood meadows')[0].name).toBe('Mt. Hood Meadows Ski Resort');
    expect(c.search('mt hood')[0].name).toBe('Mt. Hood Meadows Ski Resort');
  });

  it('ranks a whole-word match above a mid-word prefix, for every spelling of Saint', () => {
    for (const q of ['st anton', 'sankt anton', 'saint anton', 'St. Anton']) {
      expect(catalog().search(q).map((h) => h.name).slice(0, 2), q).toEqual(['St. Anton/St. Christoph/Stuben', 'St. Antönien']);
    }
  });

  it('keeps a half-typed abbreviation matching names that start with those letters', () => {
    const c = synthetic([row('a', 'Stowe'), row('b', 'St. Anton'), row('c', 'Sankt Moritz'), row('d', 'Whistler')]);
    expect(ids(c.search('st')).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('forecastPoints', () => {
  it('falls back to the other height when one is missing and gives up when both are', () => {
    const batawa = catalog().getResort('osd-001ec7c57bf7ee15d967293b14f9ba8dcf5c');
    expect(forecastPoints(batawa)).toMatchObject({ top: 108, base: 108 });
    expect(forecastPoints({ ...batawa, base: null })).toBeNull();
    expect(forecastPoints(null)).toBeNull();
  });
});

describe('names, spellings and towns', () => {
  it('matches accents either way', () => {
    const c = catalog();
    expect(c.search('spindleruv mlyn')[0].name).toBe('Skiareál Špindlerův Mlýn - Medvědín');
    expect(c.search('Špindlerův')[0].name).toBe('Skiareál Špindlerův Mlýn - Medvědín');
    expect(c.search('brevent flegere')[0].name).toBe('Brévent/Flégère');
    expect(normalise('  Crêt-du-Midi!! ')).toBe('cret du midi');
  });

  it('finds a resort by an alternate or local-script name and says which name matched', () => {
    const c = catalog();
    const local = c.search('ニセコモイワスキー場');
    expect(local[0]).toMatchObject({ name: 'Niseko Moiwa Ski Resort', country: 'Japan', match: { field: 'alias', text: 'ニセコモイワスキー場' } });
    expect(c.search('jay peak resort')[0].id).toBe('jay-peak');
  });

  it('finds a resort by a nearby town and shows its region and country', () => {
    const [hit] = catalog().search('perisher village');
    expect(hit).toMatchObject({ name: 'Perisher', region: 'New South Wales', country: 'Australia', match: { field: 'town', text: 'Perisher Village' } });
  });

  it('lets a region or country word narrow a multi-word query', () => {
    const c = catalog();
    expect(ids(c.search('batawa ontario'))).toEqual(['osd-001ec7c57bf7ee15d967293b14f9ba8dcf5c']);
    expect(c.search('batawa chile')).toEqual([]);
  });
});

describe('getResort', () => {
  it('returns the engine shape for a small local hill', () => {
    expect(catalog().getResort('osd-02af76862bbc9a55d3685f3ef4d42e7a9f08')).toEqual({
      id: 'osd-02af76862bbc9a55d3685f3ef4d42e7a9f08', name: 'Cranor Hill Municipal Ski Hill', region: 'Colorado', country: 'United States',
      tz: 'America/Denver', lat: 38.5838, lon: -106.8968, baseLat: 38.5868, baseLon: -106.8957, top: 2494, base: 2397, missing: [], hasMap: false,
    });
  });

  it('returns Southern Hemisphere resorts with their own zones and negative latitudes', () => {
    const c = catalog();
    expect(c.getResort('osd-6509c4ab0514c35a94f1a436029ea69c8de5')).toMatchObject({ country: 'Chile', tz: 'America/Santiago', top: 3346, base: 2578 });
    expect(c.getResort('osd-976d9a75995718d0e06985401b4909133169')).toMatchObject({ country: 'New Zealand', tz: 'Pacific/Auckland' });
    expect(c.getResort('osd-562a20a601646b66731b356f79d1bcdd26a6')).toMatchObject({ country: 'Australia', tz: 'Australia/Sydney' });
    expect(c.getResort('osd-996de78b34e97c95d665d00cd0b668cfaee6').lat).toBeLessThan(0);
  });

  it('keeps a built resort under its built id with its verified points and a map flag', () => {
    const c = catalog();
    expect(c.getResort('jay-peak')).toEqual({
      id: 'jay-peak', name: 'Jay Peak', region: 'Vermont', country: 'United States', tz: 'America/New_York',
      lat: 44.9241, lon: -72.5262, baseLat: 44.9359, baseLon: -72.5008, top: 1166, base: 560, missing: [], hasMap: true,
    });
    expect(c.search('jay peak')[0]).toMatchObject({ id: 'jay-peak', hasMap: true });
  });

  it('returns an incomplete resort with the missing pieces named', () => {
    const batawa = catalog().getResort('osd-001ec7c57bf7ee15d967293b14f9ba8dcf5c');
    expect(batawa).toMatchObject({ name: 'Batawa', top: null, base: 108, missing: ['top', 'points'] });
  });

  it('returns null for an unknown id', () => {
    expect(catalog().getResort('nowhere')).toBeNull();
  });
});

describe('detail shards', () => {
  const MULTI = 'osd-1fd29b021584344dd3b8f2960fe561faf357';
  const routes = () => ({ '/forecast/detail/AT.json': fixture('catalog-detail-AT') });

  it('lists the sectors of a multi-sector resort and fetches each country shard once', async () => {
    const fetchImpl = fakeFetch(routes());
    const c = catalogFromIndex(index(), { fetchImpl });
    const detail = await c.loadDetail(MULTI);
    expect(detail.sectors.length).toBeGreaterThan(1);
    expect(detail.sectors[0]).toMatchObject({ base: { elev: 723 }, top: { elev: 2004 } });
    expect(detail.src).toEqual({ base: 'lifts', top: 'lifts' });
    await c.loadDetail(MULTI);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns null for an unknown id and retries after a failed shard fetch', async () => {
    const fetchImpl = fakeFetch({});
    const c = catalogFromIndex(index(), { fetchImpl });
    expect(await c.loadDetail('nowhere')).toBeNull();
    await expect(c.loadDetail(MULTI)).rejects.toThrow(/unavailable/);
    const second = fakeFetch(routes());
    const retry = catalogFromIndex(index(), { fetchImpl: second });
    await expect(retry.loadDetail(MULTI)).resolves.toMatchObject({ osd: expect.any(String) });
  });
});

describe('loading the index', () => {
  it('reads the index through the injected fetch', async () => {
    const fetchImpl = fakeFetch({ '/forecast/catalog-index.json': index() });
    const c = await loadCatalog({ fetchImpl });
    expect(c.size).toBe(index().rows.length);
    expect(c.search('portillo')[0].country).toBe('Chile');
  });

  it('rejects when the index cannot be fetched or is the wrong version', async () => {
    await expect(loadCatalog({ fetchImpl: fakeFetch({}) })).rejects.toThrow(/unavailable \(404\)/);
    await expect(loadCatalog({ fetchImpl: fakeFetch({ '/forecast/catalog-index.json': { v: 2, rows: [] } }) })).rejects.toThrow(/expected version/);
  });
});

describe('the committed catalog', () => {
  const full = readJson('../public/forecast/catalog-index.json');
  const built = readJson('../public/data/index.json');
  const c = catalogFromIndex(full);

  it('holds every built resort under its built id with the points from public/data/index.json', () => {
    for (const b of built) {
      expect(c.getResort(b.id), b.id).toMatchObject({ id: b.id, tz: b.tz, top: Math.round(b.top), base: Math.round(b.base), hasMap: true, missing: [] });
    }
    expect(c.search('jay peak')[0].id).toBe('jay-peak');
  });

  it('points every id alias at a resort in the catalog', () => {
    const known = new Set(full.rows.map((r) => r[0]));
    for (const [old, now] of Object.entries(full.idAliases)) {
      expect(known.has(old), old).toBe(false);
      expect(known.has(now), now).toBe(true);
    }
    expect(c.getResort('osd-e1a32fce69402dd1c018c22b0216990d0775').id).toBe('jay-peak');
  });

  it('gives every resort an id the server routes accept and a time zone', () => {
    const idPattern = /^[a-z0-9-]{2,40}$/;
    const seen = new Set();
    for (const r of full.rows) {
      expect(r[0]).toMatch(idPattern);
      expect(seen.has(r[0])).toBe(false);
      seen.add(r[0]);
      expect(full.tz[r[12]]).toEqual(expect.any(String));
    }
  });

  it('finds well-known resorts in both hemispheres by name', () => {
    expect(c.search('cerro catedral')[0].country).toBe('Argentina');
    expect(c.search('coronet peak')[0].country).toBe('New Zealand');
    expect(c.search('hakuba happo')[0].country).toBe('Japan');
  });
});
