// Move resort map files between this folder and the Cloudflare R2 bucket the live app serves them from.
//
//   node tools/maps_r2.mjs push <id> [<id> ...]   upload public/data/<id> to R2, list the id in public/data/r2.json,
//                                                 and stop tracking the folder in git (it stays on disk, ignored)
//   node tools/maps_r2.mjs push --all             every resort folder on disk except the ones kept in git (KEEP)
//   node tools/maps_r2.mjs pull <id> [<id> ...]   download an R2 resort into public/data/<id> (to rebuild or test it)
//   node tools/maps_r2.mjs pull --all             every resort listed in r2.json that is not on disk
//   node tools/maps_r2.mjs drop                   delete the local copies of R2 resorts (before the app build in CI)
//   node tools/maps_r2.mjs status                 which resorts are in R2 and which are on disk
//
// The upload is the same split the app build makes: the routing graph goes into graph.json (served only with a
// pass), the rest of resort.json stays public. Files whose content is already in R2 are not sent again (saves the
// free allowance of writes). Uses Cloudflare's REST API with curl: in a cloud session the token is a network secret
// the proxy adds; in GitHub Actions it comes from CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DATA = 'public/data';
const LIST = join(DATA, 'r2.json');
const KEEP = ['jay-peak']; // the unit tests load it: stays in git
const FILES = ['resort.json', 'graph.json', 'terrain.bin', 'surround.bin'];
const TYPE = (f) => (f.endsWith('.json') ? 'application/json' : 'application/octet-stream');
const cfg = JSON.parse(readFileSync(LIST, 'utf8'));
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'placeholder-the-proxy-adds-the-real-token';
const AUTH = ['-H', `Authorization: Bearer ${TOKEN}`, '-A', 'weski-build'];
// looked up only when the API is used (drop and status work offline)
let api;
const API = () => (api ||= `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID ||
  JSON.parse(execFileSync('curl', ['-s', ...AUTH, 'https://api.cloudflare.com/client/v4/accounts']).toString()).result[0].id
}/r2/buckets/${cfg.bucket}/objects`);

async function curl(args, tries = 4) {
  for (let k = 1; ; k++) {
    try {
      return (await run('curl', ['-s', '--fail-with-body', ...AUTH, ...args], { maxBuffer: 1 << 26 })).stdout;
    } catch (e) {
      if (k >= tries) throw new Error(`curl ${args.at(-1)}: ${e.stdout || e.message}`.slice(0, 400));
      await new Promise((r) => setTimeout(r, 1000 * k));
    }
  }
}

/** Run jobs a few at a time. */
async function pool(jobs, n = 6) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } }));
  return out;
}

async function etags(id) {
  const j = JSON.parse(await curl([`${API()}?prefix=${encodeURIComponent(`data/${id}/`)}&per_page=50`]));
  return Object.fromEntries((j.result || []).map((o) => [o.key, o.etag]));
}

async function push(id) {
  const dir = join(DATA, id);
  if (!existsSync(join(dir, 'resort.json'))) throw new Error(`${dir}/resort.json not found`);
  const tmp = join(tmpdir(), `r2-${id}`);
  mkdirSync(tmp, { recursive: true });
  const R = JSON.parse(readFileSync(join(dir, 'resort.json'), 'utf8'));
  writeFileSync(join(tmp, 'graph.json'), JSON.stringify(R.graph || {}));
  delete R.graph;
  writeFileSync(join(tmp, 'resort.json'), JSON.stringify(R));
  const have = await etags(id);
  let sent = 0;
  await pool(FILES.map((f) => async () => {
    const src = f === 'resort.json' || f === 'graph.json' ? join(tmp, f) : join(dir, f);
    if (!existsSync(src)) return;
    const key = `data/${id}/${f}`;
    if (have[key] === createHash('md5').update(readFileSync(src)).digest('hex')) return;
    const res = JSON.parse(await curl(['-X', 'PUT', '-H', `Content-Type: ${TYPE(f)}`, '--data-binary', `@${src}`, `${API()}/${key}`]));
    if (!res.success) throw new Error(`${key}: ${JSON.stringify(res.errors)}`);
    sent++;
  }), 4);
  rmSync(tmp, { recursive: true, force: true });
  if (!cfg.ids.includes(id)) cfg.ids.push(id), cfg.ids.sort();
  // the folder stays on disk for builds and tests, but leaves git: R2 holds the copy the app serves
  const ignore = readFileSync('.gitignore', 'utf8');
  if (!ignore.includes(`${dir}/\n`)) appendFileSync('.gitignore', `${dir}/\n`);
  try { execFileSync('git', ['rm', '-r', '-q', '--cached', dir], { stdio: 'ignore' }); } catch { /* not tracked */ }
  console.log(`${id}: ${sent ? `${sent} files uploaded` : 'already up to date'} in ${cfg.bucket}`);
}

async function pull(id) {
  const dir = join(DATA, id);
  const tmp = join(tmpdir(), `r2-pull-${id}`);
  mkdirSync(tmp, { recursive: true });
  await pool(FILES.map((f) => () => curl(['-o', join(tmp, f), `${API()}/data/${id}/${f}`])), 4);
  // put the graph back into resort.json, as the build tools write it
  const R = JSON.parse(readFileSync(join(tmp, 'resort.json'), 'utf8'));
  R.graph = JSON.parse(readFileSync(join(tmp, 'graph.json'), 'utf8'));
  writeFileSync(join(tmp, 'resort.json'), JSON.stringify(R));
  rmSync(join(tmp, 'graph.json'));
  mkdirSync(dir, { recursive: true });
  for (const f of FILES) if (f !== 'graph.json' && existsSync(join(tmp, f))) renameSync(join(tmp, f), join(dir, f));
  rmSync(tmp, { recursive: true, force: true });
  console.log(`${id}: downloaded into ${dir}`);
}

const save = () => writeFileSync(LIST, JSON.stringify(cfg, null, 1) + '\n');
const [cmd, ...ids] = process.argv.slice(2);
const onDisk = (id) => existsSync(join(DATA, id, 'resort.json'));
if (cmd === 'status') {
  for (const id of cfg.ids) console.log(`${id.padEnd(22)} R2${onDisk(id) ? ', also on disk' : ''}`);
  console.log(`${cfg.ids.length} resorts in R2 (bucket ${cfg.bucket})`);
} else if (cmd === 'push' && ids.length) {
  const all = ids[0] === '--all'
    ? JSON.parse(readFileSync(join(DATA, 'index.json'), 'utf8')).map((r) => r.id).filter((id) => !KEEP.includes(id) && onDisk(id))
    : ids;
  try { await pool(all.map((id) => () => push(id)), 3); } finally { save(); }
} else if (cmd === 'drop') {
  for (const id of cfg.ids) rmSync(join(DATA, id), { recursive: true, force: true });
  console.log(`${cfg.ids.length} R2 resorts removed from ${DATA} (the app serves them from R2)`);
} else if (cmd === 'pull' && ids.length) {
  const all = ids[0] === '--all' ? cfg.ids.filter((id) => !onDisk(id)) : ids;
  await pool(all.map((id) => () => pull(id)), 4);
  console.log(`${all.length} resorts downloaded`);
} else {
  console.error('usage: node tools/maps_r2.mjs push <id...> | push --all | pull <id...> | pull --all | status');
  process.exit(1);
}
