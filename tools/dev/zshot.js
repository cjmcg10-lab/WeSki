const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(URL);
  await p.waitForSelector('#start:not(.hidden) #globe canvas', { timeout: 60000 });
  await p.waitForTimeout(1500);
  for (const [id, trail, dist] of JSON.parse(process.env.SHOTS)) {
    await p.fill('#f-resort', '');
    await p.locator(`[data-act=pick-resort][data-id=${id}]`).scrollIntoViewIfNeeded();
    await p.click(`[data-act=pick-resort][data-id=${id}]`);
    await p.waitForSelector('#resort-card:not(.hidden) [data-act=ski-here]', { timeout: 120000 });
    await p.waitForFunction((i) => window.weski?.map && window.weski.place?.id === i, id, { timeout: 120000 });
    await p.click('[data-act=ski-here]');
    await p.waitForFunction(() => !document.body.classList.contains('flying'), null, { timeout: 240000 });
    const info = await p.evaluate(([trail, dist]) => {
      const S = window.weski, R = S.resort;
      const t = R.trails.filter((t) => t.name === trail).sort((a, b) => b.len - a.len)[0] || R.parks.find((q) => q.name === trail) || (R.zones || []).find((q) => q.name === trail);
      const i = Math.floor(t.pts.length / 4) * 2;
      S.map.focus(t.pts[i], t.pts[i + 1], dist);
      return { z: t.z || t.kind || 'park', zones: (R.zones || []).length, parks: R.parks.length, labels: S.map.parkLabels.length };
    }, [trail, dist]);
    console.log(id, JSON.stringify(info));
    await p.waitForTimeout(6000);
    await p.screenshot({ path: `shots/z-${id}.png`, timeout: 120000 });
    await p.click('#tabs [data-tab=more]'); await p.locator('.btn[data-act=legend]').scrollIntoViewIfNeeded(); await p.click('.btn[data-act=legend]');
    await p.waitForTimeout(800);
    const card = p.locator('.card', { hasText: process.env.CARD || 'Zones (painted' });
    await card.scrollIntoViewIfNeeded(); console.log((await card.innerText()).slice(0, 900));
    await p.screenshot({ path: `shots/z-${id}-legend.png`, timeout: 120000 });
    await p.click('#tabs [data-tab=more]').catch(() => {});
    await p.locator('[data-act=change-resort]').scrollIntoViewIfNeeded(); await p.click('[data-act=change-resort]');
    if (await p.locator('[data-act=exit-nosave]').count()) await p.click('[data-act=exit-nosave]');
    await p.waitForFunction(() => !document.body.classList.contains('flying') && !document.querySelector('#start-panel').classList.contains('hidden'), null, { timeout: 240000 });
  }
  await b.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
