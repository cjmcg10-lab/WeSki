import { describe, it, expect } from 'vitest';
import { scoreHours } from '../src/forecast/score/hour.js';
import { UPPER_HOLD_CAP } from '../src/forecast/score/components.js';

const times = Array.from({ length: 24 }, (_, h) => `2026-01-10T${String(h).padStart(2, '0')}:00`);
const block = (wind, gust) => ({ hourly: { time: times, temperature_2m: times.map(() => -6), apparent_temperature: times.map(() => -9), snowfall: times.map(() => 0), wind_speed_10m: times.map(() => wind), wind_gusts_10m: times.map(() => gust), weather_code: times.map(() => 0), visibility: times.map(() => 16000) } });
const row = (resort, summit, base) => scoreHours(resort, { summit, base }).rows[12];
const tall = { id: 'x', top: 2500, base: 1500 };
const calm = block(3, 5);
const gale = block(24, 32);

describe('upper-lift hold cap', () => {
  it('leaves an hour with no hold risk untouched', () => {
    const r = row(tall, calm, calm);
    expect(r.hold).toBe(0);
    expect(r.holdLoss).toBe(0);
  });

  it('puts a full upper hold at the cap or below, whatever the calm base scores', () => {
    const r = row(tall, gale, calm);
    expect(r.hold).toBe(1);
    expect(r.score).toBeLessThanOrEqual(UPPER_HOLD_CAP + 1e-9);
    expect(r.holdLoss).toBeGreaterThan(0);
  });

  it('does not apply the extra cap when only the base site has the hold', () => {
    const baseOnly = row(tall, calm, gale);
    expect(baseOnly.hold).toBe(1);
    expect(baseOnly.score).toBeGreaterThan(UPPER_HOLD_CAP);
    expect(row(tall, calm, calm).score).toBeGreaterThan(baseOnly.score);
  });

  it('does not apply it in single mode, where the one-site cap of 35 already rules', () => {
    const small = { id: 'x', top: 300, base: 250 };
    const r = row(small, gale, calm);
    expect(r.sites).toBe('single');
    expect(r.hold).toBe(0);
    const only = row(small, calm, gale);
    expect(only.sites).toBe('single');
    expect(only.score).toBeLessThanOrEqual(35 + 1e-9);
  });
});
