import { describe, it, expect } from 'vitest';
import { loopTimer, detachSegments, shuttle, swing, tramRide } from '../src/liftmotion.js';

describe('detachable lift: slows down in the stations', () => {
  const L = 1500, r = 2.4, V = 10, v = 1;
  const segs = detachSegments(L, r, V, v);
  const timer = loopTimer(segs);

  it('the loop is exactly the cable loop: two lines and two half turns', () => {
    expect(timer.len).toBeCloseTo(2 * L + 2 * Math.PI * r, 6);
  });

  it('takes longer than a fixed-grip lap at line speed, but not much longer', () => {
    const fixed = timer.len / V;
    expect(timer.T).toBeGreaterThan(fixed);
    expect(timer.T).toBeLessThan(fixed + 120);
  });

  it('moves slowly at the stations and at line speed mid-line', () => {
    const dt = 0.01;
    const speedAt = (tau) => (timer.at(tau + dt) - timer.at(tau)) / dt;
    expect(speedAt(0.1)).toBeCloseTo(v, 1);                 // just leaving the bottom station
    // find the time the carrier is half way up
    let tau = 0;
    while (timer.at(tau) < L / 2) tau += 0.5;
    expect(speedAt(tau)).toBeCloseTo(V, 1);
    // and round the top bullwheel
    while (timer.at(tau) < L + 1) tau += 0.05;
    expect(speedAt(tau)).toBeCloseTo(v, 1);
  });

  it('never goes backwards and wraps round', () => {
    let prev = -1;
    for (let tau = 0; tau < timer.T - 0.01; tau += timer.T / 2000) {
      const s = timer.at(tau);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
    expect(timer.at(timer.T + 3)).toBeCloseTo(timer.at(3), 6);
    expect(timer.at(-2)).toBeCloseTo(timer.at(timer.T - 2), 6);
  });

  it('carriers evenly spaced in time bunch up in the stations', () => {
    const n = 60, at = (i) => timer.at((i * timer.T) / n);
    const gaps = [];
    for (let i = 0; i < n; i++) gaps.push((at(i + 1) - at(i) + timer.len) % timer.len);
    expect(Math.min(...gaps)).toBeLessThan(8);       // in a station: a few metres apart
    expect(Math.max(...gaps)).toBeGreaterThan(40);   // on the line: far apart
  });

  it('reports braking as negative acceleration', () => {
    // the slowing-down stretch just before the top station
    let tau = 0;
    while (timer.at(tau) < L - 20) tau += 0.05;
    timer.at(tau);
    expect(timer.acc).toBeLessThan(0);
    while (timer.at(tau) < L + 20) tau += 0.05;
    while (timer.at(tau) < L + Math.PI * r + 20) tau += 0.05;
    timer.at(tau);
    expect(timer.acc).toBeGreaterThan(0);              // speeding up after the turn
  });

  it('a very short lift still has a full-speed part and the right length', () => {
    const t2 = loopTimer(detachSegments(40, 2.4, 10, 1));
    expect(t2.len).toBeCloseTo(80 + 2 * Math.PI * 2.4, 6);
    expect(Number.isFinite(t2.T)).toBe(true);
  });
});

describe('aerial tram shuttle', () => {
  const ride = 60, dwell = 12;
  it('starts at the bottom, reaches the top after one ride, waits, then comes back', () => {
    expect(shuttle(0, ride, dwell).f).toBeCloseTo(0, 6);
    expect(shuttle(ride, ride, dwell).f).toBeCloseTo(1, 6);
    expect(shuttle(ride + dwell / 2, ride, dwell).f).toBe(1);
    expect(shuttle(ride + dwell / 2, ride, dwell).v).toBe(0);
    expect(shuttle(2 * ride + dwell, ride, dwell).f).toBeCloseTo(0, 6);
    expect(shuttle(2 * (ride + dwell) + 5, ride, dwell).f).toBeCloseTo(shuttle(5, ride, dwell).f, 9);
  });

  it('is half way at half time, moving at full speed in the middle', () => {
    const s = shuttle(ride / 2, ride, dwell);
    expect(s.f).toBeCloseTo(0.5, 6);
    expect(s.a).toBe(0);
    expect(s.v).toBeGreaterThan(1 / ride);            // faster than average, since it eased out
  });

  it('speeds up out of the station and slows into the next one', () => {
    expect(shuttle(1, ride, dwell).a).toBeGreaterThan(0);
    expect(shuttle(ride - 1, ride, dwell).a).toBeLessThan(0);
    expect(shuttle(1, ride, dwell).v).toBeLessThan(shuttle(ride / 2, ride, dwell).v);
    // coming down: negative speed
    expect(shuttle(ride + dwell + ride / 2, ride, dwell).v).toBeLessThan(0);
  });

  it('moves smoothly: no jumps in position', () => {
    let prev = shuttle(0, ride, dwell).f;
    for (let t = 0.05; t < 2 * (ride + dwell); t += 0.05) {
      const f = shuttle(t, ride, dwell).f;
      expect(Math.abs(f - prev)).toBeLessThan(0.002);
      prev = f;
    }
  });

  it('ride time: real time halved, kept between 30 and 150 s', () => {
    expect(tramRide(2244, 390)).toBe(150);
    expect(tramRide(800, 120)).toBe(60);
    expect(tramRide(200, 0)).toBe(30);
  });
});

describe('carrier swing', () => {
  it('stays small, and braking swings forward (negative)', () => {
    for (let t = 0; t < 30; t += 0.3) expect(Math.abs(swing(t, 1.3))).toBeLessThan(0.04);
    expect(swing(0, 0, -3)).toBeLessThan(swing(0, 0, 0));
    expect(Math.abs(swing(0, 0, -100))).toBeLessThan(0.2);
  });
});
