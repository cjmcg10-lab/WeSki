// Compact form of a resort's height grids (terrain.bin, surround.bin) for download.
//
// The .bin files are plain 16-bit heights, which general-purpose compression barely shrinks, and
// Cloudflare does not compress them at all. Each height is predicted from its neighbours
// (west + north - north-west, the slope of the ground continued) and only the small difference is
// kept, split into a low-byte and a high-byte half. Gzipped, that is about 56% smaller than the
// .bin across the 60 resorts. The result is exact: the grid comes back bit for bit.
//
// File (.z16) = gzip( "SWH1", nx (uint32 LE), count (uint32 LE), low bytes [count], high bytes [count] ).
// Shared by the app (decode, in the browser) and the build tools (encode, in Node).

const MAGIC = [0x53, 0x57, 0x48, 0x31]; // "SWH1"

const predict = (h, i, nx) => {
  const x = i % nx;
  if (i < nx) return x ? h[i - 1] : 0;                       // first row: the height to the west
  if (!x) return h[i - nx];                                  // first column: the height to the north
  return h[i - 1] + h[i - nx] - h[i - nx - 1];
};

/** Uint16Array grid, nx wide -> Uint8Array (still to be gzipped). */
export function encodeHeights(h, nx) {
  const n = h.length, out = new Uint8Array(12 + 2 * n), dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  dv.setUint32(4, nx, true);
  dv.setUint32(8, n, true);
  for (let i = 0; i < n; i++) {
    const r = (h[i] - predict(h, i, nx)) & 0xffff;           // wraps round, so any grid is exact
    out[12 + i] = r & 0xff;
    out[12 + n + i] = r >> 8;
  }
  return out;
}

/** Uint8Array from encodeHeights (after gunzip) -> Uint16Array grid. With expect {nx, ny}, a grid of another size throws. */
export function decodeHeights(bytes, expect) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 12 || MAGIC.some((m, k) => b[k] !== m)) throw new Error('not a height grid');
  const dv = new DataView(b.buffer, b.byteOffset, b.length), nx = dv.getUint32(4, true), n = dv.getUint32(8, true);
  if (!nx || b.length !== 12 + 2 * n) throw new Error('height grid is cut short');
  if (expect && (nx !== expect.nx || n !== expect.nx * expect.ny)) throw new Error('height grid is for a different map');
  const h = new Uint16Array(n);
  for (let i = 0; i < n; i++) h[i] = (b[12 + i] | (b[12 + n + i] << 8)) + predict(h, i, nx);   // Uint16Array wraps round too
  return h;
}

/**
 * Fetch a height grid for the app: the compact .z16 where the browser can unzip it, else the plain
 * .bin (older browsers, a resort not yet uploaded in the compact form, or a compact grid whose size is
 * not expect's {nx, ny}). expect may be a promise, so the download starts before resort.json has
 * arrived. A resort whose compact file was missing or wrong is remembered in `skip` (a Set kept by the
 * caller) and goes straight to the .bin next time. Returns an ArrayBuffer of 16-bit heights, exactly
 * what the .bin holds.
 */
export async function fetchHeights(base, expect, fetcher = fetch, skip = new Set()) {
  if (typeof DecompressionStream !== 'undefined' && !skip.has(base)) {
    try {
      const r = await fetcher(`${base}.z16`);
      // (a missing file can come back as the app's own page, from the single-page fallback)
      if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) {
        const raw = new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        const [bytes, size] = await Promise.all([raw, expect]);
        try { return decodeHeights(new Uint8Array(bytes), size).buffer; } catch (e) { skip.add(base); throw e; }
      }
      skip.add(base);
    } catch { /* fall back to the plain file */ }
  }
  const r = await fetcher(`${base}.bin`);
  if (!r.ok) throw new Error(`${base}.bin`);
  return r.arrayBuffer();
}
