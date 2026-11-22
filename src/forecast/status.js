const RESORT_ID = /^[a-z0-9-]{2,40}$/;

export const assumedStatus = (id) => ({ id, source: 'assumed', fetchedAt: null, hours: null, season: null, closures: {}, liftHolds: [], grooming: [], assumed: true });

const isStatus = (s) => s && typeof s === 'object' && typeof s.id === 'string' && typeof s.closures === 'object' && Array.isArray(s.liftHolds) && Array.isArray(s.grooming);

/** The resort's published hours, season, closures, lift holds and grooming; the labelled assumed status offline or on any failure. */
export async function loadResortStatus(resort, fetchImpl = globalThis.fetch) {
  if (!RESORT_ID.test(resort?.id || '')) return assumedStatus(resort?.id ?? null);
  try {
    const res = await fetchImpl(`/api/resort-status/${resort.id}`);
    if (!res.ok) return assumedStatus(resort.id);
    const status = await res.json();
    return isStatus(status) ? status : assumedStatus(resort.id);
  } catch {
    return assumedStatus(resort.id);
  }
}

/** The options `scoreForecast` takes. A missing `hours` leaves the engine's labelled assumed window in place. */
export function statusToScoreOpts(status) {
  const s = status ?? assumedStatus(null);
  return {
    hours: s.hours ? { from: s.hours.from, to: s.hours.to } : undefined,
    closures: s.closures ?? {},
    liftHolds: s.liftHolds ?? [],
    season: s.season ?? undefined,
    grooming: s.grooming ?? [],
  };
}
