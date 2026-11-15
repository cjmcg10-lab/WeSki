import { readFileSync } from 'node:fs';
import { Geo } from '../src/geo.js';
export function loadResort(id = 'jay-peak') {
  const resort = JSON.parse(readFileSync(`public/data/${id}/resort.json`, 'utf8'));
  const buf = readFileSync(`public/data/${id}/terrain.bin`);
  const heights = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  return { resort, geo: new Geo(resort, heights) };
}
