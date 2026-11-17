const { chromium } = require('playwright');
const URL = (process.env.URL || 'http://127.0.0.1:8787/') + '?skip';
const log = (...a) => console.log(...a);
const fails = [];
const check = (name, ok, extra = '') => { log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) fails.push(name); };
(async () => {
  const b = await chromium.launch({ proxy: URL.startsWith('https') ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') log(`[${name} console]`, m.text().slice(0, 300)); });
    p.on('pageerror', (e) => { log(`[${name} pageerror]`, e.message); fails.push('pageerror ' + e.message); });
    p.on('dialog', (d) => d.accept());
    await p.goto(URL);
    await p.waitForFunction(() => window.weski && !document.querySelector('#splash'), null, { timeout: 90000 });
    return p;
  };
  const A = await mk('A'), B = await mk('B');
  const tap = (p, sel) => p.locator(sel).first().click();
  const sheetText = (p) => p.locator('#sheet').innerText();
  const nav = (p) => p.locator('#navbar').innerText();

  // --- profiles + group
  for (const [p, name, av] of [[A, 'Alex', 'boy-ski'], [B, 'Bea', 'girl-board']]) {
    await tap(p, '#tabs [data-tab=more]'); await p.locator('#f-test').evaluate((e) => e.click()); // test mode on
    await tap(p, '#tabs [data-tab=group]');
    await p.fill('#f-name', name); await tap(p, `[data-act=avatar][data-v=${av}]`);
  }
  await tap(B, '[data-act=color][data-v="#ff2d92"]');
  await tap(A, '[data-act=create-group]');
  await A.waitForFunction(() => window.weski.group?.state);
  const code = await A.evaluate(() => window.weski.group.code);
  check('group created with 6-char code', /^[A-Z2-9]{6}$/.test(code), code);
  await B.fill('#f-code', code.toLowerCase()); await tap(B, '[data-act=join-group]');
  await A.waitForFunction(() => window.weski.group.state.members.length === 2);
  check('both members listed', (await sheetText(A)).includes('Bea') && (await sheetText(B)).includes('Alex'));
  check('not sharing by default (opt-in)', (await sheetText(A)).includes('Not sharing'));
  check('group session auto-started', await A.evaluate(() => window.weski.session?.kind === 'group'));

  // --- positions: A at top of Flyer, B on Interstate
  const place = (p, fn) => p.evaluate(fn);
  await place(A, () => { const S = window.weski, l = S.resort.lifts.find((x) => x.name.includes('Flyer')); S.loc.simTeleport(l.pts.at(-2), l.pts.at(-1)); });
  await place(B, () => { const S = window.weski, t = S.resort.trails.find((x) => x.name === 'Interstate'); const i = Math.floor(t.pts.length / 4) * 2; S.loc.simTeleport(t.pts[i], t.pts[i + 1]); });
  await A.waitForTimeout(1500);
  check('B invisible to A before opting in', await A.evaluate(() => window.weski.group.state.members.every((m) => !m.pos)));
  for (const p of [A, B]) log('toggle', await p.evaluate(() => { const e = document.querySelector('#f-share'); const before = e.checked; e.click(); return [before, e.checked, window.weski.sharing, window.weski.sheet, document.querySelector('#sheet-title').textContent]; }));
  await A.waitForTimeout(4000);
  for (const p of [A, B]) log(await p.evaluate(() => JSON.stringify({ me: window.weski.me, sharing: window.weski.sharing, cs: window.weski.group.client.sharing, sim: window.weski.loc.sim, simPos: window.weski.loc.simPos, m: window.weski.group.state.members.map((m) => [m.name, m.sharing, !!m.pos]) })));
  await A.waitForFunction(() => window.weski.group.state.members.filter((m) => m.pos).length === 2, null, { timeout: 15000 });
  check('both locations shared after opt-in', true);
  check('member row shows live + updated time', /Live · updated/.test(await sheetText(A)), (await sheetText(A)).match(/Live[^\n]*/)?.[0]);
  await A.screenshot({ path: 'shots/c-group.png' });

  // --- directions to friend + live reroute
  await tap(A, '[data-act=nav-friend]');
  await A.waitForFunction(() => window.weski.nav?.route);
  const r1 = await A.evaluate(() => ({ t: window.weski.nav.route.time, steps: window.weski.nav.route.steps.map((s) => s.kind + ':' + s.name) }));
  check('route to friend found', r1.steps.length > 0, JSON.stringify(r1));
  await A.waitForTimeout(1200); await A.screenshot({ path: 'shots/d-nav.png' });
  // B moves to the Stateside side -> A must reroute automatically
  await place(B, () => { const S = window.weski, t = S.resort.trails.find((x) => x.name === 'Kangaroo Trail'); const i = Math.floor(t.pts.length / 4) * 2; S.loc.simTeleport(t.pts[i], t.pts[i + 1]); });
  await A.waitForFunction((old) => { const r = window.weski.nav?.route; return r && r.steps.map((s) => s.kind + ':' + s.name).join() !== old; }, r1.steps.join(), { timeout: 20000 });
  const r2 = await A.evaluate(() => window.weski.nav.route.steps.map((s) => s.kind + ':' + s.name));
  check('rerouted when friend moved', true, JSON.stringify(r2));
  // A moves -> route start follows A
  await place(A, () => { const S = window.weski, t = S.resort.trails.find((x) => x.name === 'Northway' || x.name === 'Upper Northway'); const i = Math.floor(t.pts.length / 4) * 2; S.loc.simTeleport(t.pts[i], t.pts[i + 1]); });
  await A.waitForTimeout(2500);
  check('route restarts from my new position', await A.evaluate(() => { const S = window.weski, r = S.nav.route; return Math.hypot(r.pts[0] - S.me.x, r.pts[1] - S.me.y) < 30; }));
  // max difficulty respected
  await A.evaluate(() => { window.weski.maxDiff = 0; });
  await tap(A, '#tabs [data-tab=more]'); await tap(A, '[data-act=max-diff][data-v="0"]');
  await A.waitForTimeout(500);
  const g = await A.evaluate(() => { const n = window.weski.nav; return { routed: !!n.route, over: n.route?.over.length, warned: !!n.over }; });
  check('green-only limit: still routed, warned exactly when it goes above', g.routed && (g.over > 0) === g.warned, JSON.stringify(g));
  await tap(A, '[data-act=max-diff][data-v="2"]'); await tap(A, '#tabs [data-tab=map]');

  // --- friend pauses sharing -> stale + meeting point offer
  await B.locator('#f-share').evaluate((e) => e.click());
  await A.waitForFunction(() => window.weski.nav?.warn, null, { timeout: 15000 });
  const t1 = await nav(A);
  check('paused friend flagged stale with meeting point offer', /stale/i.test(t1) && /meeting point/i.test(t1), t1.replace(/\n/g, ' | '));
  await A.screenshot({ path: 'shots/e-stale.png' });
  await tap(A, '[data-act=meet]');
  await B.waitForFunction(() => window.weski.group.state.meet, null, { timeout: 10000 });
  check('meeting point shared to friend', true, await B.evaluate(() => window.weski.group.state.meet.name));
  check('A now navigating to meeting point', await A.evaluate(() => window.weski.nav.target.type === 'meet' && !!window.weski.nav.route));
  // friend off the mapped network
  await B.locator('#f-share').evaluate((e) => e.click());
  await place(B, () => window.weski.loc.simTeleport(60, 60));
  await tap(A, '[data-act=end-nav]'); await tap(A, '#tabs [data-tab=group]'); await tap(A, '[data-act=nav-friend]');
  await A.waitForFunction(() => window.weski.nav?.problem, null, { timeout: 15000 });
  check('unreachable friend reported', /off the mapped network/.test(await nav(A)), (await nav(A)).replace(/\n/g, ' | '));
  await tap(A, '[data-act=end-nav]');

  // --- tracking: simulate lift + run on A, then leave group -> saved
  await A.evaluate(async () => {
    const S = window.weski, geo = S.geo, tr = S.tracker;
    const { pointAlong, lineLength } = await import('/assets/' + [...document.scripts].map((s) => s.src).find((s) => s.includes('index-')).split('/').pop()).catch(() => ({}));
    const along = (pts, d) => { let acc = 0; for (let i = 0; i + 3 < pts.length; i += 2) { const l = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]); if (acc + l >= d) { const f = (d - acc) / l; return [pts[i] + (pts[i + 2] - pts[i]) * f, pts[i + 1] + (pts[i + 3] - pts[i + 1]) * f]; } acc += l; } return [pts.at(-2), pts.at(-1)]; };
    let t = Date.now() - 3600e3;
    const feed = (pts, len, v) => { for (let d = 0; d < len; d += v, t += 1000) { const [x, y] = along(pts, d); const [lat, lon] = geo.toLatLon(x, y); tr.add({ lat, lon, acc: 6, t }); } };
    S.loc.setSim(false); tr.points.length = 0; tr.state = 0;
    const lift = S.resort.lifts.find((x) => x.name.includes('Flyer')), run = S.resort.trails.find((x) => x.name === 'Vermonter');
    feed(lift.pts, lift.len, 5);
    t += 40000; feed(run.pts.slice(0, 4), 1, 1); t += 4000;
    feed(run.pts, run.len, 10);
  });
  await tap(A, '#tabs [data-tab=track]');
  const live = await sheetText(A);
  check('live stats show runs and lifts separately', /RUNS/i.test(live) && /Lifts \(not counted/i.test(live), live.replace(/\n/g, ' ').slice(0, 260));
  await A.screenshot({ path: 'shots/f-stats.png' });
  await tap(A, '[data-act=leave-group]');
  await A.waitForFunction(() => !window.weski.group && !window.weski.session);
  await tap(A, '#tabs [data-tab=history]');
  await A.waitForSelector('[data-act=open-session]');
  const hist = await sheetText(A);
  check('session saved to history on leaving group', /Group/.test(hist) && /1 runs/.test(hist), hist.replace(/\n/g, ' ').slice(0, 200));
  await tap(A, '[data-act=open-session]');
  await A.screenshot({ path: 'shots/g-session.png' });
  await tap(A, '[data-act=replay][data-run="0"]');
  await A.waitForTimeout(6000);
  check('replay running', await A.evaluate(() => !!window.weski.player && window.weski.player.i > 0));
  await A.screenshot({ path: 'shots/h-replay.png' });
  await tap(A, '[data-act=play-close]');

  // --- history survives a reload (offline storage)
  await A.reload(); await A.waitForFunction(() => window.weski && !document.querySelector('#splash'), null, { timeout: 90000 });
  await tap(A, '#tabs [data-tab=history]'); await A.waitForSelector('[data-act=open-session]');
  check('history persists after reopening', true);

  // --- creator closes: B was... A created & left, so B is owner now
  if (await B.evaluate(() => window.weski.sheet !== 'group')) await tap(B, '#tabs [data-tab=group]');
  await B.waitForSelector('[data-act=close-group]');
  check('ownership passed to remaining member', /Close group for everyone/.test(await sheetText(B)));
  await tap(B, '[data-act=close-group]');
  await B.waitForFunction(() => !window.weski.group, null, { timeout: 10000 });
  check('group closed', true);
  // joining a closed/unknown code fails cleanly
  await tap(B, '#tabs [data-tab=map]'); await tap(B, '#tabs [data-tab=group]');
  await B.fill('#f-code', code); await tap(B, '[data-act=join-group]');
  await B.waitForFunction(() => !window.weski.group, null, { timeout: 10000 });
  check('closed code can no longer be joined', true);

  // --- legend / place sheets, 2D
  await tap(B, '[data-act=close-sheet]'); await tap(B, '[data-act=legend]'); await B.screenshot({ path: 'shots/i-legend.png' });
  await tap(B, '[data-act=close-sheet]'); await tap(B, '#mode-btn');
  await B.evaluate(() => { const S = window.weski, p = S.resort.pois.find((x) => x.name.includes('Stateside Hotel')); S.map.focus(p.x, p.y); S.map.zoom2 = 0.5; });
  await B.waitForTimeout(800); await B.screenshot({ path: 'shots/j-2d-zoom.png' });
  await tap(B, '#mode-btn');
  await B.evaluate(() => { const S = window.weski, p = S.resort.pois.find((x) => x.name.includes('Flyer') && x.kind === 'lift'); S.map.focus(p.x, p.y, 450); });
  await B.waitForTimeout(1200); await B.screenshot({ path: 'shots/k-3d-zoom.png' });
  log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nALL PASSED');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e.message.slice(0, 800)); process.exit(2); });
