#!/usr/bin/env node
// Mountain cards: the picture of every mountain in the app, made from our own map data.
//
//   node tools/mountain_cards.mjs <id> [<id> ...]     make cards for these mountains
//   node tools/mountain_cards.mjs --all               every built mountain in public/data/index.json
//   node tools/mountain_cards.mjs --missing           every built mountain that has no card in public/photos/cards.json yet
//   options: --out <dir> (default public/photos), --port <n> (default: the first free one from 5197)
//   (tools/pipeline.py runs it for the mountains it builds; tests/cards.test.js fails when a built mountain has none)
//
// For each mountain the app's own 3D map is opened in headless Chromium (vite dev server, `?skip=<id>`), the camera is
// placed automatically below the base area looking up the fall line (the direction from the lifts' bottoms to the
// highest lift top) and pulled back until every shown run and lift fits, the light is set to a low evening sun, and the
// picture is taken. The key numbers are laid over it in the app's style; every number comes from the mountain's
// resort.json (summit and base as on the resort card, runs and lifts as shown on the map, ratings as the map shows
// them: the resort's own list where we have it, else OpenStreetMap; runs with no rating anywhere are counted as unrated).
//
// Writes <out>/<id>.jpg (768 x 360, the resort card, with the numbers) and <out>/<id>-s.jpg
// (208 x 112, the list thumbnail, picture only), and records the mountain in <out>/cards.json, which the app reads to
// show the cards. Needs the mountain's map files on disk (node tools/maps_r2.mjs pull <id>).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const OUT = opt('--out', 'public/photos');
const ASKED = opt('--port', null);
const up = (port) => fetch(`http://127.0.0.1:${port}`).then(() => true, () => false);
// another checkout's server on the same port would answer instead of ours (without this checkout's maps or code),
// so a port that already answers is never used: the next free one is taken, or an asked-for one is refused
let PORT = +(ASKED || 5197);
while (await up(PORT)) {
  if (ASKED) { console.error(`port ${PORT} is already in use (another vite?): pass another --port`); process.exit(1); }
  if (++PORT > 5260) { console.error('no free port between 5197 and 5260'); process.exit(1); }
}
const ORIGIN = `http://127.0.0.1:${PORT}`;
const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'));
const made = existsSync(join(OUT, 'cards.json')) ? JSON.parse(readFileSync(join(OUT, 'cards.json'), 'utf8')) : {};
const ids = args.includes('--all') ? index.map((r) => r.id)
  : args.includes('--missing') ? index.map((r) => r.id).filter((id) => !made[id] || !existsSync(join(OUT, `${id}.jpg`)))
    : args.filter((a) => !a.startsWith('--'));
