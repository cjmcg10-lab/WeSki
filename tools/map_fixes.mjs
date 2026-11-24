// Weekly map fixes from skiers' evidence (issue #112). Reads the public map-help counts and the scored map-mistake
// problems from the live app, finds the places people keep leaving the map, suggests fixes with a safety class, writes
// a report per mountain, and with --apply-safe writes the safe fixes into the resort configs.
//
//   node tools/map_fixes.mjs <id> [<id> ...]      one or more mountains
//   node tools/map_fixes.mjs --all                every mountain in public/data/index.json (only those with evidence
//                                                 get a report)
//   options:
//     --apply-safe          write the safe fixes: hide_piece into tools/official/<id>.json "hide", move_line through
//                           tools/align_trails.py --write (only when the aerial photo agrees with the skiers' strip)
//     --no-photo            do not run the aerial-photo check (safe line moves are then listed, not written)
//     --map-since YYYY-MM-DD  the day the live map was last rebuilt (default: the last git commit touching the
//                           mountain's configs or the build scripts; nothing is hidden when it is not known)
//     --server URL          another server (default https://skiwithme.builtbyroger.app)
//     --out DIR             where the reports go (default tools/fixes)
//     --changed FILE        write the ids whose configs changed to FILE, one per line (for the weekly workflow)
//
// What it never does: rebuild or upload maps, touch R2, push, or merge. Config changes only reach the live map after a
// person rebuilds the mountain (tools/pipeline.py <id>, without --r2), looks at the preview, and pushes the maps once
// approved (see docs/MAP_REPORTS.md). Ratings are never changed. Outside requests use the User-Agent weski-build.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findGaps, GAPS } from '../worker/mapgaps.js';
import { suggestFixes, photoAgrees, photoSource, seasonSince, FIXES } from '../worker/mapfixes.js';
import { KIND_NAMES } from '../worker/confidence.js';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = 'https://skiwithme.builtbyroger.app';

// ---------------------------------------------------------------- pure helpers (tests/map-evidence.test.js)
/** Add a hide entry to an official json's text. Returns the new text, or null when it is already there. */
export function addHide(text, name, reason) {
  const o = JSON.parse(text);
  o.hide ||= {};
  if (o.hide[name]) return null;
  o.hide[name] = reason;
  return JSON.stringify(o, null, 1) + '\n';
}

/** The report for one mountain, as Markdown. `r`: {id, name, date, heat, problems, places, fixes, mapSince, photo, applied}. */
export function renderReport(r) {
  const L = [];
  const pct = (n) => `${n}%`;
  L.push(`# Map fixes from skiers: ${r.name} (${r.id})`, '');
  L.push(`Made ${r.date} by \`node tools/map_fixes.mjs ${r.id}\` from the live app's public counts (only places and runs reached by ${r.heat?.k ?? 5}+ ski days).`);
  L.push(`Nothing here changes the live map: config changes need a rebuild, a look at the preview, and the owner's approval to push the maps.`, '');
  L.push('## Map help', '');
  L.push(`- Ski days with map help at this mountain: ${r.heat?.days ?? 0}`);
  const share = r.heat?.onMap || [];
  if (share.length) {
    L.push(`- Share of skied squares on the drawn runs, last days with ${r.heat.k}+ ski days:`, '');
    L.push('| Day | Ski days | On the drawn runs |', '| --- | --- | --- |');
    for (const d of share.slice(-10).reverse()) L.push(`| ${d.day} | ${d.days} | ${pct(d.pct)} |`);
    L.push('');
  } else L.push(`- Share on the drawn runs: not enough ski days yet (a day counts once ${r.heat?.k ?? 5} or more ski days sent map help)`);
  const season = seasonSince(share, r.mapSince);
  L.push(`- Live map rebuilt: ${r.mapSince || 'not known (so nothing is hidden automatically)'}; counted ski days since: ${season.days}${season.first ? ` (${season.first} to ${season.last})` : ''}`);
  L.push(`- Aerial photos for the line check: ${r.photo || 'none for this country'}`, '');

  L.push('## Places people keep leaving the map', '');
  if (!r.places.length) L.push('None yet.', '');
  else {
    L.push('| # | What | Squares | Length | Ski days (max / median) | Nearest shown run | Reports nearby | Where |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    r.places.slice(0, 15).forEach((p, i) => {
      const what = p.guess === 'wrong_place' ? 'line beside a run' : p.guess === 'missing' ? 'line away from runs' : 'patch';
      const near = p.nearest ? `${p.nearest.name || '(no name)'}, ${p.nearest.distM} m` : '-';
      const reps = p.reports.map((x) => `${KIND_NAMES[x.kind] || x.kind} (${x.level})`).join('; ') || '-';
      L.push(`| ${i + 1} | ${what} | ${p.squares} | ${p.lengthM} m | ${p.days.max} / ${p.days.median} | ${near} | ${reps} | ${p.link ? `[${p.lat}, ${p.lon}](${p.link})` : `x ${p.x}, y ${p.y}`} |`);
    });
    if (r.places.length > 15) L.push('', `...and ${r.places.length - 15} smaller ones.`);
    L.push('');
  }

  const status = (f) => r.applied?.[f.key];
  const safe = r.fixes.filter((f) => f.safety === 'safe'), review = r.fixes.filter((f) => f.safety !== 'safe');
  L.push(`## Safe fixes (${safe.length})`, '');
  if (!safe.length) L.push('None.', '');
  for (const f of safe) {
    L.push(`### ${f.title}`, '');
    L.push(`- Status: ${status(f) || (f.check === 'photo' ? 'waiting for the aerial-photo check (run with --apply-safe)' : 'not written (run with --apply-safe)')}`);
    L.push(`- Confidence: ${f.confidence}`);
    if (f.change) L.push(`- Change: \`${f.change.file}\` ${f.change.key}${f.change.name ? ` "${f.change.name}"` : ''}${f.change.how ? ` (${f.change.how})` : ''}`);
    if (f.where?.link) L.push(`- Where: ${f.where.link}`);
    for (const e of f.evidence) L.push(`- Evidence: ${e}`);
    for (const x of f.reasons) L.push(`- Why safe: ${x}`);
    L.push('');
  }
  L.push(`## Needs review (${review.length})`, '');
  if (!review.length) L.push('None.', '');
  for (const f of review) {
    L.push(`### ${f.title}`, '');
    L.push(`- Action: ${f.action}; confidence: ${f.confidence}`);
    if (f.where?.link) L.push(`- Where: ${f.where.link}`);
    else if (Number.isFinite(f.where?.lat)) L.push(`- Where: ${f.where.lat}, ${f.where.lon}`);
    for (const e of f.evidence) L.push(`- Evidence: ${e}`);
    for (const x of f.reasons) L.push(`- ${x}`);
    if (f.action === 'add_run' && f.target.line_ll) L.push(`- Draft line (lon, lat, along the squares; direction not known): \`${JSON.stringify(f.target.line_ll)}\``);
    L.push('');
  }
  L.push('## Settings', '', `Thresholds: \`GAPS\` in worker/mapgaps.js and \`FIXES\` in worker/mapfixes.js. Explained in docs/MAP_REPORTS.md.`, '');
  return L.join('\n');
}

