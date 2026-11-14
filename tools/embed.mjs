// Copies the built app (dist/) into worker/static as binary modules plus a manifest,
// so the Worker serves the whole app itself (small enough: well under the 3 MB free limit).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml',
};
const dist = 'dist', out = 'worker/static';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(dist);
let imports = '', entries = '';
files.sort().forEach((p, i) => {
  const url = '/' + relative(dist, p).replace(/\\/g, '/');
  copyFileSync(p, join(out, `f${i}.bin`));
  const etag = createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 16);
  imports += `import f${i} from './f${i}.bin';\n`;
  entries += `  ${JSON.stringify(url)}: { body: f${i}, type: ${JSON.stringify(TYPES[extname(p)] || 'application/octet-stream')}, etag: '"${etag}"' },\n`;
});
writeFileSync(join(out, 'manifest.js'), `${imports}export const FILES = {\n${entries}};\n`);
console.log(`embedded ${files.length} files into ${out}`);
