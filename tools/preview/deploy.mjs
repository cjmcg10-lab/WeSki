// Put the current branch on the preview site, without touching the live app:
//
//   node tools/preview/deploy.mjs [<resort id> ...]
//   node tools/preview/deploy.mjs --main      (run by the Deploy workflow after every live deploy)
//
// The preview is always built on the current live app (#142): after every live deploy the Deploy workflow puts main
// on the preview with --main, which also clears the preview's card pictures and every preview map copy that has since
// gone live, so it shows the live app (maps still waiting for approval stay). A branch is only put on the preview once it contains the latest main (merge main into it first).
//
// 1. builds the app (npm run build:assets) and bundles it into the preview Worker (tools/preview/worker.js);
// 2. uploads the map files of the resorts named (as they are on disk in public/data/<id>, e.g. with a new
//    canopy.z8 or an enriched resort.json) to R2 under preview/data/<id>/: the live data/ files are not touched;
// 3. deploys the Worker `skiwithme-preview` and prints its address.
// Every other resort opens from the live map files. Photos and Forecast data come from the live site.
//
// Needs the Cloudflare token: in a cloud session the proxy adds it; elsewhere CLOUDFLARE_API_TOKEN (and optionally
// CLOUDFLARE_ACCOUNT_ID). To remove the preview: npx wrangler delete -c tools/preview/wrangler.jsonc
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { packResort } from '../heights_pack.mjs';

