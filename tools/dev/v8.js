const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8799/';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const fails = [];
const check = (n, ok, x = '') => { console.log(ok ? 'PASS' : 'FAIL', n, x); if (!ok) fails.push(n); };
(async () => {
  const b = await chromium.launch({ proxy: URL.startsWith('https') ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('[pageerror]', e.message); fails.push('pageerror ' + e.message); });
  p.on('dialog', (d) => d.accept());
  const enter = async (id) => {
    await p.fill('#f-resort', '');
    await p.locator(`[data-act=pick-resort][data-id=${id}]`).scrollIntoViewIfNeeded();
    await p.click(`[data-act=pick-resort][data-id=${id}]`);
    await p.waitForSelector('#resort-card:not(.hidden) [data-act=ski-here]', { timeout: 120000 });
    await p.waitForFunction((i) => window.weski?.map && window.weski.place?.id === i, id, { timeout: 120000 });
    await p.click('[data-act=ski-here]');
    await p.waitForFunction(() => !document.body.classList.contains('flying'), null, { timeout: 240000 });
    await p.waitForTimeout(1500);
  };
  const leave = async () => {
    await p.click('#tabs [data-tab=more]'); await p.locator('[data-act=change-resort]').scrollIntoViewIfNeeded(); await p.click('[data-act=change-resort]');
    if (await p.locator('[data-act=exit-nosave]').count()) await p.click('[data-act=exit-nosave]');
    await p.waitForFunction(() => !document.body.classList.contains('flying') && !document.querySelector('#start-panel').classList.contains('hidden'), null, { timeout: 240000 });
  };
  await p.goto(URL);
  await p.waitForSelector('#start:not(.hidden) #globe canvas', { timeout: 60000 });
  await p.waitForTimeout(1500);
  const ids = await p.$$eval('.resort-row .tag.avail', (els) => els.map((e) => e.closest('[data-id]').dataset.id));
  for (const id of (ONLY || ids)) {
    await enter(id);
    const st = await p.evaluate(() => {
      const S = window.weski, m = S.map, out = { lifts: 0, noCarrier: [], low: [], worst: 99, ms: 0, carriers: 0 };
      const RED = { tram: 4, gondola: 4, chair: 4, surface: 2, carpet: 2.5 };
      for (const path of m.liftPaths) {
        out.lifts++;
        if (!path.tram && !path.rail && !path.chairs) out.noCarrier.push(path.l.name);
        out.carriers += path.chairs;
        if (path.rail) continue;
        let min = 99;
        for (let d = 0; d <= path.L; d += 3) {
          for (const side of [0, path.r, -path.r]) {
            const q = m.pathPoint(path, d, side).pos, c = q.y - m.groundY(q.x, q.z);
            if (c < min) min = c;
          }
        }
        if (min < 0.1) out.low.push(path.l.name + ' ' + min.toFixed(1));
        out.worst = Math.min(out.worst, min);
      }
      // every moving carrier is above the snow too
      const mat = new (m.carriers.chair.matrix.constructor)(); let under = 0;
      for (const path of m.liftPaths) for (let i = 0; i < path.chairs; i++) {
        m.carriers[path.carrier].getMatrixAt(path.first + i, mat);
        const e = mat.elements; if (e[13] < m.groundY(e[12], e[14]) + 0.2) under++;
      }
      out.under = under;
      m.liftsMoved = false;
      const t0 = performance.now(); for (let i = 0; i < 50; i++) { m.liftsMoved = false; m.animateLifts(i); } out.ms = (performance.now() - t0) / 50;
      return out;
    });
    check(`${id}: every lift has moving carriers`, st.noCarrier.length === 0, st.noCarrier.join(', '));
    check(`${id}: cables and red line stay above the ground`, st.low.length === 0 && st.under === 0, `worst ${st.worst.toFixed(1)} m; under ${st.under}; ${st.low.join(', ')}`);
    check(`${id}: moving all ${st.carriers} carriers is cheap`, st.ms < 4, st.ms.toFixed(2) + ' ms worst case');
    await p.screenshot({ path: `shots/v8-map-${id}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', id));
    if (id === 'les-contamines' && !ONLY) {
      // ---- ride a chairlift in test mode
      await p.click('#tabs [data-tab=more]'); await p.locator('#f-test').evaluate((e) => e.click()); await p.click('[data-act=close-sheet]');
      const lift = await p.evaluate(() => {
        const S = window.weski, l = S.resort.lifts.filter((x) => x.kind === 'chair').sort((a, c) => c.len - a.len)[0];
        S.loc.simTeleport(l.pts[0], l.pts[1]);
        return { name: l.name, id: l.id };
      });
      await p.waitForTimeout(1200);
      await p.evaluate((id) => { const S = window.weski, l = S.resort.lifts.find((x) => x.id === id); S.loc.simFollow(l.pts, 3); }, lift.id);
      await p.waitForFunction(() => window.weski.lift, null, { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(6000);
      const r = await p.evaluate(() => { const S = window.weski, m = S.map; m.focus(S.me.x, S.me.y, 260); return { lift: S.lift, pill: document.querySelector('#gps-pill').textContent, ride: !!m.meObj.userData.avatar?.userData.ride, y: m.meObj.position.y - m.groundY(m.meObj.position.x, m.meObj.position.z) }; });
      check(`rides ${lift.name}: noticed without stats or directions on`, r.lift?.id === lift.id && /On lift/.test(r.pill), JSON.stringify(r));
      check('the rider is shown seated in a chair up on the cable', r.ride && r.y > 1, JSON.stringify(r));
      await p.waitForTimeout(2500);
      const s1 = await p.evaluate(() => window.weski.map.meObj.scale.x);
      await p.screenshot({ path: 'shots/v8-ride-near.png' });
      await p.evaluate(() => { const S = window.weski; S.map.focus(S.me.x, S.me.y, 1500); });
      await p.waitForTimeout(2500);
      const s2 = await p.evaluate(() => window.weski.map.meObj.scale.x);
      await p.screenshot({ path: 'shots/v8-ride-mid.png' });
      await p.evaluate(() => { const S = window.weski; S.map.focus(S.me.x, S.me.y, 9000); });
      await p.waitForTimeout(2500);
      const s3 = await p.evaluate(() => window.weski.map.meObj.scale.x);
      check('the chair grows as you zoom out, up to a maximum', s2 > s1 && s3 >= s2 && s3 <= 25.01, [s1, s2, s3].map((v) => v.toFixed(1)).join(' < '));
      // directions while riding: start from the lift you are on
      await p.evaluate(() => {
        const S = window.weski, q = S.resort.pois[0]; S.pin = { x: q.x, y: q.y }; S.map.setPin(S.pin);
        document.querySelector('#sheet-body').innerHTML = '<button data-act="nav-pin">go</button>'; document.querySelector('#sheet').classList.remove('hidden');
      });
      await p.click('[data-act=nav-pin]');
      await p.waitForFunction(() => window.weski.nav?.route, null, { timeout: 20000 });
      const nav = await p.evaluate(() => { const S = window.weski, s = S.nav.route.steps[0]; return { kind: s.kind, name: s.name, n: S.nav.route.steps.length, lift: S.lift?.id }; });
      check('directions on a lift begin with finishing that lift ride', nav.kind === 'lift' && nav.name === lift.name, JSON.stringify(nav));
      await p.screenshot({ path: 'shots/v8-ride-nav.png' });
      // ride to the top: get off
      await p.evaluate((id) => { const S = window.weski, l = S.resort.lifts.find((x) => x.id === id); S.loc.simPath.speed = 60; }, lift.id);
      await p.waitForFunction(() => !window.weski.loc.simPath, null, { timeout: 60000 });
      await p.waitForTimeout(2500);
      const off = await p.evaluate(() => ({ lift: window.weski.lift, ride: !!window.weski.map.meObj.userData.avatar?.userData.ride, k: window.weski.nav?.route?.steps[0]?.kind }));
      check('at the top the rider is off the lift and back on the snow', !off.lift && !off.ride && off.k !== 'lift', JSON.stringify(off));
      // tracks card order
      await p.click('#tabs [data-tab=track]'); await p.waitForTimeout(500);
      const ord = await p.evaluate(() => {
        const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('#f-crumbs')); if (!c) return null;
        const y = (el) => el.getBoundingClientRect().top, notes = c.querySelectorAll('.note');
        return { sw: y(c.querySelector('#f-crumbs')), seg: y(c.querySelector('.seg')), note: y(notes[0]), text: notes[0].textContent.slice(0, 60) };
      });
      check('My tracks: switch, then selector, then the grey explanation', ord && ord.sw < ord.seg && ord.seg < ord.note && /This outing/.test(ord.text), JSON.stringify(ord));
      await p.locator('#f-crumbs').scrollIntoViewIfNeeded(); await p.screenshot({ path: 'shots/v8-tracks.png' });
      await p.click('[data-act=crumb-scope][data-v=all]'); await p.waitForTimeout(300);
      const t2 = await p.evaluate(() => [...document.querySelectorAll('.card')].find((x) => x.querySelector('#f-crumbs')).querySelector('.note').textContent.slice(0, 40));
      check('the explanation follows the selected option', /Everything saved/.test(t2), t2);
      await p.click('[data-act=close-sheet]').catch(() => {});
    }
    await leave();
  }
  console.log(fails.length ? `\n${fails.length} FAILED:\n` + fails.join('\n') : '\nALL PASSED');
  await b.close();
})();
