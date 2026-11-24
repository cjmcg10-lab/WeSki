// Building looks on the 3D map. Every building keeps its real footprint and height; its style only picks the skin
// (wall material, windows, colours) and a few small features (deck, belfry, clock faces, roll-up door).
//
// The style is chosen by tools/building_style.py when the map is built (stored as `st` on each building in
// resort.json). Maps built before that are classified here with the same rules (classifyBuilding) from what
// resort.json keeps: name, the hotel kind, footprint, height, storeys and whether the building stands beside a lift
// station or a summit. Both read src/building_words.json; tests/fixtures/building_styles.json checks they agree.
// See "Building styles" in docs/VISUALS_PLAN.md.
import WORDS from './building_words.json';

export const STYLES = ['lodge', 'rest', 'hut', 'hotel', 'chapel', 'tower', 'service', 'garage'];
const BIG_LIFTS = ['chair', 'gondola', 'tram', 'funicular'];
const NEAR_LIFT = 90, NEAR_PEAK = 150;

/** Lower case without accents (Hütte -> hutte). */
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
const tokens = (s) => new Set(s.split(/[^0-9a-zÀ-ɏ぀-ヿ一-鿿]+/).filter(Boolean));

/**
 * One of STYLES. tags: OpenStreetMap tags (building, amenity, tourism, man_made, shop, leisure, name); area in m²,
 * h the wall height in m, levels the storeys if known; atBase / atTop: beside a lift's bottom or top station (or a
 * summit). Mirrors classify() in tools/building_style.py rule for rule.
 */
export function classifyBuilding({ tags = {}, area, h, levels = null, atBase = false, atTop = false }) {
  const name = norm(tags.name), toks = tokens(name), T = WORDS.tags;
  const b = tags.building || '', am = tags.amenity || '', tu = tags.tourism || '', mm = tags.man_made || '';
  const lv = levels || 0;
  const hit = (cat) => WORDS[cat].words.some((w) => toks.has(w)) || WORDS[cat].parts.some((p) => name.includes(p));
  if ((h >= 8 && (T.tower.includes(b) || (mm === 'tower' && area <= 150) || (hit('tower') && area <= 300 && !hit('hotel'))))
    || (h >= 10 && area <= 150 && h >= 2.2 * Math.sqrt(area))) return 'tower';
  if (T.chapel.includes(b) || am === 'place_of_worship' || (hit('chapel') && !hit('hotel'))) return 'chapel';
  if (T.parking.includes(b) || am === 'parking' || hit('parking')) return area >= 300 ? 'garage' : 'service';
  if (T.garage.includes(b) || hit('garage')) return area >= 600 ? 'garage' : 'service';
  if (hit('lodge_strong')) return area >= 120 ? 'lodge' : 'hut';
  if (T.patrol_amenity.includes(am) || hit('patrol')) return area >= 200 ? 'lodge' : 'hut';
  if (T.hotel_tourism.includes(tu) || hit('hotel') || ['hotel', 'apartments', 'dormitory'].includes(b)) return 'hotel';
  if (T.food_amenity.includes(am) || hit('restaurant')) {
    if (area < 60) return 'hut';
    return atBase && !atTop && area >= 400 ? 'lodge' : 'rest';
  }
  if (T.hut_tourism.includes(tu) || am === 'shelter' || hit('hut')) return 'hut';
  if (hit('lodge')) return area >= 150 ? 'lodge' : 'hut';
  if (hit('service') || T.service_amenity.includes(am) || T.service.includes(b) || mm) return 'service';
  if (T.hut.includes(b)) return lv >= 3 || area >= 600 ? 'hotel' : 'hut';
  if (T.hotel.includes(b)) return area < 120 && lv < 3 ? 'hut' : 'hotel';
  if (T.public.includes(b) || tags.shop || tags.leisure) {
    if (atTop && area >= 80) return 'rest';
    return area >= 250 ? 'lodge' : 'hut';
  }
  if (atTop) return area >= 80 ? 'rest' : 'hut';
  if (atBase && area >= 400) return 'lodge';
  if (area < 40) return 'service';
  if (lv >= 3 || h >= 12) return 'hotel';
  if (area >= 1500) return 'service';
  return area < 350 ? 'hut' : 'hotel';
}

/** [area m², centre x, centre y] of a flat [x0, y0, x1, y1, ...] ring (resort.json local metres). */
export function footprint(pts) {
  const n = pts.length / 2;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[(2 * i + 2) % (2 * n)], y1 = pts[(2 * i + 3) % (2 * n)];
    a += x0 * y1 - x1 * y0; cx += x0; cy += y0;
  }
  return [Math.abs(a) / 2, cx / n, cy / n];
}

/** [atBase, atTop] for a building centred at cx, cy: within 90 m of a chair, gondola, tram or funicular end, or
 * 150 m of a named summit. */
