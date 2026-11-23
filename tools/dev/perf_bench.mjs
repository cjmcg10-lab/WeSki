// Map performance bench: opens each resort in the built app (vite preview) under SwiftShader and measures
// renderer.info (total and per component), heap, construction time per build step, per-frame CPU split,
// render cost full-size vs tiny (fill vs geometry), and how often the idle loop redraws.
// Usage: node bench.mjs <origin> <out.json> id [id...]   (env DPR=1|2, VARIANT=label)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const [origin, out, ...ids] = process.argv.slice(2);
const DPR = +(process.env.DPR || 1);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const results = {};
for (const id of ids) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
  await context.addInitScript(() => { localStorage.setItem('weski:installSeen', 'true'); });
  await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addLocatorHandler(page.locator('#modal:not(.hidden) .modal-box'), async () => {
    await page.locator('#modal:not(.hidden) [data-act="modal-cancel"]').first().click();
  });
  const t0 = Date.now();
  await page.goto(`${origin}/?skip=${id}${process.env.PERF ? '&perf=' + process.env.PERF : ''}`);
  try { await page.locator('#f-consent').check({ timeout: 8000 }); await page.locator('#consent-ok').click(); } catch { /* none */ }
  await page.waitForFunction(() => window.skiwithme?.map?.terrain, null, { timeout: 180000 });
  const openMs = Date.now() - t0;
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async ({ id, FAST }) => {
    const S = window.skiwithme, map = S.map, R = map.renderer, RENDER = R.render, gl = R.getContext(), V3 = map.cam3.position.constructor;
    map.setPaused(true);
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const res = { id };
    // ---- load: resource timings and pure decode costs (map paused, so the main thread is free)
    res.resources = performance.getEntriesByType('resource').filter((e) => e.name.includes(`/data/${id}/`))
      .map((e) => ({ f: e.name.split('/').pop(), kb: Math.round((e.transferSize || e.encodedBodySize) / 1024), ms: Math.round(e.responseEnd - e.startTime) }));
    {
      const txt = await (await fetch(`/data/${id}/resort.json`)).text();
      let t = performance.now(); JSON.parse(txt); res.parseResortMs = Math.round(performance.now() - t);
      res.resortKB = Math.round(txt.length / 1024);
      const gunzip = async (u) => { const r = await fetch(u); if (!r.ok) return null; return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); };
      t = performance.now(); const z = await gunzip(`/data/${id}/terrain.z16`); res.gunzipTerrainMs = Math.round(performance.now() - t);
      if (z) {
        t = performance.now();
        const dv = new DataView(z.buffer), nx = dv.getUint32(4, true), n = dv.getUint32(8, true), h = new Uint16Array(n);
        for (let i = 0; i < n; i++) { const x = i % nx; const p = i < nx ? (x ? h[i - 1] : 0) : !x ? h[i - nx] : h[i - 1] + h[i - nx] - h[i - nx - 1]; h[i] = (z[12 + i] | (z[12 + n + i] << 8)) + p; }
        res.decodeTerrainMs = Math.round(performance.now() - t);
      }
      t = performance.now(); await gunzip(`/data/${id}/canopy.z8`); res.gunzipCanopyMs = Math.round(performance.now() - t);
    }
    // ---- construction breakdown: a second map built with every build step timed
    const P = Object.getPrototypeOf(map), steps = ['buildTerrain', 'groundMaterial', 'buildSurround', 'buildTrees', 'buildTrails', 'buildLifts', 'buildBuildings', 'buildMarkers'];
    const orig = {}, times = {};
    for (const s of steps) { orig[s] = P[s]; P[s] = function (...a) { const t = performance.now(); const v = orig[s].apply(this, a); times[s] = (times[s] || 0) + performance.now() - t; return v; }; }
    const div = document.createElement('div'); div.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;z-index:-1';
    document.body.appendChild(div);
    // with a background-worker set-up (SkiMap.prepare), the frozen part is the constructor given its result
    let prep = null, prepMs = null;
    if (map.constructor.prepare) { const q = performance.now(); prep = await map.constructor.prepare(S.resort, S.geo); prepMs = Math.round(performance.now() - q); }
    let t = performance.now();
    const m2 = new map.constructor(div, S.resort, S.geo, map.surroundH, map.canopy, prep ? { prep } : undefined);
    const ctorMs = performance.now() - t;
    m2.setPaused(true); m2.running = false;
    t = performance.now(); m2.frame(); m2.renderer.getContext().readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const firstFrameMs = performance.now() - t;
    for (const s of steps) P[s] = orig[s];
    m2.dispose(); div.remove();
    res.build = { prepWorkerMs: prepMs, ctorMs: Math.round(ctorMs), firstFrameMs: Math.round(firstFrameMs), steps: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v)])) };
    if (window.gc) { window.gc(); window.gc(); }
    await new Promise((ok) => setTimeout(ok, 300));
    res.heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    // ---- scene inventory
    const inv = { meshes: 0, instanced: 0, instances: 0, lines: 0, xray: 0, lineSegs: 0 };
    map.scene.traverse((o) => {
      if (o.isInstancedMesh) { inv.instanced++; inv.instances += o.count; } else if (o.isMesh && !o.isLineSegments2) inv.meshes++;
      if (o.isLineSegments2) { inv.lines++; inv.lineSegs += o.geometry.instanceCount ?? 0; if (o.material.stencilFunc === 514) inv.xray++; }
    });
    inv.trees = map.treeTotal; inv.terrainTris = map.terrain.geometry.index.count / 3; inv.terrainPieces = map.terrainPieces?.length || 0;
    inv.groundTex = [map.groundTex.image.width, map.groundTex.image.height]; inv.canopyTex = map.canopyTex ? [map.canopyTex.image.width, map.canopyTex.image.height] : null;
    inv.trailLabels = map.trailLabels.length; inv.liftLabels = map.liftLabels.length; inv.pois = S.resort.pois.length;
    res.inventory = inv;
    // ---- views
    const c = map.controls, cam = map.cam3, home = { p: cam.position.clone(), t: c.target.clone() };
    const lp = [...map.liftPaths].sort((a, b) => b.L - a.L)[0];
    const setView = (v) => {
      if (v.home) { cam.position.copy(home.p); c.target.copy(home.t); return; }
      c.target.set(v.t.x, map.groundY(v.t.x, v.t.z), v.t.z);
      const ph = v.polar * Math.PI / 180, az = v.az * Math.PI / 180;
      cam.position.set(c.target.x + v.d * Math.sin(ph) * Math.sin(az), c.target.y + v.d * Math.cos(ph), c.target.z + v.d * Math.sin(ph) * Math.cos(az));
    };
    const views = { overview: { home: true }, mid: { t: { x: 0, z: 0 }, d: 3500, polar: 55, az: 200 }, close: { t: { x: lp.pts[0].x, z: lp.pts[0].z }, d: 700, polar: 70, az: 200 } };
    const renderOnly = (n = 6) => { const a = []; for (let i = 0; i < n + 1; i++) { const q = performance.now(); R.render(map.scene, map.camera); sync(); if (i) a.push(performance.now() - q); } return med(a); };
    const comp = { terrain: [map.terrainGroup || map.terrain], trees: [map.trees], runLines: [], runXray: [], surround: map.surroundGroup ? [map.surroundGroup] : [], buildings: [], liftsEtc: [] };
    for (const o of map.trailGroup.children) (o.material.stencilFunc === 514 ? comp.runXray : comp.runLines).push(o);
    for (const o of map.scene.children) {
      if (o === map.terrain || o === map.terrainGroup || o === map.surroundGroup || o === map.trees || o === map.trailGroup || o.isLight) continue;
      if (o.isMesh && !o.isInstancedMesh && o.material.side === 2 && o.geometry.attributes.color && !o.geometry.index && (o.material.flatShading || o.geometry.attributes.win)) comp.buildings.push(o);
      else if (o.isMesh && o.geometry.index && o.geometry.attributes.color && o.material.vertexColors && o.geometry.index.count > 30000) comp.surround.push(o);
      else comp.liftsEtc.push(o);
    }
    const counts = () => { R.info.autoReset = true; R.render(map.scene, map.camera); return { calls: R.info.render.calls, tris: R.info.render.triangles }; };
    const hide = (list, f) => { const vis = list.map((o) => o.visible); list.forEach((o) => { o.visible = false; }); const v = f(); list.forEach((o, i) => { o.visible = vis[i]; }); return v; };
    res.views = {};
    for (const [name, v] of Object.entries(views)) {
      setView(v); map.frame(); map.frame();
      const tot = counts();
      const info = { ...tot, geoms: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length };
      const parts = {};
      for (const [k, list] of Object.entries(comp)) if (list.length) { const w = hide(list, counts); parts[k] = { calls: tot.calls - w.calls, tris: tot.tris - w.tris }; }
      // timings, interleaved A/B so machine load hits both sides alike
      const ab = (fa, fb, n = 5) => { const d = []; for (let i = 0; i < n; i++) { const a = fa(), b = fb(); d.push(a - b); } return +med(d).toFixed(1); };
      const full = renderOnly();
      const timing = { renderFull: +full.toFixed(1) };
      if (!FAST) for (const [k, list] of Object.entries(comp)) if (list.length) timing[k] = ab(() => renderOnly(2), () => hide(list, () => renderOnly(2)));
      if (!FAST) { const gm = map.terrain.material, plain = new gm.constructor({ color: 0xdddddd }); plain.stencilWrite = gm.stencilWrite; plain.stencilRef = 0; plain.stencilFunc = gm.stencilFunc; plain.stencilZPass = gm.stencilZPass;
        renderOnly(1); timing.groundShaderExtra = ab(() => renderOnly(2), () => { map.terrain.material = plain; const x = renderOnly(2); map.terrain.material = gm; return x; }); plain.dispose(); }
      // tiny viewport: almost no pixels, so what remains is geometry + driver work
      { R.setSize(39, 84, false); timing.renderTiny = +renderOnly().toFixed(1); R.setSize(map.w, map.h); }
      // CPU per frame with the GPU taken out (render stubbed): controls, lift animation, labels
      { const d0 = map.drawOverlay.bind(map), a0 = map.animateLifts.bind(map); let ot = 0, at = 0; const fr = [], ov = [], an = [], sub = [];
        map.drawOverlay = () => { const q = performance.now(); d0(); ot = performance.now() - q; };
        map.animateLifts = (...a) => { const q = performance.now(); const x = a0(...a); at = performance.now() - q; return x; };
        let st = 0; R.render = (s, cm) => { const q = performance.now(); RENDER.call(R, s, cm); st = performance.now() - q; sync(); };
        for (let i = 0; i < 10; i++) { ot = at = st = 0; map.overlayDirty = true; map.drawnAt = 0; map.dt = 0.016; map.t += 0.016; map.liftAt = 0;
          const q = performance.now(); map.frame(); const f = performance.now() - q; if (i >= 2) { fr.push(f); ov.push(ot); an.push(at); sub.push(st); } }
        R.render = RENDER; delete map.drawOverlay; delete map.animateLifts;
        timing.overlayLabels = +med(ov).toFixed(2); timing.animateLifts = +med(an).toFixed(2); timing.renderSubmitJS = +med(sub).toFixed(2); }
      res.views[name] = { info, parts, timing };
    }
    // ---- live loop scheduling with drawing stubbed out: how often does an idle / touched map redraw?
    map.setPaused(false);
    const loopStats = async (busy, ms = 2500) => {
      let renders = 0, overlays = 0, frames = 0, ftime = 0;
      const d0 = map.drawOverlay.bind(map), f0 = map.frame.bind(map);
      R.render = () => { renders++; };
      map.drawOverlay = () => { overlays++; d0(); };
      map.frame = () => { frames++; const q = performance.now(); f0(); ftime += performance.now() - q; };
      const tEnd = performance.now() + ms; let rafs = 0;
      await new Promise((ok) => { const step = () => { rafs++; if (busy) { map.lastInput = performance.now(); const o = cam.position.clone().sub(c.target); o.applyAxisAngle(new V3(0, 1, 0), 0.004); cam.position.copy(c.target).add(o); } if (performance.now() < tEnd) requestAnimationFrame(step); else ok(); }; step(); });
      R.render = RENDER; delete map.drawOverlay; delete map.frame;
      const s = ms / 1000;
      return { rafPerS: +(rafs / s).toFixed(0), framesPerS: +(frames / s).toFixed(1), rendersPerS: +(renders / s).toFixed(1), overlaysPerS: +(overlays / s).toFixed(1), cpuMsPerFrame: +(ftime / Math.max(1, frames)).toFixed(2) };
    };
    res.loop = {};
    for (const vn of ['close', 'overview']) { setView(views[vn]); map.lastInput = 0; map.lastCameraMove = 0; await new Promise((ok) => setTimeout(ok, 1200)); res.loop[vn + 'Idle'] = await loopStats(false); res.loop[vn + 'Busy'] = await loopStats(true); }
    res.quality = map.q || 0; res.pr = R.getPixelRatio();
    return res;
  }, { id, FAST: !!process.env.FAST });
  r.openMs = openMs;
  results[id] = r;
  console.log(JSON.stringify(r));
  await context.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(results, null, 1));
