// Map help from skiers' GPS summaries (issue #112, GPS evidence step): the on-map share, places people leave the map,
// suggested fixes with a safety class, the weekly tool's helpers, and the daily email. Fixture data only: no network,
// and Resend is never called (fetch is replaced).
import { describe, it, expect, vi } from 'vitest';
import { cleanSummary, addSummary, publicTotals, onMapShare, plausibleDay, K_ANON, MAX_ON_CELLS } from '../worker/evidence.js';
import { groupCells, shapeOf, findGaps, toLatLon, GAPS, placeText } from '../worker/mapgaps.js';
import { suggestFixes, photoAgrees, photoSource, seasonSince, FIXES } from '../worker/mapfixes.js';
import { buildDigest, mapHelpPart, runDigest, DIGEST_INDEX, RESEND_URL } from '../worker/digest.js';
import { daySummary, contribBody, blockedPlaces } from '../src/contrib.js';
import { addHide, renderReport } from '../tools/map_fixes.mjs';
import { ST } from '../src/tracker.js';
import { createRequire } from 'node:module';

vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } }));

const NOW = Date.UTC(2026, 10, 24, 11, 23);
const KEY = 'f'.repeat(32);

// ---------------------------------------------------------------- fixtures: a small made-up mountain
const PROJ = { lat0: 45, lon0: -72, xm: 0, ym: 0, clat: [0, 0, 9e-6, 0, 0, 0, 0, 0, 0, 0], clon: [0, 1.27e-5, 0, 0, 0, 0, 0, 0, 0, 0] };
const line = (...p) => p.flat();
const MAP = {
  proj: PROJ,
  trails: [
    { id: 0, osm: 1001, name: 'Main Street', len: 1000, ok: true, pts: line([500, 1000], [500, 0]) },
    { id: 1, osm: 1002, name: null, len: 300, unl: 1, pts: line([500, 500], [800, 500]) },          // unlisted connecting piece
    { id: 2, osm: 1003, name: 'Lower Loop', len: 500, ok: true, pts: line([800, 1000], [800, 500]) },
    { id: 3, osm: 1004, name: 'Hidden One', len: 400, hide: 'hidden by hand', pts: line([1100, 1000], [1100, 0]) },
  ],
};
/** Squares i,j with n ski days each. */
const cells = (list, n) => Object.fromEntries(list.map(([i, j]) => [`${i},${j}`, n]));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
// 30 m beside Main Street, 620 m along it, 15 days each: looks like Main Street drawn off its line
const BESIDE = cells(range(10, 40).map((j) => [26, j]), 15);
// a line 1100 m east, away from the shown runs (the hidden run there does not count), 25 days each
const AWAY = cells(range(25, 45).map((j) => [55, j]), 25);
// a 2 x 2 patch, and one lone square
const PATCH = cells([[100, 100], [101, 100], [100, 101], [101, 101]], 6);
const LONE = cells([[200, 200]], 9);
const season = (n, first = Date.UTC(2026, 0, 1)) => range(0, n - 1).map((k) => ({ day: new Date(first + k * 3 * 86400e3).toISOString().slice(0, 10), days: 10, pct: 80 }));
const HEAT = { days: 400, k: K_ANON, cell: 20, runs: { 0: 50, 2: 40 }, cells: { ...BESIDE, ...AWAY, ...PATCH, ...LONE }, onMap: season(35) };

