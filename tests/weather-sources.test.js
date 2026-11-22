import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { forecast, resolutionKm } from '../worker/weather.js';
import { ALERT_ADAPTERS, alertsFor } from '../worker/sources/alerts.js';
import { FORECAST_ADAPTERS, independentFamilies, routeForecast } from '../worker/sources/index.js';
import { scoreForecast } from '../src/forecast/score/index.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/forecast/${name}.json`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-22T18:29:31Z');
const HOUR = 3600e3;
const STOWE = 'https://x/api/weather?lat=44.53&lon=-72.78&top=1116&base=399&tz=America/New_York';

const nwsGrid = fixture('nws-gridpoints-stowe');
const zermatt = fixture('met-locationforecast-zermatt');
const hemsedal = fixture('met-locationforecast-hemsedal');
const emptyAlerts = { features: [] };

function answer(routes) {
  vi.stubGlobal('fetch', async (u) => {
    const hit = routes.find(([part]) => String(u).includes(part));
    if (!hit) throw new Error(`unexpected ${u}`);
    return hit[1] instanceof Response ? hit[1] : new Response(JSON.stringify(hit[1]));
  });
}
const nwsRoutes = [['api.weather.gov/points', nwsGrid.point], ['gridpoints', nwsGrid.grid], ['alerts/active', emptyAlerts]];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NWS adapter on a recorded Stowe response', () => {
  it('reads the grid into hourly points, corrects the height and labels the model family', async () => {
    answer(nwsRoutes);
    const res = await forecast(new URL(STOWE), NOW);
    expect(res).toMatchObject({ source: 'nws', model: 'nws_ndfd', family: 'ncep_blend', resolutionKm: 2.5, stale: false, alerts: [] });
    const p = nwsGrid.grid.properties;
    expect(res.gridElevation.summit).toBe(p.elevation.value);
    const startOf = (v) => Date.parse(v.validTime.split('/')[0]);
    const first = p.temperature.values.find((v) => startOf(v) >= res.hours.grid[0]);
    const i = (startOf(first) - res.hours.grid[0]) / HOUR;
    expect(res.hours.summit[i].t).toBeCloseTo(first.value + (p.elevation.value - 1116) * 0.0065, 6);
    expect(res.hours.summit[i].filled).toBe(false);
    expect(res.summit.hourly.time).toHaveLength(168);
    expect(res.summit.daily.time).toHaveLength(7);
    expect(Object.keys(res).sort()).toEqual(['alerts', 'ageHours', 'base', 'family', 'fetchedAt', 'gridElevation', 'hours', 'issuedAt', 'model', 'resolutionKm', 'source', 'stale', 'summit'].sort());
  });

  it('falls back to MET Norway when the US service fails, and says which model answered', async () => {
    answer([['api.weather.gov/points', new Response('down', { status: 503 })], ['alerts/active', emptyAlerts], ['locationforecast', zermatt]]);
    const res = await forecast(new URL(STOWE), NOW);
    expect(res).toMatchObject({ source: 'met', model: 'met_locationforecast', family: 'ecmwf_ifs', resolutionKm: 9 });
  });

  it('throws when every source fails', async () => {
    answer([['api.weather.gov/points', new Response('down', { status: 503 })], ['alerts/active', emptyAlerts], ['locationforecast', new Response('down', { status: 503 })]]);
    await expect(forecast(new URL(STOWE), NOW)).rejects.toThrow('weather source 503');
  });
});

describe('MET Norway adapter on recorded responses', () => {
  const place = (lat, lon, top, base, tz) => new URL(`https://x/api/weather?lat=${lat}&lon=${lon}&top=${top}&base=${base}&tz=${tz}`);

  it('Zermatt (global model): first timestep, filled earlier hours, coarse grid, no gust of its own', async () => {
    answer([['locationforecast', zermatt], ['alerts/active', emptyAlerts]]);
    const res = await forecast(place(46.02, 7.75, 3000, 1600, 'Europe/Zurich'), NOW);
    expect(res).toMatchObject({ source: 'met', family: 'ecmwf_ifs', resolutionKm: 9, alerts: [] });
    expect(res.gridElevation).toEqual({ summit: null, base: null });
    const first = zermatt.properties.timeseries[0];
    const i = (Date.parse(first.time) - res.hours.grid[0]) / HOUR;
    expect(res.hours.summit[i].t).toBe(first.data.instant.details.air_temperature);
    expect(res.hours.summit[i].filled).toBe(false);
    expect(res.hours.summit.slice(0, i).every((h) => h.filled)).toBe(true);
    expect(first.data.instant.details.wind_speed_of_gust).toBeUndefined();
    expect(res.hours.summit[i].gust).toBeCloseTo(first.data.instant.details.wind_speed * 1.5, 6);
  });

  it('Hemsedal (Nordic model): uses MET\'s own gusts, family meps, fine grid', async () => {
    answer([['locationforecast', hemsedal], ['metalerts', emptyAlerts]]);
    const res = await forecast(place(60.86, 8.55, 1000, 650, 'Europe/Oslo'), NOW);
    expect(res).toMatchObject({ source: 'met', family: 'meps', resolutionKm: 2.5 });
    const first = hemsedal.properties.timeseries[0];
    const i = (Date.parse(first.time) - res.hours.grid[0]) / HOUR;
    expect(first.data.instant.details.wind_speed_of_gust).toBeGreaterThan(0);
    expect(res.hours.summit[i].gust).toBe(first.data.instant.details.wind_speed_of_gust);
  });
});

