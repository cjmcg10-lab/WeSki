// Make the compact .z16 copies of a resort's height grids (see src/heights.js), for the app build
// (static resorts) and for the upload to R2 (tools/maps_r2.mjs).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeHeights } from '../src/heights.js';

/** {'terrain.z16': Buffer, 'surround.z16': Buffer} for the grids this resort folder has. R = its resort.json. */
export function packResort(dir, R) {
  const out = {};
  for (const [name, nx] of [['terrain', R.grid?.nx], ['surround', R.surround?.nx]]) {
    const f = join(dir, `${name}.bin`);
    if (!nx || !existsSync(f)) continue;
    const b = readFileSync(f);
    const h = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    if (h.length % nx) throw new Error(`${f}: ${h.length} heights is not a whole number of rows of ${nx}`);
    out[`${name}.z16`] = gzipSync(encodeHeights(h, nx), { level: 9 });
  }
  return out;
}