export function styleContext(cx, cy, lifts = [], pois = []) {
  const near = (x, y, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  let base = false, top = false;
  for (const L of lifts) {
    if (!BIG_LIFTS.includes(L.kind)) continue;
    const p = L.pts, n = p.length;
    base ||= near(p[0], p[1], NEAR_LIFT);
    top ||= near(p[n - 2], p[n - 1], NEAR_LIFT);
  }
  top ||= pois.some((P) => P.kind === 'peak' && near(P.x, P.y, NEAR_PEAK));
  return [base, top];
}

/** The style of a resort.json building: the stored one, or worked out here for maps built before it was stored. */
export function buildingStyle(b, lifts, pois) {
  if (STYLES.includes(b.st)) return b.st;
  const [area, cx, cy] = footprint(b.pts);
  const [atBase, atTop] = styleContext(cx, cy, lifts, pois);
  const tags = { name: b.name || '', building: b.roof ? 'roof' : b.kind === 'hotel' ? 'hotel' : 'yes' };
  return classifyBuilding({ tags, area, h: b.h, levels: b.levels ?? null, atBase, atTop });
}

/** A stable number from 0 to 1 for a building (from its first corner), so neighbours of one style differ. */
export function buildingSeed(b) {
  let h = 2166136261;
  for (const v of [Math.round(b.pts[0] * 10), Math.round(b.pts[1] * 10), b.pts.length]) {
    h ^= v & 0xffff; h = Math.imul(h, 16777619); h ^= v >>> 16; h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}

// Wall materials painted by the building shader (src/models.js buildingMaterial). A wall has an upper material
// (coloured by the building's wall colour) and a lower one up to `low` metres (stone or concrete plinth, a stone
// ground floor), which keeps the material's own colour.
export const MAT = { plain: 0, timber: 1, stone: 2, render: 3, metal: 4, glass: 5, open: 6, door: 7, clock: 8, louvre: 9, concrete: 10 };
// Window patterns: 0 none, 1 plain rows, 2 small with shutters, 3 every floor with a balcony rail, 4 glazed ground
// floor (the front of a base lodge), 5 a few small high windows, 6 tall narrow church windows, 7 wide panorama windows.
export const WIN = { none: 0, rows: 1, shutters: 2, balconies: 3, glassFront: 4, sparse: 5, tall: 6, panorama: 7 };

/**
 * How each style looks. walls / roofs: colour choices (picked by the building's seed); upper / lower: wall
 * materials and how high the lower one reaches (m, from the wall height h and storey height s); win: windows on
 * the side walls, front: on the front (downhill) wall; roof: the shape when OpenStreetMap gives none (from the
 * footprint area and wall height); pitch: how steep a pitched roof is (1 = the usual); features: extra pieces.
 */
export const LOOK = {
  lodge: {
    walls: ['#8a6446', '#7b5a3f', '#9a7352', '#6f5039'], roofs: ['#3d4148', '#5a2f2a', '#34403a'],
    upper: MAT.timber, lower: MAT.stone, low: (h, s) => Math.min(1.1, h * 0.3), win: WIN.panorama, front: WIN.glassFront,
    roof: (a, h) => (h > 14 ? 'flat' : a < 900 ? 'gabled' : 'hipped'), pitch: 0.9, deck: 'upper',
  },
  rest: {
    walls: ['#7a5538', '#8c6243', '#6a4a33', '#94704f'], roofs: ['#4a4f57', '#3e3a36', '#5b3a30'],
    upper: MAT.timber, lower: MAT.stone, low: (h, s) => Math.min(s, h * 0.45), win: WIN.panorama, front: WIN.panorama,
    roof: (a, h) => (h > 14 ? 'flat' : a < 900 ? 'gabled' : 'hipped'), pitch: 0.8, deck: 'band',
  },
  hut: {
    walls: ['#5e4330', '#6b4a32', '#54402f', '#74513a', '#4f3b2c', '#8a6a4c', '#7d5f45'], roofs: ['#3a3c40', '#4a3a30', '#5a3028', '#43403b'],
    upper: MAT.timber, lower: MAT.stone, low: (h) => Math.min(0.9, h * 0.25), win: WIN.shutters, front: WIN.shutters,
    roof: (a, h) => (h > 14 ? 'flat' : 'gabled'), pitch: 1, chimney: true,
  },
  hotel: {
    walls: ['#e6dcc8', '#d9cdb5', '#efe8da', '#cfc4b0', '#e3d3b5', '#d6d9d6', '#e8d9c4'], roofs: ['#4c5563', '#6b3b33', '#3f4a45', '#5a5048'],
    upper: MAT.render, lower: MAT.stone, low: (h) => Math.min(0.7, h * 0.2), win: WIN.balconies, front: WIN.balconies,
    roof: (a, h) => (h > 12 ? 'flat' : a < 900 ? 'gabled' : 'hipped'), pitch: 0.9,
  },
  chapel: {
    walls: ['#f0ece2', '#ebe4d4', '#e8e2d6'], roofs: ['#5a3a30', '#3f4650', '#4f6a5e'],
    upper: MAT.render, lower: MAT.stone, low: () => 0.6, win: WIN.tall, front: WIN.tall,
    roof: () => 'gabled', pitch: 2, belfry: true,
  },
  tower: {
    walls: ['#d9cfbc', '#c8bfae', '#e2d8c6'], roofs: ['#4a3f38', '#3f6457', '#47505c'],
    upper: MAT.render, lower: MAT.stone, low: (h) => h * 0.3, win: WIN.rows, front: WIN.rows,
    roof: () => 'hipped', pitch: 3, clock: true,
  },
  service: {
    walls: ['#7d8a86', '#8b8f93', '#7a5a4a', '#9a9483', '#5f6e66', '#86796a'], roofs: ['#6e7880', '#5a5f66', '#4d5359'],
    upper: MAT.metal, lower: MAT.concrete, low: (h) => Math.min(0.5, h * 0.15), win: WIN.sparse, front: WIN.sparse,
    roof: (a, h) => (a > 600 || h > 12 ? 'flat' : 'gabled'), pitch: 0.5, door: true,
  },
  garage: {
    walls: ['#b9b5ad', '#a9a59d', '#c2bdb2'], roofs: ['#8f8c86'],
    upper: MAT.open, lower: MAT.concrete, low: () => 0.9, win: WIN.none, front: WIN.none,
    roof: () => 'flat', pitch: 1,
  },
};

/** Pick from a list by a seed from 0 to 1. */
export const pick = (list, seed) => list[Math.min(list.length - 1, Math.floor(seed * list.length))];
