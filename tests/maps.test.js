import { describe, it, expect } from 'vitest';
import { fromR2 } from '../worker/maps.js';

// a pretend R2 bucket: get() returns the object, or one without a body when the phone's copy is current
const bucket = (files) => ({
  async get(key, { onlyIf } = {}) {
    if (!(key in files)) return null;
    const httpEtag = `"${key.length}"`;
    if (onlyIf?.get?.('if-none-match') === httpEtag) return { httpEtag };
    return { httpEtag, body: files[key] };
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
    const buf = await fetchHeights('/data/jay-peak/terrain', async (u) => { asked.push(u); return respond(z16); });
    expect(asked).toEqual(['/data/jay-peak/terrain.z16']);
    expect(Buffer.from(buf).equals(bin)).toBe(true);
  });
  it('falls back to the plain file when the compact one is missing or is the app page', async () => {
    for (const miss of [() => new Response('no', { status: 404 }), () => respond('<!doctype html>', 'text/html')]) {
      const asked = [];
      const buf = await fetchHeights('/data/jay-peak/terrain', async (u) => { asked.push(u); return u.endsWith('.z16') ? miss() : respond(bin); });
      expect(asked).toEqual(['/data/jay-peak/terrain.z16', '/data/jay-peak/terrain.bin']);
      expect(Buffer.from(buf).equals(bin)).toBe(true);
    }
  });
  it('the server serves a compact file from R2', async () => {
    const env = { MAPS: bucket({ 'data/test-mtn/terrain.z16': 'zz' }) };
    const [q, u] = req('/data/test-mtn/terrain.z16');
    const r = await fromR2(q, env, u, ids);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/octet-stream');
  });
});
