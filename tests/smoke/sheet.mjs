// Typing in a mountain's panels, in headless Chrome at iPhone size (run by `npm run smoke`, issue #113):
//  1. The search inside a mountain keeps one height while typing (it used to shrink as fewer results matched and drop
//     under the keyboard), and while a (simulated) keyboard is up the panel keeps its full size and place (the keyboard
//     covers its lower part; cutting it off let the mountain show through, owner 2026-11-24), with the field and the
//     results at its top, above the keyboard.
//  2. Every text field has a clear (X) button: shown only with text, it empties the field, keeps the focus and resets
//     the results. The browser's own clear button on search fields is hidden.
//  3. The same keyboard rule for the Forecast "add a mountain" search, and a non-list panel (Join with a code) keeps
//     its size and place with its field lifted above the keyboard.
// A real iPhone keyboard cannot be reproduced here: it is imitated by shrinking a stand-in for window.visualViewport,
// which is what the app listens to (the same stand-in as start.mjs).
// SHOT_DIR=<folder> keeps screenshots of the search with many results, with one, and fields showing the X.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';

const PORT = await new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = process.env.SHOT_DIR || 'smoke-output';
const KEEP_SHOTS = !!process.env.SHOT_DIR;
const KB = { height: 450, offsetTop: 0 };    // the part of an 844 px screen left visible by the keyboard
const problems = [];
const fail = (m) => problems.push(m);

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid); } catch { server.kill(); } };
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(ORIGIN)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview did not start');
}

