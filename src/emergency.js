// Emergency numbers for the SOS sheet: the mountain's ski patrol line (from the resort's own published
// page, trail map or document, with its source and the date it was checked) and the country's general
// emergency numbers. Bundled into the app itself, so it works with no signal. The app never calls anyone:
// it only offers tel: links that open the phone's own dialler.
import DATA from './emergency.json';
import { nearestOnLine } from './geo.js';

export { DATA as EMERGENCY };

/** Numbers for one mountain: { country, general: [...], patrol: {...} | null, note }. */
export function emergencyFor(id) {
  const r = DATA.resorts[id] || { country: 'US' };
  const general = DATA.general[r.country] || DATA.general.US;
  return { country: r.country, general, patrol: r.phone ? r : null, note: r.note || null, checked: r.checked || null };
}

/** The number to call when unsure who to call: the first general number (911, 112, 119; 144 → 112 in the Alps). */
export function mainNumber(general) {
  return general.find((g) => g.tel === '112') || general[0];
}

/** A tel: link for a stored number: E.164 (+18022533620), with ",214" for an extension, or a short code (911). */
export function telHref(tel) {
  return 'tel:' + String(tel).replace(/[^\d+,]/g, '');
}

/** Coordinates as a dispatcher reads them: decimal degrees with N/S and E/W, plus the plain signed pair. */
export function fmtCoords(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  return {
    human: `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`,
    plain: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
  };
}

/** The shown lift closest to (x, y), if within `max` metres: { name, d, osm } (osm: its OpenStreetMap id, or null). */
export function nearestLift(resort, x, y, max = 120) {
  let best = null;
  for (const l of resort?.lifts || []) {
    if (l.hide || !l.name || !l.pts || l.pts.length < 4) continue;
    const n = nearestOnLine(l.pts, x, y);
    if (n.d <= max && (!best || n.d < best.d)) best = { name: l.name, d: n.d, osm: l.osm ?? null };
  }
  return best;
}

/** The named, shown run closest to (x, y), if within `max` metres: { name, d }. */
export function nearestRun(resort, x, y, max = 250) {
  let best = null;
  for (const t of resort?.trails || []) {
    if (t.hide || !t.name || !t.pts || t.pts.length < 4) continue;
    const n = nearestOnLine(t.pts, x, y);
    if (n.d <= max && (!best || n.d < best.d)) best = { name: t.name, d: n.d };
  }
  return best;
}

/** The host name of a source URL, for "Source: stowe.com". */
export function sourceHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
