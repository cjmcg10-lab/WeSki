const RESORT_ID = /^[a-z0-9-]{2,40}$/;
const LOCAL_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d/;
const FETCH_TIMEOUT_MS = 6000;

export const assumedStatus = (id) => ({ id, source: 'assumed', fetchedAt: null, updatedAt: null, hours: null, season: null, closures: {}, liftHolds: [], grooming: [], assumed: true });

const isStatus = (s) => s && typeof s === 'object' && typeof s.id === 'string' && s.closures && typeof s.closures === 'object' && Array.isArray(s.liftHolds) && Array.isArray(s.grooming);

/** The resort's published hours, season, closures, lift holds and grooming; the labelled assumed status offline or on any failure. */
export async function loadResortStatus(resort, fetchImpl = globalThis.fetch) {
  if (!RESORT_ID.test(resort?.id || '')) return assumedStatus(resort?.id ?? null);
  try {
    const res = await fetchImpl(`/api/resort-status/${resort.id}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return assumedStatus(resort.id);
    const status = await res.json();
    return isStatus(status) ? status : assumedStatus(resort.id);
  } catch {
    return assumedStatus(resort.id);
  }
}

const validHours = (h) => h && Number.isInteger(h.from) && Number.isInteger(h.to) && h.from >= 0 && h.to <= 24 && h.to - h.from >= 1;
const validHold = (h) => h && typeof h.lift === 'string' && typeof h.status === 'string' && typeof h.date === 'string';
const validGrooming = (g) => g && typeof g.at === 'string' && LOCAL_TIME.test(g.at);

/** The options `scoreForecast` takes, dropping anything malformed. A missing `hours` leaves the engine's labelled assumed window in place. */
export function statusToScoreOpts(status) {
  const s = status ?? assumedStatus(null);
  return {
    hours: validHours(s.hours) ? { from: s.hours.from, to: s.hours.to } : undefined,
    closures: s.closures && typeof s.closures === 'object' ? s.closures : {},
    liftHolds: Array.isArray(s.liftHolds) ? s.liftHolds.filter(validHold) : [],
    season: s.season && typeof s.season === 'object' ? s.season : undefined,
    grooming: Array.isArray(s.grooming) ? s.grooming.filter(validGrooming) : [],
  };
}
