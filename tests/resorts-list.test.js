import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMING_SOON } from '../src/resorts.js';

// The start screen lists built mountains (public/data/index.json) and the coming-soon ones in src/resorts.js.
// A mountain must never show twice: once built, under the same or another id, its coming-soon entry goes.
const built = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8'));
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos(a.lat * Math.PI / 180));

describe('the start-screen mountain list', () => {
  it('has no coming-soon mountain that is already built', () => {
    for (const r of COMING_SOON) {
      const twin = built.find((b) => b.id === r.id || km(b, r) < 15);
      expect(twin, `${r.name} is built as ${twin?.id}: remove it from src/resorts.js`).toBeUndefined();
    }
  });

  it('has no two built mountains with the same name or the same summit', () => {
    const norm = (s) => s.toLowerCase().replace(/^(mont|mount|mt\.?)\s+/, '').replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < built.length; i++) {
      for (let j = i + 1; j < built.length; j++) {
        const a = built[i], b = built[j];
        expect(norm(a.name) === norm(b.name) && a.region === b.region, `${a.id} and ${b.id} share a name`).toBe(false);
        expect(km(a, b) < 0.5, `${a.id} and ${b.id} share a summit`).toBe(false);
      }
    }
  });
});
