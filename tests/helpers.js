import { readFileSync } from 'node:fs';
import { Geo } from '../src/geo.js';
export function loadResort() {
  const resort = JSON.parse(readFileSync('public/data/resort.json', 'utf8'));
  const buf = readFileSync('public/data/terrain.bin');
  const heights = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  return { resort, geo: new Geo(resort, heights) };
}
