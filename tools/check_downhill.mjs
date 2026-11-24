// Does every run go downhill? A run line drawn in the wrong place, especially on open ground above the
// treeline where an aerial photo cannot show it, often climbs over a ridge or across a gully. This walks
// every run from its higher end to its lower end on the built terrain, every 10 m, and reports runs that
// climb more than LIMIT metres at a stretch. Traverses, catwalks and roads are listed separately: they may
// legitimately rise a little.
//   node tools/check_downhill.mjs [id ...] [--limit 12] [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Geo, pointAlong, lineLength } from '../src/geo.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const LIMIT = +opt('--limit', 12), OUT = opt('--json', null);
const ids = args.length ? args : readdirSync('public/data', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const FLAT = /travers|cat[- ]?walk|cat track|road|skiweg|weg\b|verbindung|liaison|chemin|route|connect|link|access|run-?out|ziehweg|piste de liaison|retour|boulevard|path|trail to|way to|schuss|bridge|tunnel/i;

const all = [];
for (const id of ids) {
  let resort, heights;
  try {
    resort = JSON.parse(readFileSync(`public/data/${id}/resort.json`, 'utf8'));
    const buf = readFileSync(`public/data/${id}/terrain.bin`);
    heights = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  } catch { continue; }
  const geo = new Geo(resort, heights);
  const out = [];
  for (const t of resort.trails) {
    const L = lineLength(t.pts);
    if (L < 60) continue;
    const z = [];
    for (let s = 0; s <= L; s += 10) { const p = pointAlong(t.pts, s); z.push(geo.elev(p[0], p[1])); }
    if (z[0] < z[z.length - 1]) z.reverse();                 // walk from the higher end
    // smooth over 30 m so a terrain step or a bump in the snow does not count
    const sm = z.map((_, i) => (z[Math.max(0, i - 1)] + z[i] + z[Math.min(z.length - 1, i + 1)]) / 3);
    let low = sm[0], climb = 0, at = 0;
    for (let i = 1; i < sm.length; i++) {
      if (sm[i] - low > climb) { climb = sm[i] - low; at = i * 10; }
      low = Math.min(low, sm[i]);
    }
    if (climb > LIMIT) out.push({ id, name: t.name, osm: t.osm, traced: !!t.traced, len: Math.round(L), climb: Math.round(climb), at, flat: FLAT.test(t.name || '') || !t.name, drop: Math.round(z[0] - z[z.length - 1]) });
  }
  const real = out.filter((r) => !r.flat);
  console.log(`${id.padEnd(20)} runs ${String(resort.trails.length).padStart(4)}  climbing ${real.length}${out.length - real.length ? ` (+${out.length - real.length} traverses/unnamed)` : ''}`);
  for (const r of real.sort((a, b) => b.climb - a.climb)) console.log(`   ${r.name}${r.traced ? ' [traced]' : ''} (${r.osm}): climbs ${r.climb} m, ${r.at} m from the top of ${r.len} m (drop ${r.drop} m)`);
  all.push(...out);
}
if (OUT) writeFileSync(OUT, JSON.stringify(all, null, 1));