const MAIN = process.argv.includes('--main');
const ids = process.argv.slice(2).filter((a) => a !== '--main');
if (MAIN && ids.length) throw new Error('--main puts the live app on the preview; it takes no resort ids');
// a branch must hold every change already live, so what is tried on the preview is what will be released
if (!MAIN) {
  const git = (...a) => execFileSync('git', a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  git('fetch', '-q', 'origin', 'main');
  try { git('merge-base', '--is-ancestor', 'origin/main', 'HEAD'); } catch {
    console.error('This branch does not have the latest live app (origin/main). Bring it up to date first:\n' +
      '  git fetch origin main && git merge origin/main\nthen run this again.');
    process.exit(1);
  }
}
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'proxy-injected';
const AUTH = ['-H', `Authorization: Bearer ${TOKEN}`, '-A', 'weski-build'];
const curl = (args) => execFileSync('curl', ['-s', '--fail-with-body', ...AUTH, ...args], { maxBuffer: 1 << 26 }).toString();
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || JSON.parse(curl(['https://api.cloudflare.com/client/v4/accounts'])).result[0].id;
const BUCKET = JSON.parse(readFileSync('public/data/r2.json', 'utf8')).bucket;

// 1. the app
execFileSync('npm', ['run', 'build:assets'], { stdio: 'inherit' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.bin': 'application/octet-stream' };
const out = 'tools/preview/.build';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
walk('dist');
// map folders come from R2, photos and Forecast data from the live site: the Worker stays under the 3 MB limit
const keep = files.filter((p) => { const u = '/' + relative('dist', p); return !/^\/(data\/[^/]+\/|photos\/|forecast\/)/.test(u) && !u.startsWith('/_'); });
let imp = '', ent = '';
keep.sort().forEach((p, i) => {
  let url = '/' + relative('dist', p).replace(/\\/g, '/');
  copyFileSync(p, join(out, `f${i}.bin`));
  // no offline caching in the preview: a tester always sees the latest deploy
  if (url === '/sw.js') writeFileSync(join(out, `f${i}.bin`), 'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(caches.keys().then((k)=>Promise.all(k.map((n)=>caches.delete(n))))));');
  if (url === '/offline.json') writeFileSync(join(out, `f${i}.bin`), '[]');
  imp += `import f${i} from './f${i}.bin';\n`;
  ent += `  ${JSON.stringify(url)}: [f${i}, ${JSON.stringify(TYPES[extname(p)] || 'application/octet-stream')}],\n`;
});
writeFileSync(join(out, 'manifest.js'), `${imp}export const FILES = {\n${ent}};\n`);
console.log(`bundled ${keep.length} app files`);

// 2. the rebuilt maps, under preview/
const put = (key, file, type) => {
  const r = JSON.parse(curl(['-X', 'PUT', '-H', `Content-Type: ${type}`, '--data-binary', `@${file}`,
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`]));
  if (!r.success) throw new Error(`${key}: ${JSON.stringify(r.errors)}`);
};
for (const id of ids) {
  const dir = `public/data/${id}`, tmp = join(out, 'maps', id);
  if (!existsSync(`${dir}/resort.json`)) throw new Error(`${dir}/resort.json not found (node tools/maps_r2.mjs pull ${id})`);
  mkdirSync(tmp, { recursive: true });
  const R = JSON.parse(readFileSync(`${dir}/resort.json`, 'utf8'));
  writeFileSync(join(tmp, 'graph.json'), JSON.stringify(R.graph || {}));
  delete R.graph;
  writeFileSync(join(tmp, 'resort.json'), JSON.stringify(R));
  for (const [name, buf] of Object.entries(packResort(dir, R))) writeFileSync(join(tmp, name), buf);
  const send = ['resort.json', 'graph.json', 'terrain.z16', 'surround.z16'].map((f) => [f, join(tmp, f)])
    .concat(['terrain.bin', 'surround.bin', 'canopy.z8', 'landcover.z8'].map((f) => [f, join(dir, f)]));
  let n = 0;
  for (const [f, file] of send) if (existsSync(file)) { put(`preview/data/${id}/${f}`, file, f.endsWith('.json') ? 'application/json' : 'application/octet-stream'); n++; }
  console.log(`${id}: ${n} map files uploaded to preview/data/${id}/`);
}

// With --main the preview shows the live app. Its card pictures are removed (they are kept in git), and so is every
// preview map copy that went live afterwards (the live resort.json is newer). A preview map newer than the live one is
// kept: it can be the only copy of a map waiting for the owner's approval (tools/preview/maps.mjs fetch).
if (MAIN) {
  const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects`;
  const list = (prefix) => {
    const all = [];
    let cursor = '';
    do {
      const j = JSON.parse(curl([`${API}?prefix=${encodeURIComponent(prefix)}&per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`]));
      all.push(...(j.result || []));
      cursor = j.result_info?.is_truncated ? j.result_info.cursor : '';
    } while (cursor);
    return all;
  };
  const del = (k) => curl(['-X', 'DELETE', `${API}/${k.split('/').map(encodeURIComponent).join('/')}`]);
  const prev = list('preview/');
  let gone = 0, kept = 0;
  for (const o of prev) if (o.key.startsWith('preview/photos/')) { del(o.key); gone++; }
  const ids = new Set(prev.map((o) => o.key.match(/^preview\/data\/([^/]+)\//)?.[1]).filter(Boolean));
  for (const id of ids) {
    const mine = prev.find((o) => o.key === `preview/data/${id}/resort.json`);
    const live = list(`data/${id}/resort.json`).find((o) => o.key === `data/${id}/resort.json`);
    if (live && (!mine || Date.parse(live.last_modified) > Date.parse(mine.last_modified))) {
      for (const o of prev) if (o.key.startsWith(`preview/data/${id}/`)) { del(o.key); gone++; }
    } else kept++;
  }
  console.log(`preview: ${gone} copies removed that are live now or kept in git; ${kept} map(s) newer than live kept (awaiting approval)`);
}

// 2b. pictures made from our own maps (public/photos/cards.json and its images), which the live site may not have yet
if (!MAIN && existsSync('public/photos/cards.json')) {
  const cards = Object.keys(JSON.parse(readFileSync('public/photos/cards.json', 'utf8')));
  put('preview/photos/cards.json', 'public/photos/cards.json', 'application/json');
  for (const id of cards) for (const f of [`${id}.jpg`, `${id}-s.jpg`]) if (existsSync(`public/photos/${f}`)) put(`preview/photos/${f}`, `public/photos/${f}`, 'image/jpeg');
  console.log(`${cards.length} mountain cards uploaded to preview/photos/`);
}

// 3. the Worker
execFileSync('npx', ['wrangler', 'deploy', '-c', 'tools/preview/wrangler.jsonc'], {
  stdio: 'inherit', env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
});
