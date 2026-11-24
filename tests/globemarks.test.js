import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { peakHeight, dropOf, catalogMarks, DEFAULT_DROP } from '../src/globemarks.js';

describe('globe peaks', () => {
  it('maps vertical drop to a readable peak height', () => {
    expect(peakHeight(2400)).toBe(1);
    expect(peakHeight(5000)).toBe(1);
    expect(peakHeight(50)).toBe(0.25);
    expect(peakHeight(300)).toBeGreaterThan(0.25);
    expect(peakHeight(2000) / peakHeight(300)).toBeGreaterThan(2.4);
    expect(peakHeight(null)).toBe(peakHeight(DEFAULT_DROP));
  });

  it('reads the drop only when both heights are known', () => {
    expect(dropOf({ top: 1200, base: 300 })).toBe(900);
    expect(dropOf({ top: 1200 })).toBe(null);
    expect(dropOf({ top: 300, base: 300 })).toBe(null);
  });

  it('takes coming-soon heights and Forecast-only mountains from the catalogue', () => {
    const index = JSON.parse(readFileSync('public/forecast/catalog-index.json', 'utf8'));
    const places = [
      { id: 'jay-peak', lat: 44.9379, lon: -72.5045, top: 1165, base: 559, available: true },
      { id: 'whistler', lat: 50.115, lon: -122.948 },
    ];
    const { drops, others } = catalogMarks(index, places);
    expect(drops.get('whistler')).toBeGreaterThan(1200);
    expect(drops.has('jay-peak')).toBe(false);
    expect(others.length).toBeGreaterThan(1000);
    expect(others.every((o) => o.drop >= 100)).toBe(true);
    // nothing drawn on top of a mountain that is already shown
    expect(others.some((o) => Math.abs(o.lat - 44.9379) < 0.02 && Math.abs(o.lon + 72.5045) < 0.03)).toBe(false);
  });
});
