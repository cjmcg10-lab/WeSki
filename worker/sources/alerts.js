import { cachedJson, inCanada, inNorway, inUS } from '../weather-util.js';

const ALERT_TTL_S = 300;
const ALERT_BUDGET_MS = 1500;
const ALERT_FETCH = { timeoutMs: 1400, exactTtl: true };
const NOT_SKI_WEATHER = /tropical|storm surge|dust|freezing spray|marine|coastal|surf|hurricane|typhoon|flood|small craft|tsunami/i;
const alertJson = (url) => cachedJson(url, ALERT_TTL_S, {}, ALERT_FETCH);
const SKI_RELEVANT = /winter|blizzard|snow|ice storm|freezing|wind chill|extreme cold|cold weather|high wind|extreme wind|wind (advisory|warning|watch)|gale|(?<!thunder)storm|avalanche/i;

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const levelOf = (s) => (/warning/i.test(s) ? 'warning' : /watch/i.test(s) ? 'watch' : 'advisory');
const MET_LEVEL = { yellow: 'advisory', orange: 'warning', red: 'warning' };

const nwsAlerts = {
  id: 'nws-alerts',
  covers: (lat, lon) => inUS(lat, lon),
  async fetchAlerts(lat, lon) {
    let body;
    try {
      body = await alertJson(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`);
    } catch (e) {
      if (e.message === 'weather source 400') return null;
      throw e;
    }
    return body.features.map((f) => f.properties)
      .filter((p) => p.status === 'Actual' && p.messageType !== 'Cancel')
      .map((p) => ({ event: p.event, level: levelOf(p.event), from: Date.parse(p.onset || p.effective), to: Date.parse(p.ends || p.eventEndingTime || p.expires) }));
  },
};

const ecccAlerts = {
  id: 'eccc-alerts',
  covers: (lat, lon) => inCanada(lat, lon),
  async fetchAlerts(lat, lon) {
    const at = `${lon.toFixed(4)},${lat.toFixed(4)}`;
    const body = await alertJson(`https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=${at},${at}`);
    return body.features.map((f) => f.properties)
      .filter((p) => p.status_en !== 'ended')
      .map((p) => ({ event: capital(p.alert_name_en ?? ''), level: p.alert_type === 'warning' || p.alert_type === 'watch' ? p.alert_type : 'advisory', from: Date.parse(p.validity_datetime), to: Date.parse(p.event_end_datetime || p.expiration_datetime) }));
  },
};

const metAlerts = {
  id: 'met-alerts',
  covers: (lat, lon) => inNorway(lat, lon),
  async fetchAlerts(lat, lon) {
    const body = await alertJson(`https://api.met.no/weatherapi/metalerts/2.0/current.json?lang=en&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
    return body.features
      .filter((f) => f.properties.status === 'Actual' && f.properties.geographicDomain === 'land')
      .map((f) => ({ event: f.properties.eventAwarenessName, level: MET_LEVEL[(f.properties.riskMatrixColor || '').toLowerCase()] || 'advisory', from: Date.parse(f.when?.interval?.[0]), to: Date.parse(f.when?.interval?.[1] || f.properties.eventEndingTime) }));
  },
};

export const ALERT_ADAPTERS = [nwsAlerts, ecccAlerts, metAlerts];
async function lookup(lat, lon, adapters) {
  for (const adapter of adapters.filter((x) => x.covers(lat, lon))) {
    try {
      const found = await adapter.fetchAlerts(lat, lon);
      if (found === null) continue;
      return found
        .map((a) => ({ ...a, source: adapter.id }))
        .filter((a) => a.event && SKI_RELEVANT.test(a.event) && !NOT_SKI_WEATHER.test(a.event) && Number.isFinite(a.from) && Number.isFinite(a.to))
        .sort((a, b) => a.from - b.from);
    } catch (e) {
      console.error('alerts failed', { source: adapter.id, message: e.message });
      return [];
    }
  }
  return [];
}

export async function alertsFor(lat, lon, adapters = ALERT_ADAPTERS, budgetMs = ALERT_BUDGET_MS) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.error('alerts too slow', { budgetMs });
      resolve([]);
    }, budgetMs);
  });
  try {
    return await Promise.race([lookup(lat, lon, adapters), late]);
  } finally {
    clearTimeout(timer);
  }
}
