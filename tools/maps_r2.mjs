// Move resort map files between this folder and the Cloudflare R2 bucket the live app serves them from.
//
//   node tools/maps_r2.mjs push <id> [<id> ...]   upload public/data/<id> to R2, list the id in public/data/r2.json,
//                                                 and stop tracking the folder in git (it stays on disk, ignored)
//   node tools/maps_r2.mjs pull <id> [<id> ...]   download an R2 resort into public/data/<id> (to rebuild or test it)
//   node tools/maps_r2.mjs pull --all             every resort listed in r2.json
//   node tools/maps_r2.mjs setup                  create the bucket (once, after R2 is turned on in the Cloudflare dashboard)
//   node tools/maps_r2.mjs status                 which resorts are in R2 and which are on disk
//
// The upload is the same split the app build makes: the routing graph goes into graph.json (served only with a
// pass), the rest of resort.json stays public. Needs the bucket bound as MAPS in wrangler.assets.jsonc and
// "/data/*" in run_worker_first (see docs/ADDING_MOUNTAINS.md, "Map storage"). Uses wrangler with the Cloudflare
// token from the environment.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DATA = 'public/data';
const LIST = join(DATA, 'r2.json');
const FILES = ['resort.json', 'graph.json', 'terrain.bin', 'surround.bin'];
const TYPE = (f) => (f.endsWith('.json') ? 'application/json' : 'application/octet-stream');
const cfg = JSON.parse(readFileSync(LIST, 'utf8'));
// In a cloud session the Cloudflare token is a network secret the proxy adds to each request: wrangler only needs
// a placeholder to start, and the account id is looked up once.
function env() {
  const e = { ...process.env };
  if (!e.CLOUDFLARE_API_TOKEN) e.CLOUDFLARE_API_TOKEN = 'placeholder-the-proxy-adds-the-real-token';
  if (!e.CLOUDFLARE_ACCOUNT_ID) {
    const out = execFileSync('curl', ['-s', '-A', 'weski-build', '-H', `Authorization: Bearer ${e.CLOUDFLARE_API_TOKEN}`,
      'https://api.cloudflare.com/client/v4/accounts']).toString();
    e.CLOUDFLARE_ACCOUNT_ID = JSON.parse(out).result[0].id;
  }
  return e;
}
let ENV;
const wrangler = (...a) => execFileSync('npx', ['wrangler', ...a], { env: (ENV ||= env()), stdio: ['ignore', 'pipe', 'inherit'] }).toString();

function bound() {
  const w = readFileSync('wrangler.assets.jsonc', 'utf8');
  return w.includes('"MAPS"') && w.includes(`"${cfg.bucket}"`) && w.includes('"/data/*"');
}

function push(id) {
  const dir = join(DATA, id);
  if (!existsSync(join(dir, 'resort.json'))) throw new Error(`${dir}/resort.json not found`);
  const tmp = join(tmpdir(), `r2-${id}`);
  mkdirSync(tmp, { recursive: true });
  const R = JSON.parse(readFileSync(join(dir, 'resort.json'), 'utf8'));
  writeFileSync(join(tmp, 'graph.json'), JSON.stringify(R.graph || {}));
  delete R.graph;
  writeFileSync(join(tmp, 'resort.json'), JSON.stringify(R));
  for (const f of FILES) {
    const src = f === 'resort.json' || f === 'graph.json' ? join(tmp, f) : join(dir, f);
    if (!existsSync(src)) continue;
    wrangler('r2', 'object', 'put', `${cfg.bucket}/data/${id}/${f}`, '--file', src, '--content-type', TYPE(f), '--remote');
  }
  rmSync(tmp, { recursive: true, force: true });
  if (!cfg.ids.includes(id)) cfg.ids.push(id), cfg.ids.sort();
  writeFileSync(LIST, JSON.stringify(cfg, null, 1) + '\n');
  // the folder stays on disk for builds and tests, but leaves git: R2 holds the copy the app serves
  const ignore = readFileSync('.gitignore', 'utf8');
  if (!ignore.includes(`${dir}/\n`)) appendFileSync('.gitignore', `${dir}/\n`);
  try { execFileSync('git', ['rm', '-r', '-q', '--cached', dir], { stdio: 'ignore' }); } catch { /* not tracked */ }
  console.log(`${id}: uploaded to ${cfg.bucket}, listed in ${LIST}, folder no longer tracked by git`);
}

function pull(id) {
  const dir = join(DATA, id);
  mkdirSync(dir, { recursive: true });
  for (const f of FILES) wrangler('r2', 'object', 'get', `${cfg.bucket}/data/${id}/${f}`, '--file', join(dir, f), '--remote');
  // put the graph back into resort.json, as the build tools write it
  const R = JSON.parse(readFileSync(join(dir, 'resort.json'), 'utf8'));
  R.graph = JSON.parse(readFileSync(join(dir, 'graph.json'), 'utf8'));
  writeFileSync(join(dir, 'resort.json'), JSON.stringify(R));
  rmSync(join(dir, 'graph.json'));
  console.log(`${id}: downloaded into ${dir}`);
}

const [cmd, ...ids] = process.argv.slice(2);
if (cmd === 'setup') {
  console.log(wrangler('r2', 'bucket', 'create', cfg.bucket));
} else if (cmd === 'status') {
  for (const id of cfg.ids) console.log(`${id.padEnd(22)} R2${existsSync(join(DATA, id, 'resort.json')) ? ', also on disk' : ''}`);
  console.log(`${cfg.ids.length} resorts in R2 (bucket ${cfg.bucket}); bucket bound in wrangler.assets.jsonc: ${bound()}`);
} else if (cmd === 'push' && ids.length) {
  if (!bound()) {
    console.error(`Bind the bucket first: in wrangler.assets.jsonc add "r2_buckets": [{ "binding": "MAPS", "bucket_name": "${cfg.bucket}" }]\n` +
      'and "/data/*" to assets.run_worker_first, deploy, then push (docs/ADDING_MOUNTAINS.md, "Map storage").');
    process.exit(1);
  }
  ids.forEach(push);
} else if (cmd === 'pull' && ids.length) {
  (ids[0] === '--all' ? cfg.ids : ids).forEach(pull);
} else {
  console.error('usage: node tools/maps_r2.mjs setup | push <id...> | pull <id...> | pull --all | status');
  process.exit(1);
}