describe('on-map share: the phone counts on-run squares, the server keeps per-day totals', () => {
  it('takes an optional count of on-run squares, refuses a bad one, and leaves out an impossible date', () => {
    const base = { resort: 'stowe', key: KEY, day: '2026-11-23', runs: [1], cells: [[1, 2]] };
    expect(cleanSummary(base, NOW).on).toBeNull();                          // older phones
    // resort and key come back too: the Worker routes the summary by resort, the store drops repeats by key
    expect(cleanSummary({ ...base, on: 120 }, NOW)).toMatchObject({ ok: true, resort: 'stowe', key: KEY, on: 120, day: '2026-11-23' });
    for (const on of [-1, 1.5, MAX_ON_CELLS + 1, '12']) expect(cleanSummary({ ...base, on }, NOW).error).toBe('bad on');
    expect(cleanSummary({ ...base, on: 5, day: '2031-01-01' }, NOW).on).toBeNull();
    expect(cleanSummary({ ...base, on: 5, day: '2026-02-30' }, NOW).on).toBeNull();
    expect(plausibleDay('2026-11-24', NOW)).toBe(true);
    expect(plausibleDay('2026-11-26', NOW)).toBe(false);
  });

  it('publishes a day only once K_ANON ski days sent a count, as a share of squares', () => {
    const t = { runs: {}, cells: {}, days: 0 };
    const day = (d, on, off) => cleanSummary({ resort: 'stowe', key: KEY, day: d, runs: [], cells: range(1, off).map((i) => [i, 0]), on }, NOW);
    for (let k = 0; k < K_ANON - 1; k++) addSummary(t, day('2026-11-22', 90, 10));
    addSummary(t, cleanSummary({ resort: 'stowe', key: KEY, day: '2026-11-22', runs: [], cells: [[1, 0]] }, NOW)); // no count: left out
    expect(publicTotals(t).onMap).toEqual([]);                              // 4 days with a count: not enough
    addSummary(t, day('2026-11-22', 60, 40));
    expect(t.daily['2026-11-22']).toEqual({ n: 5, on: 420, off: 80 });
    expect(publicTotals(t).onMap).toEqual([{ day: '2026-11-22', days: 5, pct: 84 }]);
    expect(onMapShare({ a: { n: 9, on: 0, off: 0 } })).toEqual([]);
  });

  it('the phone counts squares on and off the runs only while skiing downhill, and sends the on count as a number', () => {
    // points: [time ms, x, y, z, state, lift]; 10 m/s straight down a slope, first on a run (x < 100), then off it
    const P = range(0, 30).map((k) => [k * 1000, k * 10, 0, 1000 - k * 3, ST.SKI, 0]);
    P.push([31000, 310, 0, 1000, ST.LIFT, 1]);
    const runs = new Set(), off = new Set(), on = new Set();
    daySummary(P, { trailOf: (x) => (x < 100 ? { t: { id: 7 } } : null), inBounds: () => true, near: blockedPlaces({ pois: [{ kind: 'lodge', x: 250, y: 0 }] }) }, runs, off, on);
    expect([...runs]).toEqual([7]);
    expect(on.size).toBe(5);                                                // squares 0..4 (x 10..90)
    expect([...off]).not.toContain('12,0');                                 // x 250 is at the lodge
    expect(off.size).toBe(5);                                               // x 100..180: squares 5..9 (the rest is near the lodge)
    const body = contribBody('stowe', KEY, '2026-11-23', runs, off, on);
    expect(body.on).toBe(5);
    expect(Object.keys(body).sort()).toEqual(['cells', 'day', 'key', 'on', 'resort', 'runs']);
  });
});

describe('places people leave the map', () => {
  it('groups neighbouring squares, bridging one-square gaps', () => {
    const g = groupCells(cells([[0, 0], [0, 2], [0, 4], [9, 9]], 5));
    expect(g.map((x) => x.length).sort()).toEqual([1, 3]);
    const s = shapeOf(g.find((x) => x.length === 3));
    expect(s.lengthM).toBeCloseTo(100, 6);
    expect(s.widthM).toBeCloseTo(20, 6);
  });

  it('finds the strip beside a run, the line away from runs and the patch, and drops the lone square', () => {
    const places = findGaps(HEAT, MAP, [{ kind: 'missing', x: 1110, y: 600, level: 'high', score: 4, reports: [11, 12] }]);
    expect(places).toHaveLength(3);
    const [a, b] = places.filter((p) => p.line).sort((p, q) => p.x - q.x);
    expect(a).toMatchObject({ guess: 'wrong_place', squares: 31, line: true, days: { max: 15, median: 15 } });
    expect(a.nearest).toMatchObject({ name: 'Main Street', distM: 30, angleDeg: 0 });
    expect(b.guess).toBe('missing');
    expect(b.nearest.name).toBe('Lower Loop');                              // the hidden run is never "nearest"
    expect(b.reports).toEqual([{ kind: 'missing', level: 'high', score: 4, distM: 10, reports: [11, 12] }]);
    const patch = places.find((p) => !p.line);
    expect(patch.guess).toBe('unclear');
    expect(a.link).toMatch(/^https:\/\/www\.openstreetmap\.org\/\?mlat=45\.00/);
    expect(placeText(a)).toContain('alongside Main Street');
  });

  it('works without a map (no nearest run, no lat/lon) and with no counts', () => {
    expect(findGaps({ cells: BESIDE }, null)[0]).toMatchObject({ guess: 'missing', nearest: null, lat: null });
    expect(findGaps({}, MAP)).toEqual([]);
    expect(toLatLon(PROJ, 0, 1000)[0]).toBeCloseTo(45.009, 6);
    expect(GAPS.minCells).toBeGreaterThan(1);
  });
});

