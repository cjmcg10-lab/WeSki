// What the start-screen globe shows for each mountain: a little peak whose height comes from the
// mountain's vertical drop (greatly exaggerated, so heights can be compared at a glance).
// Pure functions, so they can be tested without a browser.

/** Vertical drop (m) used when a mountain's summit or base height is not known. */
export const DEFAULT_DROP = 500;
/** Drops at or above this get the tallest peak. */
export const MAX_DROP = 2400;

/**
 * Peak height on the globe, 0.25 to 1 (1 = the tallest), from the vertical drop in metres.
 * A square root keeps a 300 m hill visible while a 2,000 m Alpine resort still stands about
 * two and a half times taller.
 */
export function peakHeight(drop) {
  const d = Number.isFinite(drop) && drop > 0 ? drop : DEFAULT_DROP;
  return Math.max(0.25, Math.min(1, Math.sqrt(d / MAX_DROP)));
}

/** A place's vertical drop in metres, or null when its summit or base height is missing. */
export function dropOf(p) {
  return Number.isFinite(p?.top) && Number.isFinite(p?.base) && p.top > p.base ? p.top - p.base : null;
}

const km = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r), y = (bLat - aLat) * r;
  return Math.hypot(x, y) * 6371;
};

/**
 * Read the Forecast catalogue (public/forecast/catalog-index.json) for the globe:
 * - `drops`: a drop for each place in `places` that has none of its own (coming-soon mountains), taken from
 *   the biggest catalogue mountain within 10 km;
 * - `others`: catalogue mountains with a known drop of at least `minDrop` that have no map and are not within
 *   3 km of a place already shown (the Forecast-only mountains).
 */
export function catalogMarks(index, places, { minDrop = 100 } = {}) {
  const f = index?.fields ?? [];
  const at = (name) => f.indexOf(name);
  const I = { name: at('name'), lat: at('lat'), lon: at('lon'), top: at('top'), base: at('base'), flags: at('flags') };
  const rows = Array.isArray(index?.rows) ? index.rows : [];
  const drops = new Map(), others = [];
  const need = places.filter((p) => dropOf(p) == null);
  for (const row of rows) {
    const lat = row[I.lat], lon = row[I.lon];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const drop = dropOf({ top: row[I.top], base: row[I.base] });
    for (const p of need) {
      if (drop != null && km(p.lat, p.lon, lat, lon) < 10 && drop > (drops.get(p.id) ?? 0)) drops.set(p.id, drop);
    }
    if (drop == null || drop < minDrop || row[I.flags] & 8) continue;
    if (places.some((p) => Math.abs(p.lat - lat) < 0.05 && km(p.lat, p.lon, lat, lon) < 3)) continue;
    others.push({ name: row[I.name], lat, lon, drop });
  }
  return { drops, others };
}