if (!ids.length) {
  if (args.includes('--missing')) { console.log('every built mountain has a card'); process.exit(0); }
  console.error('usage: node tools/mountain_cards.mjs <id...> | --all | --missing [--out dir]'); process.exit(1);
}
const missing = ids.filter((id) => !existsSync(`public/data/${id}/resort.json`));
if (missing.length) { console.error(`no map on disk for ${missing.join(', ')}: run node tools/maps_r2.mjs pull ${missing.join(' ')}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- the numbers, straight from resort.json
const fmt = (n) => Math.round(n).toLocaleString('en-US');
function numbers(id) {
  const R = JSON.parse(readFileSync(`public/data/${id}/resort.json`, 'utf8'));
  const place = index.find((r) => r.id === id) || {};
  const eu = !!(R.scheme && R.scheme !== 'us');
  const shown = R.trails.filter((t) => !t.hide && t.name);
  // one run per name, as the resort lists them; a run whose pieces differ takes its hardest piece
  const runs = new Map();
  for (const t of shown) {
    const k = eu ? (t.c ?? [1, 2, 3, 4][t.d]) : t.d;
    const r = runs.get(t.name) || { k: -1, guess: true };
    r.k = Math.max(r.k, k); r.guess = r.guess && !!t.u;
    runs.set(t.name, r);
  }
  const split = eu ? [0, 0, 0, 0, 0] : [0, 0, 0, 0];
  let unrated = 0;
  for (const r of runs.values()) { if (r.guess) unrated++; else split[r.k]++; }
  const top = R.summary.top, base = R.summary.base, usa = /USA$/.test(R.region || '');
  const ft = (m) => `${fmt(m * 3.28084)} ft`, mm = (m) => `${fmt(m)} m`;
  return {
    id, name: R.name, region: R.region, eu, usa, split, unrated, runs: runs.size,
    lifts: R.lifts.filter((l) => !l.hide).length,
    summit: usa ? [ft(top), mm(top)] : [mm(top), ft(top)],
    vert: usa ? [ft(top - base), mm(top - base)] : [mm(top - base), ft(top - base)],
    checked: place.checked !== false,
  };
}

// ---------------------------------------------------------------- in the page: light, camera, picture
/* global window, document, requestAnimationFrame, Image */
function stage(region) {
  const m = window.__map, R = m.resort;
  m.paused = true;
  document.documentElement.classList.add('card-shot');
  m.resize();
  // a low evening sun from the front left, warm light, and a sky that fades from deep blue to gold at the horizon
  const sky = '#f4c590';
  m.scene.background = null;
  m.renderer.setClearColor(0x000000, 0);
  m.scene.fog.color.set(sky); m.scene.fog.near = 7000; m.scene.fog.far = 22000;
  const u = m.up2.clone(), Y = u.clone().set(0, 1, 0), right = u.clone().cross(Y).normalize();   // right of the view
  for (const o of m.scene.children) {
    if (o.isHemisphereLight) { o.color.set('#dfe6ff'); o.groundColor.set('#646f8e'); o.intensity = 0.92; }
    if (o.isDirectionalLight) {
      o.color.set('#ffc890'); o.intensity = 2.35;
      const az = u.clone().multiplyScalar(-0.55).add(right.clone().multiplyScalar(-0.83));   // towards the camera and to its left
      o.position.copy(az.normalize().multiplyScalar(Math.cos(0.3))).setY(Math.sin(0.3));
    }
  }
  // every shown run and lift, in world coordinates
  const P = [];
  const add = (pts, k) => { for (let i = 0; i < pts.length; i += k * 2) P.push(m.world(pts[i], pts[i + 1], 0)); };
  // framed on the runs: a long gondola up from town would otherwise shrink the ski area to a corner
  for (const t of R.trails) if (!t.hide) add(t.pts, 3);
  if (P.length < 50) for (const l of R.lifts) if (!l.hide) add(l.pts, 1);
  const cam = m.cam3;
  cam.aspect = m.w / m.h; cam.fov = 38; cam.updateProjectionMatrix();
  const pitch = 0.38;                                       // about 22 degrees down onto the mountain
  const target = P.reduce((a, p) => a.add(p), u.clone().set(0, 0, 0)).multiplyScalar(1 / P.length);
  let d = 4000;
  const q = (arr, f) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))]; };
  // the camera stays well above the ground under it (a hill in front of the base area would otherwise fill the view)
  let raised = 0;
  const place = () => {
    cam.position.copy(target).addScaledVector(u, -d * Math.cos(pitch)).addScaledVector(Y, d * Math.sin(pitch));
    const [lx, ly] = m.local(cam.position.x, cam.position.z);
    if (m.geo.inBounds(lx, ly)) {
      const lo = m.groundY(cam.position.x, cam.position.z) + 200;
      if (cam.position.y < lo) { raised = lo - cam.position.y; cam.position.y = lo; } else raised = 0;
    }
    cam.lookAt(target); cam.updateMatrixWorld();
  };
  for (let it = 0; it < 60; it++) {
    place();
    const xs = [], ys = [];
    for (const p of P) { const v = p.clone().project(cam); if (v.z < 1) { xs.push(v.x); ys.push(v.y); } }
    // ignore the odd far-flung point (a long road to a car park) so the mountain is not shrunk for it
    const bx0 = q(xs, 0.004), bx1 = q(xs, 0.996), by0 = q(ys, 0.004), by1 = q(ys, 0.996);
    const s = xs.length < P.length * 0.98 ? 1.5 : Math.max((bx1 - bx0) / (region[2] - region[0]), (by1 - by0) / (region[3] - region[1]));
    const dist = cam.position.distanceTo(target), tan = Math.tan((cam.fov * Math.PI) / 360), hh = dist * tan, hw = hh * cam.aspect;
    const camRight = right.clone().set(1, 0, 0).applyQuaternion(cam.quaternion), camUp = Y.clone().applyQuaternion(cam.quaternion);
    target.addScaledVector(camRight, (((bx0 + bx1) - (region[0] + region[2])) / 2) * hw * 0.8)
      .addScaledVector(camUp, (((by0 + by1) - (region[1] + region[3])) / 2) * hh * 0.8);
    d = Math.min(30000, Math.max(600, d * Math.pow(s, 0.6)));
  }
  place();
  // the haze starts beyond the mountain, however far back a big ski area puts the camera
  const dist = cam.position.distanceTo(target);
  m.scene.fog.near = Math.max(7000, dist * 1.4); m.scene.fog.far = Math.max(22000, dist * 4);
  m.controls.target.copy(target);
  return new Promise((resolve) => requestAnimationFrame(() => {
    m.pickLods(); m.updateTrees(); m.animateLifts(m.t || 1);
    m.renderer.render(m.scene, cam);
    requestAnimationFrame(() => resolve({ d: Math.round(d), raised: Math.round(raised) }));
  }));
}

function overlay(n) {
  const el = document.createElement('div');
  el.id = 'card-overlay';
  const usSym = [
    '<i class="s g"></i>', '<i class="s b"></i>', '<i class="s k"></i>', '<i class="s k"></i><i class="s k"></i>',
  ];
  const euSym = ['<i class="c" style="background:#1fa750"></i>', '<i class="c" style="background:#2b7de9"></i>',
    '<i class="c" style="background:#e0262d"></i>', '<i class="c" style="background:#16181d"></i>', '<i class="c" style="background:#d99a00"></i>'];
  const sym = n.eu ? euSym : usSym;
  const chips = n.split.map((c, i) => (c ? `<span class="chip">${sym[i]}<b>${c}</b></span>` : '')).join('')
    + (n.unrated ? `<span class="chip"><b>${n.unrated}</b><small>unrated</small></span>` : '');
  el.innerHTML = `<div class="panel">
    <h1>${n.name}</h1><p class="reg">${n.region}</p>
    <div class="grid">
      <div><b>${n.summit[0]}</b><span>Summit · ${n.summit[1]}</span></div>
      <div><b>${n.vert[0]}</b><span>Vertical · ${n.vert[1]}</span></div>
      <div><b>${n.runs}</b><span>Runs</span></div>
      <div><b>${n.lifts}</b><span>Lifts</span></div>
    </div>
    <div class="chips">${chips}</div></div>`;
  document.body.appendChild(el);
  // a long name gets smaller until it fits on two lines
  const h1 = el.querySelector('h1');
  for (let s = 30; s > 16 && h1.scrollHeight > s * 1.12 * 2 + 2; s -= 1) h1.style.fontSize = `${s - 1}px`;
  return document.fonts.ready.then(() => true);
}

const CSS = `
html.card-shot body > *:not(#app):not(#card-overlay) { display: none !important; }
html.card-shot #app { top: 0 !important; left: 0 !important; right: 0 !important; width: 100vw !important; height: 100vh !important; transform: none !important;
  border-radius: 0 !important; box-shadow: none !important; visibility: visible !important; }
html.card-shot #app > *:not(#map) { display: none !important; }
html.card-shot #map { background: linear-gradient(180deg, #2c4a7c 0%, #6f7fa8 30%, #d9a98a 62%, #f4c590 80%); }
html.card-shot #map .map-overlay { display: none !important; }
html.card-shot #map::after { content: ''; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: soft-light;
  background: radial-gradient(ellipse 80% 90% at 88% 0%, rgba(255, 190, 110, .55), rgba(255, 170, 90, .18) 55%, rgba(60, 40, 90, .12) 100%); }
#card-overlay { position: fixed; inset: 0; pointer-events: none; font-family: 'Montserrat Variable', 'Nunito Sans Variable', system-ui, sans-serif; color: #fff; }
#card-overlay .panel { position: absolute; left: 0; top: 0; bottom: 0; width: 340px; padding: 20px 22px 0 24px; box-sizing: border-box;
  background: linear-gradient(90deg, rgba(3, 11, 22, .9) 0%, rgba(3, 11, 22, .78) 62%, rgba(3, 11, 22, 0) 100%); }
