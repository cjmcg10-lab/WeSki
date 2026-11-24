import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { fromR2 } from '../worker/maps.js';

// a pretend R2 bucket: get() returns the object, or one without a body when the phone's copy is current
const bucket = (files) => ({
  async get(key, { onlyIf } = {}) {
    if (!(key in files)) return null;
    const httpEtag = `"${key.length}"`;
    if (onlyIf?.get?.('if-none-match') === httpEtag) return { httpEtag };
    return { httpEtag, body: files[key] };
  },
  async head(key) {
    return key in files ? { etag: createHash('md5').update(files[key]).digest('hex') } : null;
  },
});
const req = (path, headers = {}) => [new Request(`https://x${path}`, { headers }), new URL(`https://x${path}`)];
const ids = new Set(['test-mtn']);

describe('map files from R2', () => {
  const env = { MAPS: bucket({ 'data/test-mtn/resort.json': '{"id":"test-mtn"}' }) };
  it('serves a listed resort from the bucket', async () => {
    const [q, u] = req('/data/test-mtn/resort.json');
    const r = await fromR2(q, env, u, ids);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/json');
    expect(await r.text()).toBe('{"id":"test-mtn"}');
  });
  it('answers 304 when the phone already has it', async () => {
    const [q, u] = req('/data/test-mtn/resort.json', { 'if-none-match': '"25"' });
    const r = await fromR2(q, env, u, ids);
    expect(r.status).toBe(304);
  });
  it('leaves other resorts, other paths and an unbound bucket to the static files', async () => {
    for (const p of ['/data/stowe/resort.json', '/data/index.json', '/api/me', '/data/test-mtn/../x.json']) {
      const [q, u] = req(p);
      expect(await fromR2(q, env, u, ids)).toBe(null);
    }
    const [q, u] = req('/data/test-mtn/resort.json');
    expect(await fromR2(q, {}, u, ids)).toBe(null);
  });
  it('404 for a missing file of a listed resort', async () => {
    const [q, u] = req('/data/test-mtn/surround.bin');
    expect((await fromR2(q, env, u, ids)).status).toBe(404);
  });
});