// ---------------------------------------------------------------- outside world
async function getJson(url) {
  const { stdout } = await run('curl', ['-s', '-f', '-m', '60', '-A', 'weski-build', url], { maxBuffer: 1 << 28 });
  return JSON.parse(stdout);
}

function mapSinceFromGit(id) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', `tools/resorts/${id}.json`, `tools/official/${id}.json`,
      'tools/build_data.py', 'tools/build_zones.py', 'tools/verify_exists.py'], { cwd: ROOT }).toString().trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch { return null; }
}

/** Run tools/align_trails.py on one run; returns its --json row or null. */
async function photoRow(id, photo, only, write, osm) {
  const dir = mkdtempSync(join(tmpdir(), 'map-fixes-'));
  const args = ['tools/align_trails.py', id, photo, '--only', only, '--json', join(dir, 'row.json')];
  if (write) args.push('--write');
  if (write && osm) args.push('--osm');
  try {
    const { stdout } = await run('python3', args, { cwd: ROOT, maxBuffer: 1 << 26, timeout: 15 * 60e3 });
    process.stdout.write(stdout.split('\n').map((l) => `    ${l}`).join('\n') + '\n');
    return JSON.parse(readFileSync(join(dir, 'row.json'), 'utf8'))[0] || null;
  } catch (e) {
    console.log(`    aerial-photo check failed: ${String(e.message).slice(0, 200)}`);
    return null;
  }
}

async function applySafe(id, f, opt) {
  if (f.action === 'hide_piece') {
    const file = join(ROOT, f.change.file);
    if (!existsSync(file)) return 'not written: the mountain has no official json (no resort list to hide against)';
    const next = addHide(readFileSync(file, 'utf8'), f.change.name, f.change.value);
    if (!next) return 'already in the config';
    writeFileSync(file, next);
    return 'written';
  }
  if (f.action === 'move_line') {
    if (opt.noPhoto) return 'not written: the aerial-photo check was switched off (--no-photo)';
    const t = f.target, only = t.traced ? t.name : `osm:${t.osm}`;
    const row = await photoRow(id, t.photo, only, false, !t.traced);
    if (!row) return 'not written: no aerial-photo result';
    if (!row.good || row.taken || row.tree || row.max_off > 70) return `not written: the photo check does not allow it (${!row.good ? 'weak evidence' : row.taken ? `strip is the mapped run ${row.taken}` : row.tree ? 'tree run' : 'more than 70 m'})`;
    if (!photoAgrees(row.found, t.gpsLine)) return `not written: the photo's cut run is not where skiers go (more than ${FIXES.photoAgreeM} m apart)`;
    const file = join(ROOT, `tools/resorts/${id}.json`), before = readFileSync(file, 'utf8');
    await photoRow(id, t.photo, only, true, !t.traced);
    const after = readFileSync(file, 'utf8');
    if (after === before) return 'not written: tools/align_trails.py declined under its own rules (moves under 10 m, or over 70 m, are left alone)';
    execFileSync('python3', ['tools/dev/fmt_config.py', file], { cwd: ROOT });
    return `written (photo and skiers agree; moved ${row.mean_off} m on average)`;
  }
  return 'not written: unknown kind';
}

