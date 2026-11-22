import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// After the build, stamp the service worker with the list of files to precache
// so the whole app (code + resort map data) works offline.
function swManifest() {
  return {
    name: 'sw-manifest',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      // Directions data is part of the paid pass: move each resort's routing graph out of resort.json into
      // graph.json, which the Worker serves only to a signed-in phone with a pass (when the paywall is on).
      for (const id of readdirSync(join(dist, 'data'))) {
        const f = join(dist, 'data', id, 'resort.json');
        let R;
        try { R = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
        if (!R.graph) continue;
        writeFileSync(join(dist, 'data', id, 'graph.json'), JSON.stringify(R.graph));
        delete R.graph;
        writeFileSync(f, JSON.stringify(R));
      }
      const files = [];
      const walk = (d) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (f !== 'sw.js') {
            const url = '/' + relative(dist, p).replace(/\\/g, '/');
            // each resort's map (data/<id>/...) is fetched and cached when that resort is opened,
            // not up front: only the app shell, globe and resort list are precached
            if (!/^\/(data\/[^/]+|forecast)\//.test(url)) files.push(url);
          }
        }
      };
      walk(dist);
      const list = files.map((f) => (f === '/index.html' ? '/' : f)).concat('/offline.json').sort();
      writeFileSync(join(dist, 'offline.json'), JSON.stringify(list));
      files.push('/offline.json');
      const hash = createHash('sha1');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f)));
      const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 10))
        .replace('"__FILES__"', JSON.stringify(files.map((f) => (f === '/index.html' ? '/' : f))));
      writeFileSync(join(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  plugins: [swManifest()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
  test: { environment: 'node' },
});