describe('routing', () => {
  const adapters = [
    { id: 'a', covers: (lat, lon, alt) => lat > 40 && alt > 1500, variables: ['gust'], horizonHours: 48, family: () => 'f1' },
    { id: 'b', covers: () => true, variables: ['gust', 'snow'], horizonHours: 240, family: () => 'f1' },
    { id: 'c', covers: () => true, variables: ['snow'], horizonHours: 240, family: () => 'f2' },
  ];

  it('picks by place, height, variable and lead time, in order', () => {
    const ids = (q) => routeForecast(q, adapters).map((a) => a.id);
    expect(ids({ lat: 46, lon: 7, alt: 2500, variable: 'gust', leadHours: 24 })).toEqual(['a', 'b']);
    expect(ids({ lat: 46, lon: 7, alt: 800, variable: 'gust', leadHours: 24 })).toEqual(['b']);
    expect(ids({ lat: 46, lon: 7, alt: 2500, variable: 'gust', leadHours: 120 })).toEqual(['b']);
    expect(ids({ lat: 46, lon: 7, alt: 2500, variable: 'snow', leadHours: 120 })).toEqual(['b', 'c']);
    expect(ids({ lat: 46, lon: 7, alt: 2500, leadHours: 300 })).toEqual([]);
  });

  it('counts two services of the same model family once', () => {
    expect(independentFamilies(adapters, 46, 7)).toBe(2);
    expect(independentFamilies(adapters.slice(0, 2), 46, 7)).toBe(1);
  });

  it('the live adapters: the US service first inside the US, MET Norway always last', () => {
    expect(routeForecast({ lat: 44.5, lon: -72.8 }).map((a) => a.id)).toEqual(['nws', 'met']);
    expect(routeForecast({ lat: 46, lon: 7.7 }).map((a) => a.id)).toEqual(['met']);
    expect(FORECAST_ADAPTERS.at(-1).id).toBe('met');
    expect(resolutionKm('met', 46, 7.7)).toBe(9);
    expect(resolutionKm('met', 60.8, 8.5)).toBe(2.5);
  });
});

