import { describe, it, expect } from 'vitest';
import { peakHeight, dropOf, DEFAULT_DROP } from '../src/globemarks.js';

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
});