async function one(id, opt, index) {
  const place = index.find((p) => p.id === id);
  if (!place) { console.log(`${id}: not in public/data/index.json`); return null; }
  const heat = await getJson(`${opt.server}/api/heat/${id}`).catch(() => null);
  const probs = await getJson(`${opt.server}/api/reports/${id}/problems`).catch(() => null);
  const problems = probs?.problems || [];
  if (!heat) { console.log(`${id}: no answer from ${opt.server}`); return null; }
  const hasCells = Object.keys(heat.cells || {}).length || Object.keys(heat.runs || {}).length;
  if (!heat.days && !problems.length) { if (!opt.quiet) console.log(`${id}: no map help and no problems yet`); return null; }
  // the live map: its run numbers are the ones the phones used
  let map = null;
  if (hasCells || problems.length) {
    map = await getJson(`${opt.server}/data/${id}/resort.json`).catch(() => null);
    const local = join(ROOT, 'public/data', id, 'resort.json');
    // tools/align_trails.py reads the map from public/data/<id>; give it the live one when none is on disk
    if (map && opt.applySafe && !existsSync(local)) { mkdirSync(dirname(local), { recursive: true }); writeFileSync(local, JSON.stringify(map)); }
  }
  const mapSince = opt.mapSince || mapSinceFromGit(id);
  const photo = photoSource(place.region);
  const places = findGaps(heat, map, problems);
  const fixes = suggestFixes({ id, heat, map, problems, places: places.filter((p) => p.line), photo, mapSince });
  const applied = {};
  let changed = false;
  if (opt.applySafe) {
    for (const f of fixes.filter((x) => x.safety === 'safe')) {
      applied[f.key] = await applySafe(id, f, opt);
      console.log(`  ${f.title}: ${applied[f.key]}`);
      if (applied[f.key].startsWith('written')) changed = true;
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(opt.out, { recursive: true });
  writeFileSync(join(opt.out, `${id}.md`), renderReport({ id, name: place.name, date, heat, problems, places, fixes, mapSince, photo, applied }));
  // every fix written is kept with its evidence, so it can be found and undone
  const logf = join(opt.out, `${id}.json`);
  const log = existsSync(logf) ? JSON.parse(readFileSync(logf, 'utf8')) : { id, applied: [] };
  for (const f of fixes) if (applied[f.key]?.startsWith('written')) log.applied.push({ date, key: f.key, action: f.action, title: f.title, change: f.change, evidence: f.evidence, result: applied[f.key] });
  if (changed || !existsSync(logf)) writeFileSync(logf, JSON.stringify(log, null, 1) + '\n');
  const safe = fixes.filter((f) => f.safety === 'safe').length;
  console.log(`${id}: ${heat.days} ski days, ${places.length} places, ${safe} safe and ${fixes.length - safe} review suggestions${changed ? ', configs changed' : ''}`);
  return { id, changed };
}

async function main(argv) {
  const opt = { server: SERVER, out: join(ROOT, 'tools/fixes'), applySafe: false, noPhoto: false, mapSince: null, changed: null, quiet: false };
  const ids = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply-safe') opt.applySafe = true;
    else if (a === '--no-photo') opt.noPhoto = true;
    else if (a === '--all') opt.all = true;
    else if (a === '--server') opt.server = argv[++i];
    else if (a === '--out') opt.out = argv[++i];
    else if (a === '--map-since') opt.mapSince = argv[++i];
    else if (a === '--changed') opt.changed = argv[++i];
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(2); }
    else ids.push(a);
  }
  const index = JSON.parse(readFileSync(join(ROOT, 'public/data/index.json'), 'utf8'));
  if (opt.all) { ids.push(...index.map((p) => p.id)); opt.quiet = true; }
  if (!ids.length) { console.error('usage: node tools/map_fixes.mjs <id...>|--all [--apply-safe] [--no-photo] [--map-since YYYY-MM-DD] [--changed FILE]'); process.exit(2); }
  console.log(`thresholds: GAPS ${JSON.stringify(GAPS)}\n            FIXES ${JSON.stringify(FIXES)}`);
  const changed = [];
  for (const id of ids) {
    const r = await one(id, opt, index);
    if (r?.changed) changed.push(id);
  }
  if (opt.changed) writeFileSync(opt.changed, changed.join('\n') + (changed.length ? '\n' : ''));
  console.log(`${changed.length} mountains with config changes${changed.length ? ': ' + changed.join(', ') : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