let browser;
let page;
// with the imitated keyboard up, a grey block is drawn where a real keyboard would be, for the picture only
const shot = async (name) => {
  if (!KEEP_SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.evaluate(() => {
    if (!window.__kb) return;
    const d = document.createElement('div'); d.id = '__kbpic';
    d.style.cssText = `position:fixed;left:0;right:0;top:${window.__kb.offsetTop + window.__kb.height}px;bottom:0;z-index:99999;background:#3a3f47;color:#cfd4da;font:600 15px system-ui;display:grid;place-items:center`;
    d.textContent = 'imitated keyboard'; document.body.appendChild(d);
  });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  await page.evaluate(() => document.querySelector('#__kbpic')?.remove());
};
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  // sign-in switched on, so the pass panel shows its email field
  await context.route('**/api/config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ paywall: false, signIn: true, paddle: null, plans: {} }) }));
  await context.addInitScript(() => {
    localStorage.setItem('weski:installSeen', 'true');
    localStorage.setItem('weski:consent', JSON.stringify({ v: '2026-11-23', at: Date.now() }));
    localStorage.setItem('weski:trackNoteOff', 'true');
    const real = window.visualViewport;
    const fake = new EventTarget();
    window.__kb = null;
    for (const k of ['width', 'height', 'offsetTop', 'offsetLeft', 'pageTop', 'pageLeft', 'scale']) {
      Object.defineProperty(fake, k, { get: () => (window.__kb && k in window.__kb ? window.__kb[k] : real ? real[k] : (k === 'scale' ? 1 : 0)) });
    }
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__kbSet = (kb) => { window.__kb = kb; fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll')); };
  });
  page = await context.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.addLocatorHandler(page.locator('#modal:not(.hidden) .modal-box [data-act="modal-cancel"]').first(), async () => {
    await page.locator('#modal:not(.hidden) [data-act="modal-cancel"]').first().click();
  });
  await page.goto(ORIGIN);
  await page.locator('[data-act="pick-resort"][data-id="jay-peak"]').waitFor({ state: 'visible', timeout: 30000 });

  // the start screen's search has its X too, and no second one from the browser
  await page.locator('#f-resort').fill('jay');
  if (!(await page.locator('#start-panel .clr.has-val .clr-x').isVisible())) fail('start screen search shows no clear (X) button with text in it');
  // (Chrome does not report styles of that inner part, so look for the rule that hides it)
  const native = await page.evaluate(() => [...document.styleSheets].some((sh) => { try { return [...sh.cssRules].some((r) => /search-cancel-button/.test(r.selectorText || '') && r.style.display === 'none'); } catch { return false; } }));
  if (!native) fail("no style hides the browser's own clear button on search fields");
  await page.locator('#start-panel .clr-x').tap();
  if (await page.inputValue('#f-resort') !== '') fail('X did not empty the start screen search');
  await page.evaluate(() => document.activeElement?.blur());

  await page.evaluate(() => document.querySelector('[data-act="pick-resort"][data-id="jay-peak"]').click());
  await page.locator('[data-act="ski-here"][data-id="jay-peak"]').click({ timeout: 15000 });
  await page.locator('#start').waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('#searchbtn').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);

  const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; }, sel);
  const rows = () => page.locator('#search-list .srow').count();

  // ---- 1. in-map search
  await page.locator('#searchbtn').click();
  await page.locator('#sheet:not(.hidden) #f-search').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => document.activeElement?.id === 'f-search', null, { timeout: 5000 }).catch(() => fail('search field not focused when the search opened'));
  await page.waitForTimeout(400);
  const open = await rect('#sheet');
  // without the keyboard: as tall as a panel can be, and the same height with one result
  await page.locator('#f-search').fill('zzzz-nothing');
  await page.waitForTimeout(100);
  const empty = await rect('#sheet');
  if (Math.abs(empty.height - open.height) > 1) fail(`search panel changed height with no results (${open.height} -> ${empty.height})`);
  await page.locator('#f-search').fill('');

  await page.evaluate((kb) => window.__kbSet(kb), KB);
  await page.waitForTimeout(150);
  const pinned = await rect('#sheet');
  if (Math.abs(pinned.top - open.top) > 1 || Math.abs(pinned.bottom - open.bottom) > 1) fail(`with the keyboard up the search panel was cut or moved (${open.top}-${open.bottom} -> ${pinned.top}-${pinned.bottom}); it should keep its size and place`);
  const f = await rect('#f-search');
  if (f.top < 0 || f.bottom > KB.height) fail(`with the keyboard up the search field is not visible (top ${f.top}, bottom ${f.bottom})`);
  await page.locator('#f-search').pressSequentially('a', { delay: 20 });
  await page.waitForTimeout(150);
  const many = await rows();
  const withMany = await rect('#sheet');
  await shot('search-many');
  // a name that matches exactly one entry
  const one = await page.evaluate(() => {
    const names = [...document.querySelectorAll('#search-list .srow b')].map((b) => b.textContent.toLowerCase());
    return names.find((n) => names.filter((m) => m.includes(n)).length === 1);
  });
  await page.locator('#f-search').fill(one || 'jay');
  await page.waitForTimeout(150);
  const few = await rows();
  const withOne = await rect('#sheet');
  if (few >= many || few < 1) fail(`could not narrow the search to a few results (${many} -> ${few})`);
  if (Math.abs(withOne.height - withMany.height) > 1 || Math.abs(withOne.top - withMany.top) > 1) fail(`search panel moved or shrank as results got fewer (top ${withMany.top} -> ${withOne.top}, height ${withMany.height} -> ${withOne.height})`);
  const first = await rect('#search-list .srow');
  if (!first || first.bottom > KB.height) fail(`the remaining result is hidden under the keyboard (bottom ${first?.bottom}, keyboard from ${KB.height})`);
  const f3 = await rect('#f-search');
  if (first && first.top - f3.bottom > 40) fail(`the result is not at the top of the panel (${first.top - f3.bottom} px below the field)`);
  await shot('search-one');

  // ---- 2. the X
  const x = page.locator('#sheet .clr.has-val .clr-x');
  if (!(await x.isVisible())) fail('in-map search shows no clear (X) button with text in it');
  const xr = await x.boundingBox();
  if (xr && (xr.width < 44 || xr.height < 44)) fail(`X button smaller than 44 px (${xr.width}x${xr.height})`);
  const ir = await page.evaluate(() => { const i = document.querySelector('#f-search'); return { pr: parseFloat(getComputedStyle(i).paddingRight), right: i.getBoundingClientRect().right }; });
  await shot('field-x-search');
  await x.tap();
  await page.waitForTimeout(100);
  if (await page.inputValue('#f-search') !== '') fail('X did not empty the in-map search');
  if (await page.evaluate(() => document.activeElement?.id) !== 'f-search') fail('X took the focus away from the search (the keyboard would close)');
  if ((await rows()) < many) fail(`results did not reset after X (${await rows()}, before ${many})`);
  if (await page.locator('#sheet .clr.has-val').count()) fail('X still shown with the field empty');
  if (ir.pr < 30) fail(`search text can run under the X (right padding ${ir.pr} px)`);
  await page.evaluate(() => { document.activeElement?.blur(); window.__kbSet(null); });
  await page.waitForTimeout(100);
  if (await page.locator('#sheet.kb').count()) fail('panel stayed pinned after the keyboard closed');
  await page.locator('#sheet [data-act="close-sheet"]').click();

  // ---- 3a. Forecast "add a mountain"
  await page.locator('#tabs [data-act="tab"][data-tab="forecast"]').click();
  await page.locator('#sheet [data-act="fc-add"]').first().click({ timeout: 30000 });
  await page.locator('#fc-q').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#fc-q').focus();
  await page.evaluate((kb) => window.__kbSet(kb), KB);
  await page.locator('#fc-q').fill('mount');
  await page.waitForTimeout(300);
  const fa = await rect('#sheet');
  await page.locator('#fc-q').fill('jay peak');
  await page.waitForTimeout(300);
  const fb = await rect('#sheet');
  if (Math.abs(fa.height - fb.height) > 1 || Math.abs(fa.top - fb.top) > 1) fail(`Forecast add search did not keep its height (${fa.top}-${fa.bottom} -> ${fb.top}-${fb.bottom})`);
  if (fa.bottom < KB.height + 100) fail(`Forecast add search was cut off at the keyboard (bottom ${fa.bottom}, keyboard from ${KB.height})`);
  const fq = await rect('#fc-q');
  if (fq.top < 0 || fq.bottom > KB.height) fail(`Forecast search field hidden by the keyboard (top ${fq.top}, bottom ${fq.bottom})`);
  if (!(await page.locator('#sheet .clr.has-val .clr-x').isVisible())) fail('Forecast search shows no X');
  await page.evaluate(() => { document.activeElement?.blur(); window.__kbSet(null); });
  await page.locator('#sheet [data-act="close-sheet"]').click();

  // ---- 3b. a panel without a list: Join with a code sits on top of the keyboard
  await page.locator('#tabs [data-act="tab"][data-tab="group"]').click();
  await page.locator('#f-code').waitFor({ state: 'visible', timeout: 10000 });
  const g0 = await rect('#sheet');
  await page.locator('#f-code').focus();
  await page.evaluate((kb) => window.__kbSet(kb), KB);
  await page.locator('#f-code').fill('ABC');
  await page.waitForTimeout(200);
  const g = await rect('#sheet'), gf = await rect('#f-code');
  if (Math.abs(g.bottom - g0.bottom) > 1 || Math.abs(g.top - g0.top) > 1) fail(`group panel was cut or moved by the keyboard (${g0.top}-${g0.bottom} -> ${g.top}-${g.bottom})`);
  if (gf.top < g.top || gf.bottom > KB.height) fail(`group code field hidden by the keyboard (top ${gf.top}, bottom ${gf.bottom}, keyboard from ${KB.height})`);
  await shot('group-keyboard');
  if (!(await page.locator('#sheet .clr.has-val .clr-x').first().isVisible())) fail('group code field shows no X');
  await page.evaluate(() => window.__kbSet(null));
  await page.waitForTimeout(150);
  await shot('field-x-group');

  // ---- 4. every other panel with a text field keeps its size and place, with the field above the keyboard
  const keeps = async (label, field) => {
    await page.locator(field).waitFor({ state: 'visible', timeout: 15000 });
    const s0 = await rect('#sheet');
    // a real tap, as on the phone: the app focuses the field itself without letting the page scroll (the "jolt")
    await page.evaluate(() => {
      window.__tapNoScroll = null;
      document.addEventListener('touchend', (e) => { window.__tapNoScroll = e.defaultPrevented; }, { once: true });
    });
    await page.locator(field).tap();
    if (await page.evaluate((sel) => document.activeElement !== document.querySelector(sel), field)) fail(`${label}: tapping the field did not focus it (no keyboard would come up)`);
    if (await page.evaluate(() => window.__tapNoScroll) !== true) fail(`${label}: the tap was left to the phone, which scrolls the page to the field (the jolt)`);
    await page.evaluate((kb) => window.__kbSet(kb), KB);
    await page.waitForTimeout(200);
    const s1 = await rect('#sheet'), f1 = await rect(field);
    if (Math.abs(s1.top - s0.top) > 1 || Math.abs(s1.bottom - s0.bottom) > 1) fail(`${label}: the panel was cut or moved by the keyboard (${s0.top}-${s0.bottom} -> ${s1.top}-${s1.bottom})`);
    if (f1.top < Math.max(0, s1.top) || f1.bottom > KB.height) fail(`${label}: the field is hidden by the keyboard (top ${f1.top}, bottom ${f1.bottom}, keyboard from ${KB.height})`);
    await shot(`keyboard-${label.replace(/[^a-z]+/gi, '-').toLowerCase()}`);
    await page.evaluate(() => { document.activeElement?.blur(); window.__kbSet(null); });
    await page.waitForTimeout(150);
  };
  await keeps('Group display name', '#f-name');
  await page.locator('#tabs [data-act="tab"][data-tab="more"]').click();
  await page.locator('#sheet [data-act="open-sheet"][data-s="pass"]').click();
  await keeps('Sign-in email', '#f-email');
  await page.locator('#sheet [data-act="close-sheet"]').click();

  // ---- 5. Report a map mistake: a wrong rating needs "It should be:" (#112), and the report names the run
  const sentReports = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/reports') && r.method() === 'POST') sentReports.push(JSON.parse(r.postData() || '{}')); });
  await page.locator('#searchbtn').click();
  await page.locator('#f-search').fill('a');
  await page.locator('#search-list .srow[data-k="trail"]').first().click();
  await page.locator('#sheet [data-act="report-open"]').click({ timeout: 10000 });
  await page.locator('#sheet [data-act="report-kind"][data-v="wrong_rating"]').click();
  const choices = await page.locator('#report-should button').allTextContents();
  if (!(await page.locator('#sheet label', { hasText: 'It should be:' }).count())) fail('Wrong rating shows no "It should be:" label');
  if (choices.length !== 4 || !/Green/.test(choices[0]) || !/Double black/.test(choices[3])) fail(`Wrong rating "It should be" choices are not green to double black: ${JSON.stringify(choices)}`);
  await page.locator('#f-report').fill('the sign at the top says black');
  await page.locator('#sheet [data-act="report-send"]').click();
  await page.waitForTimeout(300);
  if (sentReports.length) fail('a wrong-rating report was sent without saying what the rating should be');
  await page.locator('#report-should [data-v="2"]').click();
  if (await page.inputValue('#f-report') !== 'the sign at the top says black') fail('choosing a rating lost the typed note');
  await page.locator('#sheet [data-act="report-send"]').click();
  await page.waitForTimeout(500);
  const sentReport = sentReports[0];
  if (!sentReport) fail('the report was not sent after choosing a rating');
  else if (sentReport.kind !== 'wrong_rating' || sentReport.should !== 2 || sentReport.scale !== 'us' || !sentReport.name || !/^(\d{6,}|)$/.test(sentReport.ref)) fail(`report body is wrong: ${JSON.stringify({ ...sentReport, dev: undefined })}`);
  else console.log(`Report sheet: "${sentReport.name}" (ref ${sentReport.ref || 'none'}) should be ${choices[2].trim()}.`);
  if (await page.locator('#sheet:not(.hidden)').count()) await page.locator('#sheet [data-act="close-sheet"]').click();
  // the same panels opened over the start screen
  await page.goto(ORIGIN);
  await page.locator('[data-act="start-forecast"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-act="start-forecast"]').click();
  await page.locator('#sheet [data-act="fc-add"]').first().click({ timeout: 30000 });
  await keeps('Start screen Forecast add a mountain', '#fc-q');
  console.log(`In-map search: ${many} results for "a", ${few} for "${one}"; panel ${withMany.top}-${withMany.bottom} both times.`);
} catch (e) {
  fail(`panel typing test stopped: ${e.message}`);
}

if (problems.length && page) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/sheet-failure.png` }).catch(() => {});
}
await browser?.close();
stop();

if (problems.length) {
  console.error('Panel typing test FAILED:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Panel typing test passed: search keeps its height above the keyboard, X clears and keeps focus.');
process.exit(0);
