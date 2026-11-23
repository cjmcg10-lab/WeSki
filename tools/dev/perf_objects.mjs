// Lists the scene's biggest objects by triangles: node objs.mjs <origin> <id> [perf]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [origin, id, perf] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await context.addInitScript(() => { localStorage.setItem('weski:installSeen', 'true'); });
await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
const page = await context.newPage();
await page.addLocatorHandler(page.locator('#modal:not(.hidden) .modal-box'), async () => { await page.locator('#modal:not(.hidden) [data-act="modal-cancel"]').first().click(); });
await page.goto(`${origin}/?skip=${id}${perf ? '&perf=' + perf : ''}`);
try { await page.locator('#f-consent').check({ timeout: 8000 }); await page.locator('#consent-ok').click(); } catch { /* none */ }
await page.waitForFunction(() => window.skiwithme?.map?.terrain, null, { timeout: 180000 });
const rows = await page.evaluate(() => {
  const map = window.skiwithme.map; map.setPaused(true);
  const out = [];
  map.scene.traverse((o) => {
    if (!o.geometry || !o.visible) return;
    const g = o.geometry;
    let tris = g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3, n = 1, what = o.type;
    if (o.isLineSegments2) { n = g.instanceCount; tris = 6; what = `line w${o.material.linewidth} ${o.material.stencilFunc === 514 ? 'xray' : ''} ${o.material.dashed ? 'dash' : ''} #${o.material.color.getHexString()}`; }
    else if (o.isInstancedMesh) { n = o.count; what = `instanced`; }
    out.push({ what, tris: Math.round(tris * n), per: Math.round(tris), n, verts: g.attributes.position?.count });
  });
  return out.sort((a, b) => b.tris - a.tris);
});
const sum = rows.reduce((a, r) => a + r.tris, 0);
console.log(id, 'total tris', sum, 'objects', rows.length);
for (const r of rows.slice(0, 25)) console.log(String(r.tris).padStart(8), r.what, 'per', r.per, 'x', r.n, 'verts', r.verts);
await browser.close();
