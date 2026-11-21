import { describe, it, expect } from 'vitest';
import { hourGrid, sunTimes, shape, fillFreezing } from '../worker/weather.js';

describe('server weather', () => {
  it('builds 7 days of hours from local midnight', () => {
    const g = hourGrid('America/New_York', Date.UTC(2026, 10, 21, 15, 30));
    expect(g.length).toBe(168);
    expect(new Date(g[0]).toISOString()).toBe('2026-11-21T05:00:00.000Z'); // midnight in New York (UTC-5)
  });
  it('gives sensible sunrise and sunset', () => {
    const [rise, set] = sunTimes('2026-11-21', 44.53, -72.78, 'America/New_York'); // Stowe
    expect(rise).toMatch(/^2026-11-21T0[67]:/);
    expect(set).toMatch(/^2026-11-21T16:/);
  });
  it('shapes hours into the fields the app reads', () => {
    const g = hourGrid('UTC', Date.UTC(2026, 10, 21, 10));
    const hours = g.map((_, i) => ({ t: -5 + (i % 24) / 4, feels: -9, wind: 4, gust: 8, dir: 270, cloud: 50, pop: i < 24 ? 30 : null, snow: i === 12 ? 2 : 0, rain: 0, vis: 9000, frz: null, code: i === 12 ? 75 : 2 }));
    const base = hours.map((h) => ({ ...h, t: h.t + 6 }));
    fillFreezing(hours, base, 2000, 1000);
    expect(hours[0].frz).toBeGreaterThan(1000);
    const w = shape(hours, g, 'UTC', 46, 7.7, Date.UTC(2026, 10, 21, 10, 20));
    expect(w.current.time).toBe('2026-11-21T10:00');
    expect(w.daily.time.length).toBe(7);
    expect(w.daily.snowfall_sum[0]).toBe(2);
    expect(w.daily.weather_code[0]).toBe(75);
    expect(w.daily.precipitation_probability_max[1]).toBe(null);
    expect(w.hourly.time.length).toBe(168);
  });
});