describe('alerts on recorded responses', () => {
  const byId = (id) => ALERT_ADAPTERS.find((a) => a.id === id);

  it('NWS: a winter weather advisory for a point, with its own onset and end', async () => {
    answer([['alerts/active', fixture('nws-alerts-olympics')]]);
    const alerts = await alertsFor(47.97, -123.5);
    expect(alerts).toEqual([{ event: 'Winter Weather Advisory', level: 'advisory', from: Date.parse('2026-11-22T18:00:00-08:00'), to: Date.parse('2026-11-23T16:00:00-08:00'), source: 'nws-alerts' }]);
  });

  it('NWS: a point outside the US (HTTP 400) is passed on to Environment Canada and is not an error', async () => {
    answer([['alerts/active', new Response('{}', { status: 400 })], ['weather-alerts', emptyAlerts]]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await alertsFor(46.21, -74.58)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Environment Canada: a snowfall warning counts, an advisory that has ended does not', async () => {
    answer([['weather-alerts', fixture('eccc-alerts-kapuskasing')], ['alerts/active', new Response('{}', { status: 400 })]]);
    expect(await alertsFor(49.4, -82.4)).toEqual([expect.objectContaining({ event: 'Snowfall warning', level: 'warning', source: 'eccc-alerts' })]);
    answer([['weather-alerts', fixture('eccc-alerts-toronto-ended')]]);
    expect(await byId('eccc-alerts').fetchAlerts(43.7, -79.4)).toEqual([]);
  });

  it('MET Norway: reads the alert level and period; road ice is not a ski alert', async () => {
    answer([['metalerts', fixture('met-alerts-troms')]]);
    expect(await byId('met-alerts').fetchAlerts(69.4, 16.9)).toEqual([{ event: 'Ice', level: 'advisory', from: Date.parse('2026-11-23T14:00:00+00:00'), to: Date.parse('2026-11-23T23:00:00+00:00') }]);
    expect(await alertsFor(69.4, 16.9)).toEqual([]);
  });

  it('a failing alert service gives no alerts and is logged', async () => {
    answer([['alerts/active', new Response('down', { status: 500 })]]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await alertsFor(47.97, -123.5)).toEqual([]);
    expect(spy).toHaveBeenCalledWith('alerts failed', { source: 'nws-alerts', message: 'weather source 500' });
  });

  it('places outside every alert service get none without a request', async () => {
    answer([]);
    expect(await alertsFor(46.02, 7.75)).toEqual([]);
  });

  it('a US point never asks Environment Canada', async () => {
    const urls = [];
    vi.stubGlobal('fetch', async (u) => {
      urls.push(String(u));
      return new Response(JSON.stringify(fixture('nws-alerts-olympics')));
    });
    await alertsFor(47.97, -123.5);
    await alertsFor(44.53, -72.78);
    expect(urls.length).toBe(2);
    expect(urls.some((u) => u.includes('weather.gc.ca'))).toBe(false);
  });

  it('NWS: the end falls back from ends to eventEndingTime to expires', async () => {
    const feature = (props) => ({ features: [{ properties: { status: 'Actual', messageType: 'Alert', event: 'Winter Storm Warning', onset: '2026-11-22T10:00:00Z', ...props } }] });
    const endOf = async (props) => {
      answer([['alerts/active', feature(props)]]);
      return (await alertsFor(47.97, -123.5))[0].to;
    };
    expect(await endOf({ ends: '2026-11-23T01:00:00Z', eventEndingTime: '2026-11-23T02:00:00Z', expires: '2026-11-23T03:00:00Z' })).toBe(Date.parse('2026-11-23T01:00:00Z'));
    expect(await endOf({ ends: null, eventEndingTime: '2026-11-23T02:00:00Z', expires: '2026-11-23T03:00:00Z' })).toBe(Date.parse('2026-11-23T02:00:00Z'));
    expect(await endOf({ ends: null, expires: '2026-11-23T03:00:00Z' })).toBe(Date.parse('2026-11-23T03:00:00Z'));
  });

  it('Environment Canada: one feature with no name does not drop the others; marine and tropical alerts are left out', async () => {
    const f = (props) => ({ properties: { status_en: 'active', alert_type: 'warning', validity_datetime: '2026-11-22T10:00:00Z', expiration_datetime: '2026-11-23T10:00:00Z', ...props } });
    answer([['alerts/active', new Response('{}', { status: 400 })], ['weather-alerts', { features: [f({}), f({ alert_name_en: 'snowfall warning' }), f({ alert_name_en: 'freezing spray warning' }), f({ alert_name_en: 'tropical storm warning' })] }]]);
    expect((await alertsFor(49.4, -82.4)).map((a) => a.event)).toEqual(['Snowfall warning']);
  });

  it('a hanging alert service does not hold the forecast back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', (u) => {
      const url = String(u);
      if (url.includes('alerts/active')) return new Promise(() => {});
      const hit = nwsRoutes.find(([part]) => url.includes(part));
      return Promise.resolve(new Response(JSON.stringify(hit[1])));
    });
    const started = Date.now();
    const res = await forecast(new URL(STOWE), NOW);
    expect(res.alerts).toEqual([]);
    expect(res.source).toBe('nws');
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('the forecast carries the alerts as local times in the resort\'s zone', async () => {
    answer([...nwsRoutes.slice(0, 2), ['alerts/active', fixture('nws-alerts-olympics')]]);
    const res = await forecast(new URL('https://x/api/weather?lat=47.97&lon=-123.5&top=1600&base=600&tz=America/Los_Angeles'), NOW);
    expect(res.alerts).toEqual([{ event: 'Winter Weather Advisory', level: 'advisory', from: '2026-11-22T18:00', to: '2026-11-23T16:00', source: 'nws-alerts' }]);
  });
});

describe('alerts in the scoring engine', () => {
  const RESORT = { id: 'test', top: 1116, base: 399 };
  const weather = fixture('real-stowe-2026-11-22');
  const alert = (event, from, to) => ({ event, level: 'warning', from: `${from}T06:00`, to: `${to}T12:00`, source: 'nws-alerts' });

  it('adds one note per event on every day the alert covers and leaves the score alone', () => {
    const plain = scoreForecast(RESORT, weather, { today: '2026-11-22' });
    const alerts = [alert('Winter Storm Warning', '2026-11-23', '2026-11-24'), alert('Winter Storm Warning', '2026-11-24', '2026-11-24'), alert('High Wind Watch', '2026-11-24', '2026-11-24')];
    const out = scoreForecast(RESORT, { ...weather, alerts }, { today: '2026-11-22' });
    const notes = (o, date) => o.days.find((d) => d.date === date).notes;
    expect(notes(out, '2026-11-22')).toEqual([]);
    expect(notes(out, '2026-11-23')).toEqual([{ code: 'NT_WEATHER_ALERT', params: ['Winter Storm Warning'] }]);
    expect(notes(out, '2026-11-24')).toEqual([{ code: 'NT_WEATHER_ALERT', params: ['Winter Storm Warning'] }, { code: 'NT_WEATHER_ALERT', params: ['High Wind Watch'] }]);
    expect(out.days.map((d) => [d.score, d.status, d.confidence])).toEqual(plain.days.map((d) => [d.score, d.status, d.confidence]));
  });

  it('opts.alerts wins over the weather response', () => {
    const out = scoreForecast(RESORT, { ...weather, alerts: [alert('Wind Advisory', '2026-11-23', '2026-11-23')] }, { today: '2026-11-22', alerts: [] });
    expect(out.days.every((d) => d.notes.length === 0)).toBe(true);
  });
});
