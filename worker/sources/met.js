import { cachedJson, codeFrom, inNordics, windChill } from '../weather-util.js';

const MET_CODE = (s, t, mm) => {
  const sym = (s || '').replace(/_(day|night|polartwilight)$/, '');
  const heavy = /^heavy/.test(sym), light = /^light/.test(sym);
  if (/thunder/.test(sym)) return { thunder: true };
  if (/snow/.test(sym)) return { snowCm: heavy ? Math.max(mm, 1.5) : light ? Math.min(mm, 0.29) || 0.1 : Math.max(mm, 0.3) };
  if (/sleet/.test(sym)) return { sleet: true };
  if (/rain/.test(sym)) return { rainMm: heavy ? Math.max(mm, 2.5) : Math.max(mm, 0.2), freezing: t < 0 };
  if (sym === 'fog') return { fog: true };
  return { cloud: sym === 'clearsky' ? 0 : sym === 'fair' ? 15 : sym === 'partlycloudy' ? 50 : 90 };
};

async function fetchPoint(lat, lon, alt, tz, grid) {
  const m = await cachedJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&altitude=${Math.round(alt)}`, 3600);
  const ts = m.properties.timeseries.map((x) => ({ at: Date.parse(x.time), ...x.data }));
  const hours = grid.map((h) => {
    let e = ts[0];
    for (const x of ts) { if (x.at <= h) e = x; else break; }
    const d = e.instant.details;
    const one = e.at === h && e.next_1_hours;
    const blk = one ? e.next_1_hours : e.next_6_hours || e.next_12_hours || {};
    const mm = one ? (blk.details?.precipitation_amount ?? 0) : (blk.details?.precipitation_amount ?? 0) / 6;
    const t = d.air_temperature, wind = d.wind_speed ?? 0;
    const sym = blk.summary?.symbol_code || '';
    const snow = /snow/.test(sym) || (mm > 0 && t <= 0) ? mm : /sleet/.test(sym) ? mm / 2 : 0;
    const rain = snow > 0 ? (/sleet/.test(sym) ? mm / 2 : 0) : mm;
    const pop = one ? e.next_1_hours.details?.probability_of_precipitation : e.next_6_hours?.details?.probability_of_precipitation;
    const fog = d.fog_area_fraction;
    const c = MET_CODE(sym, t, snow);
    return {
      t, feels: windChill(t, wind), wind,
      gust: d.wind_speed_of_gust ?? wind * 1.5, dir: d.wind_from_direction ?? 0, cloud: d.cloud_area_fraction ?? 0,
      pop: pop ?? null, snow, rain, vis: fog == null ? null : fog >= 50 ? 500 : fog >= 20 ? 3000 : 20000, frz: null,
      acc: one ? 1 : e.next_6_hours ? 6 : e.next_12_hours ? 12 : 1, filled: h < ts[0].at,
      code: codeFrom({ cloud: d.cloud_area_fraction ?? 0, fog: fog >= 50, rainMm: rain, ...c, snowCm: snow > 0.05 ? snow : (c.snowCm ?? 0) }),
    };
  });
  return { hours, issued: Date.parse(m.properties.meta?.updated_at || ''), gridElevation: null };
}

export const met = {
  id: 'met',
  model: 'met_locationforecast',
  family: (lat, lon) => (inNordics(lat, lon) ? 'meps' : 'ecmwf_ifs'),
  covers: () => true,
  variables: ['temperature', 'feels', 'wind', 'gust', 'snow', 'rain', 'precipitation_probability', 'visibility', 'weather_code'],
  horizonHours: 168,
  nominalKm: (lat, lon) => (inNordics(lat, lon) ? 2.5 : 9),
  fetchPoint,
};
