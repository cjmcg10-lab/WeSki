export const PIN_PREFIX = 'pin-';
export const MATCH_KM = 3;
export const TZ_MAX_KM = 300;
const ID_RE = /^[a-z0-9-]{1,40}$/;
const ELEVATION_TIMEOUT_MS = 8000;
const MAX_HEIGHT_M = 9000;
const MIN_HEIGHT_M = -500;

export const isPin = (resort) => resort?.pin === true;

export function newPinId(taken = [], bytes = () => crypto.getRandomValues(new Uint8Array(6))) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = PIN_PREFIX + [...bytes()].map((b) => (b % 36).toString(36)).join('');
    if (!taken.includes(id)) return id;
  }
  throw new Error('could not make a pin id');
}

export const validId = (id) => ID_RE.test(id);

const round5 = (n) => Math.round(n * 1e5) / 1e5;

export function parseCoordinate(text, limit) {
  const clean = String(text ?? '').trim().replace(',', '.');
  const n = clean === '' ? NaN : Number(clean);
  return Number.isFinite(n) && Math.abs(n) <= limit ? round5(n) : null;
}

const THOUSANDS = /^-?\d{1,3}(,\d{3})+$/;

export function parseHeight(text) {
  const trimmed = String(text ?? '').trim();
  const clean = THOUSANDS.test(trimmed) ? trimmed.replaceAll(',', '') : trimmed.replace(',', '.');
  const n = clean === '' ? NaN : Number(clean);
  return Number.isFinite(n) && n >= MIN_HEIGHT_M && n <= MAX_HEIGHT_M ? Math.round(n) : null;
}

export const pointAt = (lat, lon) => ({ lat: round5(lat), lon: round5(lon), elev: null });

export function zoneFor(lat, lon, nearest = []) {
  const near = nearest.find((r) => r.tz && r.km <= TZ_MAX_KM);
  if (near) return { tz: near.tz, guessed: false };
  const hours = Math.round(lon / 15);
  return { tz: hours === 0 ? 'Etc/GMT' : `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`, guessed: true };
}

export function makePin({ id, name, base, top = null, tz, tzGuessed = false }) {
  return {
    id,
    name: name.trim(),
    region: '',
    country: '',
    pin: true,
    tz,
    tzGuessed,
    lat: top ? top.lat : base.lat,
    lon: top ? top.lon : base.lon,
    baseLat: base.lat,
    baseLon: base.lon,
    top: top ? top.elev : null,
    base: base.elev,
    missing: [],
  };
}

export const draftFrom = (resort) => ({
  mode: 'edit',
  id: resort.id,
  name: resort.name,
  base: { lat: resort.baseLat, lon: resort.baseLon, elev: resort.base ?? resort.top ?? null },
  top: resort.top != null && resort.base != null ? { lat: resort.lat, lon: resort.lon, elev: resort.top } : null,
});

export const sameNameIn = (list, name, ownId) => {
  const key = name.trim().toLowerCase();
  return list.find((r) => r.id !== ownId && r.name.trim().toLowerCase() === key) ?? null;
};

export function draftProblem(draft, list) {
  const clash = sameNameIn(list, draft.name ?? '', draft.id);
  if (!(draft.name ?? '').trim()) return { field: 'name', key: 'name' };
  if (clash) return { field: 'name', key: 'duplicate', name: clash.name };
  if (!draft.base) return { field: 'base', key: 'nobase' };
  if (draft.base.elev == null) return { field: 'hbase', key: 'baseheight' };
  if (draft.top && draft.top.elev == null) return { field: 'htop', key: 'topheight' };
  if (draft.top && draft.top.elev <= draft.base.elev) return { field: 'htop', key: 'toplow' };
  return null;
}

export async function fetchElevation(lat, lon, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(`/api/elevation?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(ELEVATION_TIMEOUT_MS) });
    if (!res.ok) return null;
    const { elevation } = await res.json();
    return Number.isFinite(elevation) ? elevation : null;
  } catch {
    return null;
  }
}
