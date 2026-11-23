// Upload rebuilt map files to the preview site only, without redeploying the preview app:
//
//   node tools/preview/maps.mjs <resort id> [...]
//
// Sends the map files of each resort named (as they are on disk in public/data/<id>) to R2 under preview/data/<id>/,
// the same files and packing as tools/preview/deploy.mjs step 2. The preview Worker reads preview/data/<id>/ first,
// so the preview shows the new maps at once; the app bundled in the preview Worker is left as it is (use deploy.mjs
// for that). The live data/ files are not touched. Needs the Cloudflare token, as deploy.mjs does.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packResort } from '../heights_pack.mjs';

const ids = process.argv.slice(2);
if (!ids.length) throw new Error('usage: node tools/preview/maps.mjs <resort id> [...]');
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'proxy-injected';
const AUTH = ['-H', `Authorization: Bearer ${TOKEN}`, '-A', 'weski-build'];
const curl = (args) => execFileSync('curl', ['-s', '--fail-with-body', ...AUTH, ...args], { maxBuffer: 1 << 26 }).toString();
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || JSON.parse(curl(['https://api.cloudflare.com/client/v4/accounts'])).result[0].id;
const BUCKET = JSON.parse(readFileSync('public/data/r2.json', 'utf8')).bucket;
const out = 'tools/preview/.maps';

const put = (key, file, type) => {
  const r = JSON.parse(curl(['-X', 'PUT', '-H', `Content-Type: ${type}`, '--data-binary', `@${file}`,
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`]));
  if (!r.success) throw new Error(`${key}: ${JSON.stringify(r.errors)}`);
};
rmSync(out, { recursive: true, force: true });
for (const id of ids) {
  const dir = `public/data/${id}`, tmp = join(out, id);
  if (!existsSync(`${dir}/resort.json`)) throw new Error(`${dir}/resort.json not found (node tools/maps_r2.mjs pull ${id})`);
  mkdirSync(tmp, { recursive: true });
  const R = JSON.parse(readFileSync(`${dir}/resort.json`, 'utf8'));
  writeFileSync(join(tmp, 'graph.json'), JSON.stringify(R.graph || {}));
  delete R.graph;
  writeFileSync(join(tmp, 'resort.json'), JSON.stringify(R));
  for (const [name, buf] of Object.entries(packResort(dir, R))) writeFileSync(join(tmp, name), buf);
  const send = ['resort.json', 'graph.json', 'terrain.z16', 'surround.z16'].map((f) => [f, join(tmp, f)])
    .concat(['terrain.bin', 'surround.bin', 'canopy.z8'].map((f) => [f, join(dir, f)]));
  let n = 0;
  for (const [f, file] of send) if (existsSync(file)) { put(`preview/data/${id}/${f}`, file, f.endsWith('.json') ? 'application/json' : 'application/octet-stream'); n++; }
  console.log(`${id}: ${n} map files uploaded to preview/data/${id}/`);
}
rmSync(out, { recursive: true, force: true });
