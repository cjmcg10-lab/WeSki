// Screenshots of a resort at the bench views for each prototype switch set: node shots.mjs <origin> <id> <outdir> perf1 perf2 ...
// (use "base" for no switches)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [origin, id, dir, ...variants] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const v of variants) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await context.addInitScript(() => { localStorage.setItem('weski:installSeen', 'true'); });
  await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const page = await context.newPage();
  await page.addLocatorHandler(page.locator('#modal:not(.hidden) .modal-box'), async () => { await page.locator('#modal:not(.hidden) [data-act="modal-cancel"]').first().click(); });
  await page.goto(`${origin}/?skip=${id}${v === 'base' ? '' : '&perf=' + v}`);
  try { await page.locator('#f-consent').check({ timeout: 8000 }); await page.locator('#consent-ok').click(); } catch { /* none */ }
  await page.waitForFunction(() => window.skiwithme?.map?.terrain, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  for (const name of ['overview', 'mid', 'close']) {
    await page.evaluate((name) => {
      const map = window.skiwithme.map, c = map.controls, cam = map.cam3;
      map.setPaused(true);
      if (!map._home) map._home = { p: cam.position.clone(), t: c.target.clone() };
      const lp = [...map.liftPaths].sort((a, b) => b.L - a.L)[0];
      const V = { mid: { t: { x: 0, z: 0 }, d: 3500, polar: 55, az: 200 }, close: { t: { x: lp.pts[0].x, z: lp.pts[0].z }, d: 700, polar: 70, az: 200 } }[name];
      if (!V) { cam.position.copy(map._home.p); c.target.copy(map._home.t); }
      else {
        c.target.set(V.t.x, map.groundY(V.t.x, V.t.z), V.t.z);
        const ph = V.polar * Math.PI / 180, az = V.az * Math.PI / 180;
        cam.position.set(c.target.x + V.d * Math.sin(ph) * Math.sin(az), c.target.y + V.d * Math.cos(ph), c.target.z + V.d * Math.sin(ph) * Math.cos(az));
      }
      map.overlayDirty = true; map.drawnAt = 0; map.frame(); map.frame();
    }, name);
    await page.locator('#map').screenshot({ path: `${dir}/${id}-${name}-${v.replace(/,/g, '+')}.png` });
  }
  await context.close();
}
await browser.close();