describe('suggested fixes and their safety class', () => {
  const places = findGaps(HEAT, MAP, []).filter((p) => p.line);
  const ctx = { id: 'test', heat: HEAT, map: MAP, problems: [], places, photo: 'naip', mapSince: '2025-12-01' };

  it('moving a run onto the skiers\' strip is safe only pending the aerial-photo check', () => {
    const move = suggestFixes(ctx).find((s) => s.action === 'move_line');
    expect(move).toMatchObject({ safety: 'safe', check: 'photo', target: { osm: 1001, name: 'Main Street', photo: 'naip' } });
    expect(move.change.how).toBe('tools/align_trails.py test naip --only osm:1001 --write --osm');
    expect(move.evidence.join(' ')).toContain('skied on up to 15 days');
    // without photos for the country, or with too few ski days, a person decides
    expect(suggestFixes({ ...ctx, photo: null }).find((s) => s.action === 'move_line')).toMatchObject({ safety: 'review' });
    const weak = { ...HEAT, cells: cells(range(10, 40).map((j) => [26, j]), 6) };
    const r = suggestFixes({ ...ctx, heat: weak, places: findGaps(weak, MAP).filter((p) => p.line) }).find((s) => s.action === 'move_line');
    expect(r.safety).toBe('review');
    expect(r.reasons.join(' ')).toContain(`fewer than ${FIXES.moveMinDays} days`);
  });

  it('a whole missing run always needs review', () => {
    const add = suggestFixes(ctx).find((s) => s.action === 'add_run');
    expect(add.safety).toBe('review');
    expect(add.target.line_ll.length).toBeGreaterThan(3);
  });

  it('hides an unlisted piece nobody skied over a whole season on the current map, next to busy runs', () => {
    const hide = suggestFixes(ctx).find((s) => s.action === 'hide_piece');
    expect(hide).toMatchObject({ safety: 'safe', change: { file: 'tools/official/test.json', key: 'hide', name: 'way 1002' } });
    expect(hide.change.value).toContain('350 map-help ski days');
    // map date unknown: a person decides
    expect(suggestFixes({ ...ctx, mapSince: null }).find((s) => s.action === 'hide_piece').safety).toBe('review');
    // a short season (map rebuilt in March): not suggested at all
    expect(suggestFixes({ ...ctx, mapSince: '2026-03-15' }).find((s) => s.action === 'hide_piece')).toBeUndefined();
    // someone skied it on 5+ days: never
    expect(suggestFixes({ ...ctx, heat: { ...HEAT, runs: { ...HEAT.runs, 1: 5 } } }).find((s) => s.action === 'hide_piece')).toBeUndefined();
    // listed runs are never hidden this way
    const listed = { ...MAP, trails: MAP.trails.map((t) => (t.id === 1 ? { ...t, unl: 0, ok: true } : t)) };
    expect(suggestFixes({ ...ctx, map: listed }).find((s) => s.action === 'hide_piece')).toBeUndefined();
    expect(seasonSince(HEAT.onMap, '2025-12-01')).toMatchObject({ days: 350, spanDays: 102 });
  });

  it('ratings are never safe, and reports below medium confidence are not listed', () => {
    const problems = [
      { kind: 'wrong_rating', level: 'high', score: 5, name: 'Main Street', runs: [0], reports: [1, 2, 3], why: ['3 reports'], should: { name: 'Black' }, x: 500, y: 500 },
      { kind: 'not_real', level: 'low', score: 1, name: 'Lower Loop', runs: [2], reports: [4], why: ['1 report'], x: 800, y: 700 },
    ];
    const out = suggestFixes({ ...ctx, problems });
    const rating = out.find((s) => s.action === 'check_rating');
    expect(rating).toMatchObject({ safety: 'review', confidence: 'high', title: 'Wrong rating: Main Street (should be Black)' });
    expect(rating.reasons[0]).toContain('never changed from GPS');
    expect(out.find((s) => s.action === 'hide_run')).toBeUndefined();
    expect(out.every((s) => s.safety === 'review' || ['move_line', 'hide_piece'].includes(s.action))).toBe(true);
    expect(out.findIndex((s) => s.safety === 'review')).toBeGreaterThan(out.findLastIndex((s) => s.safety === 'safe'));
  });

  it('the photo must find the cut run where the skiers go', () => {
    const strip = [[530, 210], [530, 400], [530, 790]];
    expect(photoAgrees([[528, 250], [533, 500], [531, 700]], strip)).toBe(true);
    expect(photoAgrees([[470, 250], [468, 500], [471, 700]], strip)).toBe(false);   // other side of the run
    expect(photoAgrees([], strip)).toBe(false);
    expect(photoSource('Vermont, USA')).toBe('naip');
    expect(photoSource('Valais, Switzerland')).toBe('swiss');
    expect(photoSource('Hokkaido, Japan')).toBe('gsi');
    expect(photoSource('British Columbia, Canada')).toBeNull();
  });
});

