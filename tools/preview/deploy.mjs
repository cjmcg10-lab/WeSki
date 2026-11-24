// Put the current branch on the preview site, without touching the live app:
//
//   node tools/preview/deploy.mjs [<resort id> ...]
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

const ids = process.argv.slice(2);
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

// 3. the Worker
execFileSync('npx', ['wrangler', 'deploy', '-c', 'tools/preview/wrangler.jsonc'], {
  stdio: 'inherit', env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
});
