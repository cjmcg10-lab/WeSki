import { describe, it, expect } from 'vitest';
import { isdToHourly, presentWeather, loadRecorded, scorePicks, sameWeatherAcrossResorts, EVENTS } from '../tools/forecast_backtest.mjs';

const record = (date, over = {}) => ({ DATE: date, TMP: '-0050,1', WND: '270,1,N,0100,1', VIS: '016000,1,N,1', REM: 'MET099 METAR KXXX 011053Z 27020G30KT 10SM CLR M05/M10 A3000 RMK AO2', ...over });

describe('presentWeather', () => {
  it('reads snow intensity and rain from a METAR', () => {
    expect(presentWeather('MET METAR KXXX 011053Z 00000KT 1SM -SN OVC010 RMK AO2')).toEqual({ snow: 0.4, code: 71 });
    expect(presentWeather('MET METAR KXXX 011053Z 00000KT 1/4SM +SN FG OVC002 RMK AO2')).toEqual({ snow: 2, code: 75 });
    expect(presentWeather('MET METAR KXXX 011053Z 00000KT 5SM RA OVC010 RMK AO2')).toEqual({ snow: 0, code: 63 });
  });

  it('calls mixed rain and snow code 68 and ignores blowing snow and remarks', () => {
    expect(presentWeather('MET METAR KXXX 011053Z 00000KT 3SM RASN OVC010 RMK AO2').code).toBe(68);
    expect(presentWeather('MET METAR KXXX 011053Z 00000KT 3SM BLSN OVC010 RMK AO2')).toEqual({ snow: 0, code: 0 });
    expect(presentWeather('MET METAR KXXX 011053Z 00000KT 10SM CLR RMK AO2 SNB05')).toEqual({ snow: 0, code: 0 });
  });
});

describe('isdToHourly', () => {
  it('converts tenths of a degree, tenths of m/s, knots in gusts and metres of visibility', () => {
    const { hourly } = isdToHourly([record('2023-01-01T10:53:00')], 'UTC');
    expect(hourly.temperature_2m).toEqual([-5]);
    expect(hourly.wind_speed_10m).toEqual([10]);
    expect(hourly.wind_gusts_10m[0]).toBeCloseTo(15.4, 1);
    expect(hourly.visibility).toEqual([16000]);
    expect(hourly.apparent_temperature[0]).toBeLessThan(-5);
  });

  it('keeps one row per hour, the report nearest :53, in time order', () => {
    const { hourly } = isdToHourly([record('2023-01-01T11:53:00', { TMP: '0000,1' }), record('2023-01-01T10:20:00', { TMP: '-0100,1' }), record('2023-01-01T10:53:00', { TMP: '-0050,1' })], 'UTC');
    expect(hourly.temperature_2m).toEqual([-5, 0]);
  });

  it('turns missing values into null', () => {
    const { hourly } = isdToHourly([record('2023-01-01T10:53:00', { TMP: '+9999,9', VIS: '999999,9,9,9' })], 'UTC');
    expect(hourly.temperature_2m).toEqual([null]);
    expect(hourly.visibility).toEqual([null]);
  });
});

describe('round 1 backtest on the recorded days', () => {
  const picks = Object.fromEntries(scorePicks().map((p) => [`${p.event}:${p.date}`, p]));

  it('has recordings for every event', () => {
    for (const e of EVENTS) expect(loadRecorded(e.id).summit.weather.hourly.time.length).toBeGreaterThan(100);
  });

  it('orders memorable days sensibly', () => {
    const score = (k) => picks[k].score;
    expect(score('mammoth:2023-02-26')).toBeGreaterThan(score('mammoth:2023-02-24'));
    expect(score('mammoth:2023-02-24')).toBeGreaterThan(70);
    expect(score('stowe:2023-12-22')).toBeGreaterThan(score('stowe:2023-12-18') + 30);
    expect(score('stowe:2023-12-18')).toBeLessThan(55);
    expect(score('mammoth:2023-03-18')).toBeGreaterThan(score('mammoth:2023-03-14') + 20);
  });

  it('keeps a summit gale day out of the Great band and at Fair or below at full hold', () => {
    expect(picks['washington:2023-02-03'].hold).toBe(1);
    expect(picks['washington:2023-02-03'].score).toBeLessThanOrEqual(50.0001);
    expect(picks['washington:2023-01-31'].score).toBeLessThan(70);
  });

  it('scores the same weather the same at every resort that has a summit and a base', () => {
    const across = sameWeatherAcrossResorts(loadRecorded('washington'));
    const dayScores = (id) => across[id].days.map((d) => d.score);
    expect(dayScores('japan')).toEqual(dayScores('alpine'));
    expect(dayScores('southern')).toEqual(dayScores('alpine'));
    expect(across['small-hill'].siteMode).toBe('single');
  });
});