describe('compact height grids (.z16)', async () => {
  const { readFileSync } = await import('node:fs');
  const { gzipSync } = await import('node:zlib');
  const { encodeHeights, decodeHeights, fetchHeights } = await import('../src/heights.js');
  const bin = readFileSync('public/data/jay-peak/terrain.bin');
  const R = JSON.parse(readFileSync('public/data/jay-peak/resort.json', 'utf8'));
  const h = new Uint16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
  const z16 = gzipSync(encodeHeights(h, R.grid.nx));
  const respond = (body, type = 'application/octet-stream') => new Response(body, { headers: { 'content-type': type } });

  it('comes back exactly, and much smaller than the plain grid', () => {
    expect(Buffer.from(decodeHeights(encodeHeights(h, R.grid.nx)).buffer).equals(bin)).toBe(true);
    expect(z16.length).toBeLessThan(bin.length * 0.6);
  });
  it('is exact for any grid, even sheer cliffs (the difference wraps round)', () => {
    const g = new Uint16Array([0, 65535, 0, 65535, 65535, 0, 65535, 0, 1, 2, 3, 4]);
    expect([...decodeHeights(encodeHeights(g, 4))]).toEqual([...g]);
  });
  it('refuses something that is not a height grid', () => {
    expect(() => decodeHeights(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toThrow();
  });
  it('the app fetches the compact file and gets the same heights as the plain one', async () => {
    const asked = [];
    const buf = await fetchHeights('/data/jay-peak/terrain', R.grid, async (u) => { asked.push(u); return respond(z16); });
    expect(asked).toEqual(['/data/jay-peak/terrain.z16']);
    expect(Buffer.from(buf).equals(bin)).toBe(true);
  });
  it('falls back to the plain file when the compact one is missing or is the app page', async () => {
    for (const miss of [() => new Response('no', { status: 404 }), () => respond('<!doctype html>', 'text/html')]) {
      const asked = [];
      const buf = await fetchHeights('/data/jay-peak/terrain', R.grid, async (u) => { asked.push(u); return u.endsWith('.z16') ? miss() : respond(bin); });
      expect(asked).toEqual(['/data/jay-peak/terrain.z16', '/data/jay-peak/terrain.bin']);
      expect(Buffer.from(buf).equals(bin)).toBe(true);
    }
  });
  it('falls back to the plain file when the compact grid is for a different size', async () => {
    const other = gzipSync(encodeHeights(h.slice(0, R.grid.nx * (R.grid.ny - 1)), R.grid.nx));
    const otherWidth = gzipSync(encodeHeights(h, R.grid.nx - 1));
    for (const wrong of [other, otherWidth]) {
      const asked = [];
      const buf = await fetchHeights('/data/jay-peak/terrain', R.grid, async (u) => { asked.push(u); return u.endsWith('.z16') ? respond(wrong) : respond(bin); });
      expect(asked).toEqual(['/data/jay-peak/terrain.z16', '/data/jay-peak/terrain.bin']);
      expect(Buffer.from(buf).equals(bin)).toBe(true);
    }
  });
  it('starts the compact download before the grid size is known, and remembers a miss', async () => {
    const asked = [];
    let sizeKnown = false;
    const fetcher = async (u) => { asked.push(u); expect(sizeKnown).toBe(false); return new Response('no', { status: 404 }); };
    const size = new Promise((r) => setTimeout(() => { sizeKnown = true; r(R.grid); }, 5));
    const skip = new Set();
    await fetchHeights('/data/a/terrain', size, async (u) => u.endsWith('.z16') ? fetcher(u) : respond(bin), skip);
    await fetchHeights('/data/a/terrain', R.grid, async (u) => { asked.push(u); return respond(bin); }, skip);
    expect(asked).toEqual(['/data/a/terrain.z16', '/data/a/terrain.bin']);
  });
  const stamp = (s) => createHash('md5').update(s).digest('hex').slice(0, 12);
  it('the server serves a compact file made from the .bin now in R2', async () => {
    const env = { MAPS: bucket({ 'data/test-mtn/terrain.bin': 'bin-2', [`data/test-mtn/terrain.${stamp('bin-2')}.z16`]: 'zz' }) };
    const [q, u] = req('/data/test-mtn/terrain.z16');
    const r = await fromR2(q, env, u, ids);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/octet-stream');
    expect(await r.text()).toBe('zz');
  });
  it('404 for a compact file made from an older .bin, or with no .bin, or with no compact copy', async () => {
    for (const files of [
      { 'data/test-mtn/terrain.bin': 'bin-2', [`data/test-mtn/terrain.${stamp('bin-1')}.z16`]: 'old' },
      { 'data/test-mtn/terrain.z16': 'old' },
      { [`data/test-mtn/terrain.${stamp('bin-2')}.z16`]: 'zz' },
      { 'data/test-mtn/terrain.bin': 'bin-2' },
    ]) {
      const [q, u] = req('/data/test-mtn/terrain.z16');
      expect((await fromR2(q, { MAPS: bucket(files) }, u, ids)).status).toBe(404);
    }
  });
});

describe('land cover round the map (landcover.z8)', async () => {
  const { gzipSync } = await import('node:zlib');
  const { decodeLandcover, fetchLandcover } = await import('../src/heights.js');
  // a 3 x 2 grid: forest, water and bare-rock shares
  const make = (nx, ny, extra = 0) => {
    const n = nx * ny, b = new Uint8Array(16 + 3 * n + extra), dv = new DataView(b.buffer);
    b.set([0x53, 0x57, 0x4c, 0x31]); dv.setUint32(4, nx, true); dv.setUint32(8, ny, true); dv.setFloat32(12, 140, true);
    for (let k = 0; k < n; k++) { b[16 + k] = 10 * k; b[16 + n + k] = 100 + k; b[16 + 2 * n + k] = 200 + k; }
    return b;
  };
  it('reads the three shares into texture texels', () => {
    const L = decodeLandcover(make(3, 2));
    expect([L.nx, L.ny, L.cell]).toEqual([3, 2, 140]);
    expect([...L.rgba.slice(4, 8)]).toEqual([10, 101, 201, 255]);
    expect([...L.rgba.slice(20, 24)]).toEqual([50, 105, 205, 255]);
  });
  it('refuses a file that is not a land cover grid, or is cut short', () => {
    expect(() => decodeLandcover(new Uint8Array(20))).toThrow();
    expect(() => decodeLandcover(make(3, 2).subarray(0, 30))).toThrow();
  });
  it('downloads and unzips it, and gives null when the map has none', async () => {
    const ok = async () => new Response(gzipSync(make(3, 2)));
    expect((await fetchLandcover('/data/x/landcover', ok)).nx).toBe(3);
    expect(await fetchLandcover('/data/x/landcover', async () => new Response('', { status: 404 }))).toBeNull();
  });
  it('the server serves a land cover file from R2', async () => {
    const env = { MAPS: bucket({ 'data/test-mtn/landcover.z8': 'zz' }) };
    const [q, u] = req('/data/test-mtn/landcover.z8');
    expect((await fromR2(q, env, u, ids)).status).toBe(200);
  });
});

describe('real tree cover (canopy.z8)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const { decodeCanopy } = await import('../src/heights.js');
  const file = 'public/data/jay-peak/canopy.z8';
  it.skipIf(!existsSync(file))('lines up with the terrain grid and has the trees where they are', () => {
    const c = decodeCanopy(gunzipSync(readFileSync(file)));
    const R = JSON.parse(readFileSync('public/data/jay-peak/resort.json', 'utf8'));
    expect([c.w, c.h, c.cell]).toEqual([(R.grid.nx - 1) * 2, (R.grid.ny - 1) * 2, R.grid.cell / 2]);
    // runs are cut through the forest: points on Jay Peak's runs are far more often open than the mountain overall
    let open = 0, n = 0;
    for (const t of R.trails) if (!t.hide && !t.glade) for (let i = 0; i < t.pts.length; i += 2) {
      const ci = Math.floor(t.pts[i] / c.cell), cj = Math.floor(t.pts[i + 1] / c.cell);
      if (ci < 0 || cj < 0 || ci >= c.w || cj >= c.h) continue;
      n++; if (c.cover[cj * c.w + ci] < 77) open++;
    }
    let all = 0;
    for (const v of c.cover) if (v < 77) all++;
    expect(open / n).toBeGreaterThan(0.75);
    expect(all / c.cover.length).toBeLessThan(0.35);
  });
  it('refuses a file that is not a canopy grid', () => {
    expect(() => decodeCanopy(new Uint8Array(20))).toThrow();
  });
  it('the server serves a canopy file from R2', async () => {
    const env = { MAPS: bucket({ 'data/test-mtn/canopy.z8': 'zz' }) };
    const [q, u] = req('/data/test-mtn/canopy.z8');
    expect((await fromR2(q, env, u, ids)).status).toBe(200);
  });
});
