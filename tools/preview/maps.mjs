// Upload rebuilt map files to the preview site only, without redeploying the preview app:
//
//   node tools/preview/maps.mjs <resort id> [...]
//
// Sends the map files of each resort named (as they are on disk in public/data/<id>) to R2 under preview/data/<id>/,
// the same files and packing as tools/preview/deploy.mjs step 2. The preview Worker reads preview/data/<id>/ first,
// so the preview shows the new maps at once; the app bundled in the preview Worker is left as it is (use deploy.mjs
// for that). The live data/ files are not touched. Needs the Cloudflare token, as deploy.mjs does.
//
//   node tools/preview/maps.mjs fetch <resort id> [...]
//
// The other way, read-only: downloads preview/data/<id>/ back into public/data/<id> (resort.json with its graph put
// back, terrain.bin, surround.bin, canopy.z8, landcover.z8), so a later session can push a map the owner approved on the preview
// with `node tools/maps_r2.mjs push <id>` without rebuilding it (nothing outside the repository survives a session).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packResort } from '../heights_pack.mjs';

const FETCH = process.argv[2] === 'fetch';
const ids = process.argv.slice(FETCH ? 3 : 2);
if (!ids.length) throw new Error('usage: node tools/preview/maps.mjs [fetch] <resort id> [...]');
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
if (FETCH) {
  for (const id of ids) {
    const dir = `public/data/${id}`;
    mkdirSync(dir, { recursive: true });
    const get = (f, to) => {
      try {
        execFileSync('curl', ['-s', '--fail', ...AUTH, '-o', to, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/preview/data/${id}/${f}`]);
        return true;
      } catch { return false; }
    };
    if (!get('resort.json', `${dir}/resort.json`) || !get('graph.json', `${dir}/graph.tmp.json`)) throw new Error(`${id}: not on the preview`);
    const R = JSON.parse(readFileSync(`${dir}/resort.json`, 'utf8'));
    R.graph = JSON.parse(readFileSync(`${dir}/graph.tmp.json`, 'utf8'));
    writeFileSync(`${dir}/resort.json`, JSON.stringify(R));
    rmSync(`${dir}/graph.tmp.json`);
    const n = ['terrain.bin', 'surround.bin', 'canopy.z8', 'landcover.z8'].filter((f) => get(f, `${dir}/${f}`)).length;
    console.log(`${id}: fetched from the preview into ${dir} (resort.json and ${n} more files)`);
  }
  process.exit(0);
}
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
    .concat(['terrain.bin', 'surround.bin', 'canopy.z8', 'landcover.z8'].map((f) => [f, join(dir, f)]));
  let n = 0;
  for (const [f, file] of send) if (existsSync(file)) { put(`preview/data/${id}/${f}`, file, f.endsWith('.json') ? 'application/json' : 'application/octet-stream'); n++; }
  console.log(`${id}: ${n} map files uploaded to preview/data/${id}/`);
}
rmSync(out, { recursive: true, force: true });
