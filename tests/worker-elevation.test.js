import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { elevationResponse, parsePlace, pngPixel, terrariumMetres, tileOf } from '../worker/elevation.js';

const tile = new Uint8Array(readFileSync(new URL('./fixtures/terrarium-12-2135-1457.png', import.meta.url)));
const ask = (query, deps) => elevationResponse(new URL(`https://skiwithme.test/api/elevation${query}`), deps);
const tileFetch = () => vi.fn(async () => new Response(tile, { headers: { 'content-type': 'image/png' } }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function crc32(bytes) {
  let c, crc = ~0;
  for (const byte of bytes) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return ~crc >>> 0;
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

const paethOf = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function encodePng(rows, channels, filters, colorType = channels === 3 ? 2 : 6, interlace = 0) {
  const width = rows[0].length / channels;
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(rows.length, 4);
  head.set([8, colorType, 0, 0, interlace], 8);
  const lines = rows.map((row, y) => {
    const f = filters[y % filters.length];
    const above = y ? rows[y - 1] : new Array(row.length).fill(0);
    const out = row.map((v, i) => {
      const a = i >= channels ? row[i - channels] : 0, b = above[i], c = i >= channels ? above[i - channels] : 0;
      const guess = [0, a, b, (a + b) >> 1, paethOf(a, b, c)][f];
      return (v - guess) & 255;
    });
    return Buffer.from([f, ...out]);
  });
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.concat(lines))), chunk('IEND', Buffer.alloc(0))]));
}

describe('which terrain tile and pixel hold a point', () => {
  it('finds the Matterhorn pixel at zoom 12', () => {
    expect(tileOf(45.9763, 7.6586)).toEqual({ z: 12, x: 2135, y: 1457, px: 35, py: 150 });
  });

  it('stays inside the tile at the edges of the map', () => {
    expect(tileOf(0, 180)).toMatchObject({ x: 4095, px: 255 });
    expect(tileOf(85, -180)).toMatchObject({ x: 0, px: 0 });
  });
});

describe('reading a pixel from a recorded Terrarium tile', () => {
  it.each([
    [0, 0, 2782.69921875],
    [35, 150, 4273.60546875],
    [255, 255, 2966.0703125],
    [10, 200, 2928.5390625],
    [200, 10, 2115.1640625],
  ])('pixel %i,%i is %f m (checked against an independent decode of the same file)', async (px, py, metres) => {
    expect(terrariumMetres(await pngPixel(tile, px, py))).toBeCloseTo(metres, 6);
  });

  it('reads every PNG row filter, with and without an alpha channel', async () => {
    const rows3 = [[10, 20, 30, 40, 50, 60, 70, 80, 90], [11, 22, 33, 44, 55, 66, 77, 88, 99], [200, 5, 7, 1, 2, 3, 250, 251, 252], [9, 8, 7, 6, 5, 4, 3, 2, 1]];
    for (const filters of [[0], [1], [2], [3], [4], [4, 3, 2, 1, 0]]) {
      const png = encodePng(rows3, 3, filters);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) expect(await pngPixel(png, x, y)).toEqual(rows3[y].slice(x * 3, x * 3 + 3));
    }
    const rows4 = [[1, 2, 3, 255, 4, 5, 6, 255], [200, 100, 50, 255, 7, 8, 9, 255]];
    expect(await pngPixel(encodePng(rows4, 4, [4, 1]), 1, 1)).toEqual([7, 8, 9]);
  });

  it('refuses what it cannot read instead of guessing', async () => {
    await expect(pngPixel(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 0, 0)).rejects.toThrow('not a PNG');
    await expect(pngPixel(encodePng([[1, 2, 3]], 3, [0], 3), 0, 0)).rejects.toThrow('unsupported PNG layout');
    await expect(pngPixel(encodePng([[1, 2, 3]], 3, [0], 2, 1), 0, 0)).rejects.toThrow('unsupported PNG layout');
    await expect(pngPixel(encodePng([[1, 2, 3]], 3, [0]), 5, 0)).rejects.toThrow('no pixel');
    await expect(pngPixel(encodePng([[1, 2, 3]], 3, [0]), 0, 4)).rejects.toThrow('no pixel');
  });
});

describe('GET /api/elevation', () => {
  it('answers whole metres for a point and asks the tile server as weski-build', async () => {
    const fetchImpl = tileFetch();
    const res = await ask('?lat=45.9763&lon=7.6586', { fetchImpl });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ elevation: 4274, source: 'terrain-tiles' });
    expect(res.headers.get('cache-control')).toContain('max-age=86400');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2135/1457.png');
    expect(init.headers['user-agent']).toBe('weski-build');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['no place', ''],
    ['text for a latitude', '?lat=north&lon=7'],
    ['an empty longitude, which Number() would turn into 0', '?lat=45&lon='],
    ['a latitude past the map', '?lat=86&lon=7'],
    ['a longitude past the globe', '?lat=45&lon=181'],
    ['Infinity', '?lat=Infinity&lon=7'],
  ])('refuses %s with a 400 and never calls the tile server', async (_name, query) => {
    const fetchImpl = tileFetch();
    const res = await ask(query, { fetchImpl });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/lat/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(parsePlace(new URL(`https://x.test/${query}`))).toBeNull();
  });

  it('answers 502 when the tile server fails, is slow or sends something unreadable, and does not cache the failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored = new Map();
    vi.stubGlobal('caches', { default: { match: async (r) => stored.get(r.url), put: async (r, res) => { stored.set(r.url, res); } } });
    for (const fetchImpl of [
      async () => new Response('nope', { status: 503 }),
      async () => { throw new DOMException('timed out', 'TimeoutError'); },
      async () => new Response('not a png at all'),
    ]) {
      const res = await ask('?lat=45.9763&lon=7.6586', { fetchImpl });
      expect(res.status).toBe(502);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect((await res.json()).error).toMatch(/did not answer/);
    }
    expect(stored.size).toBe(0);
  });

  it('keeps an answer in the data centre cache by place, so the next ask never reaches the tile server', async () => {
    const stored = new Map();
    vi.stubGlobal('caches', { default: { match: async (r) => stored.get(r.url)?.clone(), put: async (r, res) => { stored.set(r.url, res); } } });
    const fetchImpl = tileFetch();
    await ask('?lat=45.9763&lon=7.6586', { fetchImpl });
    const again = await ask('?lat=45.97630&lon=7.658600', { fetchImpl });
    expect(await again.json()).toEqual({ elevation: 4274, source: 'terrain-tiles' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect([...stored.keys()]).toEqual(['https://elevation.invalid/v1/45.9763/7.6586']);
  });
});
