const UA = 'weski-build';
const ZOOM = 12;
const TILE_SIZE = 256;
const FETCH_TIMEOUT_MS = 6000;
const CACHE_S = 30 * 86400;
const MAX_LAT = 85;
const MIN_HEIGHT_M = -500;
const MAX_HEIGHT_M = 9000;
const SOURCE = 'terrain-tiles';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS = { 2: 3, 6: 4 };

const tileUrl = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const respond = (data, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

export function parsePlace(url) {
  const num = (k) => (url.searchParams.get(k)?.trim() ? Number(url.searchParams.get(k)) : NaN);
  const lat = num('lat'), lon = num('lon');
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= MAX_LAT && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function tileOf(lat, lon, z = ZOOM) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.floor(fx)), y = Math.min(n - 1, Math.max(0, Math.floor(fy)));
  return { z, x, y, px: Math.min(TILE_SIZE - 1, Math.floor((fx - x) * TILE_SIZE)), py: Math.min(TILE_SIZE - 1, Math.floor((fy - y) * TILE_SIZE)) };
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export async function pngPixel(png, px, py) {
  if (PNG_SIGNATURE.some((b, i) => png[i] !== b)) throw new Error('not a PNG');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0, height = 0, channels = 0;
  const parts = [];
  for (let at = 8; at + 8 <= png.length;) {
    const size = view.getUint32(at), type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const body = png.subarray(at + 8, at + 8 + size);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      channels = CHANNELS[body[9]];
      if (body[8] !== 8 || !channels || body[12] !== 0) throw new Error('unsupported PNG layout');
    } else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;
    at += 12 + size;
  }
  if (!width || px >= width || py >= height || !parts.length) throw new Error('PNG has no pixel there');
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((offset, p) => { joined.set(p, offset); return offset + p.length; }, 0);
  const raw = await inflate(joined);
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error('PNG data is short');
  let prev = new Uint8Array(stride);
  for (let y = 0; y <= py; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] += a;
      else if (filter === 2) line[i] += b;
      else if (filter === 3) line[i] += (a + b) >> 1;
      else if (filter === 4) line[i] += paeth(a, b, c);
      else if (filter !== 0) throw new Error('unknown PNG filter');
    }
    if (y === py) return [line[px * channels], line[px * channels + 1], line[px * channels + 2]];
    prev = line;
  }
  throw new Error('PNG has no pixel there');
}

export const terrariumMetres = ([r, g, b]) => r * 256 + g + b / 256 - 32768;

export async function elevationAt(lat, lon, fetchImpl = fetch) {
  const { z, x, y, px, py } = tileOf(lat, lon);
  const url = tileUrl(z, x, y);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(url);
  const hit = cache && (await cache.match(key));
  let bytes;
  if (hit) bytes = new Uint8Array(await hit.arrayBuffer());
  else {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`terrain tile ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  const metres = Math.round(terrariumMetres(await pngPixel(bytes, px, py)));
  if (!hit && cache) await cache.put(key, new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': `public, max-age=${CACHE_S}` } }));
  return metres >= MIN_HEIGHT_M && metres <= MAX_HEIGHT_M ? metres : null;
}

const cacheKey = ({ lat, lon }) => new Request(`https://elevation.invalid/v1/${lat.toFixed(4)}/${lon.toFixed(4)}`);

export async function elevationResponse(url, { fetchImpl = fetch } = {}) {
  const place = parsePlace(url);
  if (!place) return respond({ error: 'Give lat between -85 and 85 and lon between -180 and 180.' }, 400);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = cacheKey(place);
  const hit = cache && (await cache.match(key));
  if (hit) return hit;
  try {
    const out = respond({ elevation: await elevationAt(place.lat, place.lon, fetchImpl), source: SOURCE }, 200, `public, max-age=86400, s-maxage=${CACHE_S}`);
    if (cache) await cache.put(key, out.clone());
    return out;
  } catch (e) {
    console.error('elevation failed', { message: e.message });
    return respond({ error: 'The elevation service did not answer.' }, 502);
  }
}
