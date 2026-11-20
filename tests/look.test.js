import { describe, it, expect } from 'vitest';
import { parseLook, lookString } from '../src/look.js';

describe('rider look', () => {
  it('older looks without a stance ride regular', () => {
    expect(parseLook('boy-board~k1h0t0a1c0g0p0q0b1n0').stance).toBe(0);
    expect(parseLook('girl-board').stance).toBe(0);
  });
  it('goofy stance survives the trip to the group and back', () => {
    const L = { ...parseLook('girl-board'), stance: 1 };
    const s = lookString(L);
    expect(s).toMatch(/s1$/);
    expect(parseLook(s).stance).toBe(1);
    expect(parseLook(s).ride).toBe('board');
  });
});