describe('the weekly tool', () => {
  it('adds a hide entry once, keeping the file\'s layout', () => {
    const text = JSON.stringify({ source: 'map', runs: { 'Main Street': 1 } }, null, 1) + '\n';
    const next = addHide(text, 'way 1002', 'nobody skis it');
    expect(JSON.parse(next).hide).toEqual({ 'way 1002': 'nobody skis it' });
    expect(next.startsWith('{\n "source": "map",')).toBe(true);
    expect(addHide(next, 'way 1002', 'again')).toBeNull();
  });

  it('writes a report with the share, the places and both kinds of fixes', () => {
    const places = findGaps(HEAT, MAP, []);
    const fixes = suggestFixes({ id: 'test', heat: HEAT, map: MAP, places: places.filter((p) => p.line), photo: 'naip', mapSince: '2025-12-01' });
    const md = renderReport({ id: 'test', name: 'Test Mountain', date: '2026-11-24', heat: HEAT, places, fixes, mapSince: '2025-12-01', photo: 'naip', applied: { 'hide:1002': 'written' } });
    expect(md).toContain('# Map fixes from skiers: Test Mountain (test)');
    expect(md).toContain('| 2026-04-13 | 10 | 80% |');
    expect(md).toContain('## Safe fixes (2)');
    expect(md).toContain('- Status: written');
    expect(md).toContain('waiting for the aerial-photo check');
    expect(md).toMatch(/## Needs review \(1\)/);
  });
});

describe('the weekly workflow is safe to merge', () => {
  it('only opens a draft pull request: no secrets, no deploy, no map upload, no merge', async () => {
    const { readFileSync } = await import('node:fs');
    const wf = readFileSync('.github/workflows/map-fixes.yml', 'utf8');
    const commands = wf.split('\n').filter((l) => !/^\s*(#|echo )/.test(l)).join('\n');
    expect(wf).not.toMatch(/secrets\./);
    expect(commands).not.toMatch(/wrangler|maps_r2\.mjs|preview\/|pipeline\.py|gh pr merge|--r2|git push[^\n]*main/);
    expect(commands).toContain('node tools/map_fixes.mjs --all --apply-safe');
    expect(commands).toMatch(/gh pr create --draft --base main[^\n]*--label map-fixes/);
    expect(wf).not.toMatch(/^\s*push:/m);
  });
});

describe('daily email: map help', () => {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const heat = { ...HEAT, onMap: [{ day: day(NOW - 2 * 86400e3), days: 6, pct: 79 }, { day: day(NOW - 86400e3), days: 7, pct: 82.5 }] };

  it('says yesterday\'s share, the top places and the suggested fixes, briefly', () => {
    const m = mapHelpPart('jay-peak', heat, MAP, [], NOW);
    expect(m.share).toMatchObject({ yesterday: true, pct: 82.5, days: 7 });
    expect(m.fixes.every((f) => f.action !== 'hide_piece' || f.safety === 'review')).toBe(true);   // map date unknown in the Worker
    const mail = buildDigest([{ resort: 'jay-peak', reports: [], problems: [], days: 400, mapHelp: m }], NOW);
    expect(mail.subject).toBe('SkiWithMe map help: 1 mountain (2026-11-24)');
    expect(mail.text).toContain('Yesterday: 82.5% of skiing was on the drawn runs (7 ski days).');
    expect(mail.text).toContain('Places people keep leaving the map');
    expect(mail.text).toMatch(/Suggested fixes: 1 safe, \d+ need review:/);
    expect(mail.text).toContain('SAFE if the aerial photo agrees');
    expect(mail.text.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(3 + 5);
  });

  it('says "not enough ski days yet" when no recent day had K_ANON ski days, and skips quiet mountains', () => {
    const m = mapHelpPart('jay-peak', { days: 3, k: 5, runs: {}, cells: {}, onMap: [] }, null, [], NOW);
    expect(m.share).toBeNull();
    expect(buildDigest([{ resort: 'jay-peak', reports: [], problems: [], mapHelp: m }], NOW)).toBeNull();
    const withReport = buildDigest([{ resort: 'jay-peak', reports: [{ id: 1, at: NOW - 3600e3, kind: 'other', x: 1, y: 2, name: '', text: '' }], problems: [], mapHelp: m }], NOW);
    expect(withReport.text).toContain('On the drawn runs: not enough ski days yet');
    expect(mapHelpPart('jay-peak', { days: 0 }, null, [], NOW)).toBeNull();
    const older = mapHelpPart('jay-peak', { ...heat, onMap: [{ day: day(NOW - 3 * 86400e3), days: 5, pct: 70 }] }, null, [], NOW);
    expect(buildDigest([{ resort: 'jay-peak', reports: [{ id: 1, at: NOW, kind: 'other', x: 1, y: 2 }], problems: [], mapHelp: older }], NOW).text)
      .toContain(`Latest day with enough ski days, ${day(NOW - 3 * 86400e3)}: 70% of skiing`);
  });

  it('the job reads the map only where map help published something, and sends through (mocked) fetch', async () => {
    const state = { claim: 0, lastDay: null, due: new Map([['jay-peak', NOW - 3600e3], ['stowe', NOW - 3600e3]]) };
    const index = {
      digestDue: async (today, now) => { state.claim = now; return { sentToday: false, resorts: [...state.due.keys()] }; },
      digestRelease: async () => { state.claim = 0; },
      digestDone: async (resorts, d) => { for (const r of resorts) state.due.delete(r); if (d) state.lastDay = d; },
    };
    const parts = {
      'jay-peak': { reports: [], problems: [], days: 400, heat, maxId: 0 },
      stowe: { reports: [], problems: [], days: 0, heat: { days: 0, k: 5, runs: {}, cells: {}, onMap: [] }, maxId: 0 },
    };
    const log = (_e, id) => (id === DIGEST_INDEX ? index : { digestPart: async () => parts[id], digestSent: async () => {} });
    const maps = [];
    const getMap = async (_e, id) => { maps.push(id); return MAP; };
    const env = { REPORT_DIGEST_TO: 'hello@builtbyroger.app', MAIL_FROM: 'SkiWithMe <signin@builtbyroger.app>', RESEND_API_KEY: 're_test' };
    const real = globalThis.fetch, calls = [];
    globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
    let out;
    try { out = await runDigest(env, log, NOW, undefined, getMap); } finally { globalThis.fetch = real; }
    expect(out).toMatchObject({ sent: true, reports: 0, mapHelp: 1 });
    expect(maps).toEqual(['jay-peak']);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RESEND_URL);
    expect(calls[0].body.text).toContain('Jay Peak (jay-peak): map help, 400 ski days so far');
    expect(calls[0].body.text).not.toContain('stowe');
  });
});

describe('the ResortLog store keeps per-day totals (real SQLite, as in the Durable Object)', () => {
  it('stores the on count with each upload, adds it into the daily totals and publishes only K_ANON+ days', async () => {
    // node:sqlite through require: Vite would strip the node: prefix of an import
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const { ResortLog } = await import('../worker/stores.js');
    const db = new DatabaseSync(':memory:');
    const sql = { exec: (q, ...a) => (a.length || !q.includes(';') ? db.prepare(q).all(...a) : (db.exec(q), [])) };
    let alarm = null;
    const log = new ResortLog({ storage: { sql, getAlarm: async () => alarm, setAlarm: async (t) => { alarm = t; } } }, {});
    const today = new Date().toISOString().slice(0, 10);
    for (let k = 0; k < K_ANON; k++) {
      const s = cleanSummary({ resort: 'stowe', key: String(k).padStart(32, '0'), day: today, runs: [3], cells: [[1, 1], [1, 2]], on: 18 });
      expect(await log.addDay(s, 'net' + k)).toEqual({ ok: true });
      if (k === K_ANON - 2) expect(log.heat().onMap).toEqual([]);          // pending uploads count too: still too few
    }
    expect(log.heat().onMap).toEqual([{ day: today, days: K_ANON, pct: 90 }]);
    const again = cleanSummary({ resort: 'stowe', key: String(0).padStart(32, '0'), day: today, runs: [3], cells: [], on: 1 });
    expect(await log.addDay(again, 'net9')).toEqual({ ok: true, duplicate: true });   // the same upload twice counts once
    await log.alarm();                                                       // folded into the stored totals
    expect(log.load().daily[today]).toEqual({ n: K_ANON, on: 18 * K_ANON, off: 2 * K_ANON });
    expect(log.heat()).toMatchObject({ days: K_ANON, runs: { 3: K_ANON }, onMap: [{ day: today, days: K_ANON, pct: 90 }] });
    expect(Object.keys(log.heat().cells)).toEqual(['1,1', '1,2']);
  });
});