#card-overlay h1 { margin: 0; font: 400 30px/1.12 'Bowlby One', 'Montserrat Variable', sans-serif; letter-spacing: .3px; max-width: 290px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, .45); }
#card-overlay .reg { margin: 6px 0 14px; font-size: 14px; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; color: #b8c7d8; }
#card-overlay .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; max-width: 290px; }
#card-overlay .grid b { display: block; font-size: 26px; font-weight: 800; line-height: 1.05; letter-spacing: -.3px; }
#card-overlay .grid span { display: block; margin-top: 2px; font-size: 12.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #3ee6c4; white-space: nowrap; }
#card-overlay .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; max-width: 312px; }
#card-overlay .chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px; border-radius: 999px; background: rgba(255, 255, 255, .14);
  border: 1px solid rgba(255, 255, 255, .22); font-size: 18px; font-weight: 800; }
#card-overlay .s { display: inline-block; width: 15px; height: 15px; box-sizing: border-box; font-style: normal; }
#card-overlay .s.g { background: #1fa750; border-radius: 50%; border: 2px solid #fff; }
#card-overlay .s.b { background: #2b7de9; border: 2px solid #fff; }
#card-overlay .s.k { background: #16181d; transform: rotate(45deg) scale(.82); border: 2px solid #fff; }
#card-overlay .s.k + .s.k { margin-left: -4px; }
#card-overlay .chip small { font-size: 13px; font-weight: 700; color: #c9d4e0; text-transform: uppercase; letter-spacing: .8px; }
#card-overlay .c { display: inline-block; width: 15px; height: 15px; border-radius: 50%; border: 2px solid #fff; }
`;

// ---------------------------------------------------------------- run it
// vite itself, not through npx: stopping npx would leave vite running on the port
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; ; i++) {
  try { if ((await fetch(ORIGIN)).ok) break; } catch { /* not up yet */ }
  if (i > 80) throw new Error('vite did not start');
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const W = 768, H = 360, SCALE = 2;
const manifestPath = join(OUT, 'cards.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const failed = [];
try {
  // a page that turns screenshots into JPEGs of the right size (drawn down from twice the size, for sharp lines and text)
  const shrinker = await browser.newPage();
  const jpeg = async (png, sx, sy, sw, sh, w, h) => {
    const data = await shrinker.evaluate(async ({ b64, sx, sy, sw, sh, w, h }) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      // two halving steps keep thin lines from shimmering
      let src = img, cw = sw, ch = sh, x = sx, y = sy;
      while (cw / 2 > w * 1.01) {
        const t = document.createElement('canvas'); t.width = Math.round(cw / 2); t.height = Math.round(ch / 2);
        const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(src, x, y, cw, ch, 0, 0, t.width, t.height);
        src = t; x = 0; y = 0; cw = t.width; ch = t.height;
      }
      g.drawImage(src, x, y, cw, ch, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.86);
    }, { b64: png.toString('base64'), sx, sy, sw, sh, w, h });
    return Buffer.from(data.split(',')[1], 'base64');
  };
  for (const id of ids) {
    const n = numbers(id);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
    await ctx.addInitScript(() => {
      localStorage.setItem('weski:installSeen', 'true');
      localStorage.setItem('weski:consent', JSON.stringify({ v: 'card', at: Date.now() }));
    });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    try {
      await page.goto(`${ORIGIN}/?skip=${id}`);
      // the terms screen (the version is read from the page, so it never goes stale here)
      const consent = page.locator('#f-consent');
      if (await consent.isVisible({ timeout: 8000 }).catch(() => false)) { await consent.check(); await page.locator('#consent-ok').click(); }
      await page.waitForFunction((want) => window.__map?.resort?.id === want && !window.__map.flight, id, { timeout: 120000 });
      await page.waitForTimeout(2500);
      await page.addStyleTag({ content: CSS });
      await page.evaluate(() => document.fonts.load("30px 'Bowlby One'"));
      // the list thumbnail: the whole mountain in the middle of the picture
      await page.evaluate(stage, [-0.8, -0.82, 0.8, 0.8]);
      const thumb = await page.screenshot();
      const tw = Math.round(H * SCALE * (208 / 112));
      writeFileSync(join(OUT, `${id}-s.jpg`), await jpeg(thumb, Math.round((W * SCALE - tw) / 2), 0, tw, H * SCALE, 208, 112));
      // the resort card: the mountain on the right, the numbers on the left, the bottom kept clear for the credit line
      const view = await page.evaluate(stage, [2 * 330 / W - 1, -1 + 2 * 30 / H, 0.95, 0.86]);
      if (process.env.DEBUG) console.log(id, view);
      await page.evaluate(overlay, n);
      const card = await page.screenshot();
      writeFileSync(join(OUT, `${id}.jpg`), await jpeg(card, 0, 0, W * SCALE, H * SCALE, W, H));
      manifest[id] = { made: new Date().toISOString().slice(0, 10), runs: n.runs, lifts: n.lifts };
      console.log(`${id}: card made (${n.runs} runs ${JSON.stringify(n.split)}${n.unrated ? ` + ${n.unrated} unrated` : ''}, ${n.lifts} lifts)`);
    } catch (e) {
      failed.push(id);
      console.error(`${id}: not made (${e.message.split('\n')[0]})`);
    } finally { await ctx.close(); }
  }
} finally {
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  writeFileSync(manifestPath, JSON.stringify(sorted, null, 1) + '\n');
  await browser.close();
  stop();
}
console.log(`${ids.length - failed.length} cards made${failed.length ? `, failed: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
