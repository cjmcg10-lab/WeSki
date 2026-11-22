import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCatalog, resortPlace, resetCatalogMemory } from '../worker/catalog.js';

const raw = readFileSync(new URL('../public/forecast/catalog-index.json', import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 10, 22, 15);

const assetsServing = (text, status = 200) => ({ ASSETS: { fetch: vi.fn(async () => new Response(text, { status })) } });

beforeEach(() => {
  resetCatalogMemory();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('server-side resort list', () => {
  it('reads every listed resort from the real catalog, with the verified points, heights and time zone', () => {
    const { byId, aliases } = parseCatalog(JSON.parse(raw));
    expect(byId.size).toBeGreaterThan(4000);
    expect(byId.get('stowe')).toEqual({ lat: 44.5376, lon: -72.8142, blat: 44.5107, blon: -72.7674, top: 1116, base: 399, tz: 'America/New_York' });
    expect(aliases.size).toBeGreaterThan(100);
  });

  it('looks up a listed id, resolves an old id through idAliases, and refuses anything else', async () => {
    const env = assetsServing(raw);
    const { idAliases } = JSON.parse(raw);
    const [oldId, newId] = Object.entries(idAliases).find(([, to]) => to === 'palisades-tahoe');
    expect((await resortPlace(env, 'stowe', NOW)).id).toBe('stowe');
    expect(await resortPlace(env, oldId, NOW)).toMatchObject({ id: newId });
    expect(await resortPlace(env, 'constructor', NOW)).toBeNull();
    expect(await resortPlace(env, 'made-up-resort', NOW)).toBeNull();
  });

  it('reads the list once an hour', async () => {
    const env = assetsServing(raw);
    await resortPlace(env, 'stowe', NOW);
    await resortPlace(env, 'alta', NOW + 59 * 60e3);
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    await resortPlace(env, 'alta', NOW + 61 * 60e3);
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(2);
  });

  it('uses the data centre cache before the assets', async () => {
    const stored = new Map();
    vi.stubGlobal('caches', { default: { match: async (r) => (stored.has(r.url) ? new Response(stored.get(r.url)) : undefined), put: async (r, res) => { stored.set(r.url, await res.text()); } } });
    const env = assetsServing(raw);
    await resortPlace(env, 'stowe', NOW);
    resetCatalogMemory();
    expect((await resortPlace(env, 'stowe', NOW)).id).toBe('stowe');
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
  });

  it('records nobody when the list cannot be read: no binding, an error, or the app shell served instead', async () => {
    expect(await resortPlace({}, 'stowe', NOW)).toBeNull();
    expect(await resortPlace(assetsServing('', 500), 'stowe', NOW)).toBeNull();
    expect(await resortPlace(assetsServing('<!doctype html><title>app</title>'), 'stowe', NOW)).toBeNull();
    expect(await resortPlace(assetsServing(JSON.stringify({ fields: ['id'], rows: [] })), 'stowe', NOW)).toBeNull();
  });
});
