// Start screen checks in headless Chrome at iPhone size (run by `npm run smoke` after smoke.mjs):
//  1. Tapping the search field pulls the mountain list up to the top of the screen in one step, never past it, and
//     while a (simulated) keyboard covers the bottom of the screen the list stays inside the part still visible.
//     A real iPhone keyboard cannot be reproduced here: the keyboard is imitated by shrinking a stand-in for
//     window.visualViewport, which is what the app listens to.
//  2. Picking a mountain does not build its 3D map while the globe is still turning toward it (that froze the turn),
//     and Ski Here still opens the mountain.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';

// any free port (4173 is smoke.mjs's, and another checkout on the same machine may be using a fixed one)
const PORT = await new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = 'smoke-output';
const problems = [];
const fail = (m) => problems.push(m);

// its own process group, so stopping it also stops the vite process npx starts (or it keeps the port)
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
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.addInitScript(() => {
    localStorage.setItem('weski:installSeen', 'true');
    localStorage.setItem('weski:consent', JSON.stringify({ v: '2026-11-23', at: Date.now() }));
    // A stand-in for window.visualViewport whose size the test can change, to imitate the on-screen keyboard.
    const real = window.visualViewport;
    const fake = new EventTarget();
    window.__kb = null;   // { height, offsetTop } while the imitated keyboard is up
    for (const k of ['width', 'height', 'offsetTop', 'offsetLeft', 'pageTop', 'pageLeft', 'scale']) {
      Object.defineProperty(fake, k, { get: () => (window.__kb && k in window.__kb ? window.__kb[k] : real ? real[k] : (k === 'scale' ? 1 : 0)) });
    }
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__kbSet = (kb) => { window.__kb = kb; fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll')); };
  });
  page = await context.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.goto(ORIGIN);
  await page.locator('#start-panel').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-act="pick-resort"][data-id="jay-peak"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(800);

  // ---- 1. search field
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; }, sel);
  // where the panel's top is on every frame for the first 600 ms after the tap
  await page.evaluate(() => {
    window.__tops = [];
    const t0 = performance.now(), p = document.querySelector('#start-panel'), f = () => { window.__tops.push(p.getBoundingClientRect().top); if (performance.now() - t0 < 600) requestAnimationFrame(f); };
    document.querySelector('#f-resort').addEventListener('focus', () => window.__tops.push(['focus', p.getBoundingClientRect().top, document.querySelector('#f-resort').getBoundingClientRect().top]), { once: true });
    requestAnimationFrame(f);
  });
  await page.locator('#f-resort').tap();
  const atFocus = (await page.evaluate(() => window.__tops)).find((x) => Array.isArray(x));
  if (!atFocus) fail('search field never got focus');
  // the field must already be at the top when focus arrives: that is when an iPhone decides how to scroll for the keyboard
  else if (atFocus[1] !== 0 || atFocus[2] > 120) fail(`list not at the top when the search got focus (panel top ${atFocus[1]}, field top ${atFocus[2]})`);
  await page.waitForTimeout(600);
  if (!(await page.locator('#start-panel.full').count())) fail('tapping search did not pull the list up to the whole screen');
  const tops = (await page.evaluate(() => window.__tops)).filter((x) => typeof x === 'number');
  if (tops.some((t) => t < 0)) fail(`list went past the top of the screen (lowest top ${Math.min(...tops)})`);
  const field = await rect('#f-resort');
  if (field.top < 0) fail(`search field above the screen (top ${field.top})`);

  // imitate the keyboard: visible part 450 px high. The list keeps its whole-screen size and place (the keyboard covers
  // its lower part, as with the panels), the field stays visible and the results get room to scroll clear of the keyboard.
  await page.evaluate(() => window.__kbSet({ height: 450, offsetTop: 0 }));
  await page.waitForTimeout(100);
  const up = await rect('#start-panel');
  if (Math.abs(up.top) > 1 || Math.abs(up.height - 844) > 1) fail(`with the keyboard up the list moved or changed size (top ${up.top}, height ${up.height}; want 0 and 844)`);
  const f2 = await rect('#f-resort');
  if (f2.top < 0 || f2.bottom > 450) fail(`with the keyboard up the search field is not visible (top ${f2.top})`);
  const room = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#resort-list')).paddingBottom));
  if (room < 380) fail(`with the keyboard up the results cannot scroll clear of it (room at the bottom ${room} px)`);
  // keyboard closed (Done): the list does not move at all, on any frame
  await page.evaluate(() => { window.__tops = []; const p = document.querySelector('#start-panel'), t0 = performance.now(), f = () => { const r = p.getBoundingClientRect(); window.__tops.push([r.top, r.height, document.querySelector('#f-resort').getBoundingClientRect().height]); if (performance.now() - t0 < 600) requestAnimationFrame(f); }; f(); document.querySelector('#f-resort').blur(); window.__kbSet(null); });
  await page.waitForTimeout(700);
  const frames = await page.evaluate(() => window.__tops);
  const moved = frames.find(([t, h]) => Math.abs(t) > 1 || Math.abs(h - 844) > 1);
  if (moved) fail(`the list jolted when the keyboard closed (top ${moved[0]}, height ${moved[1]})`);
  if (new Set(frames.map((x) => x[2])).size > 1) fail('the search field changed height when the keyboard closed');
  // dragging the list down and back up: the search field keeps its height on every frame
  const fh = (await rect('#f-resort')).height;
  await page.evaluate(() => { window.__fh = []; const fl = document.querySelector('#f-resort'), t0 = performance.now(), f = () => { window.__fh.push(fl.getBoundingClientRect().height); if (performance.now() - t0 < 2400) requestAnimationFrame(f); }; f(); });
  for (const dy of [600, -600]) {
    const g = await page.locator('#start-panel .grab').boundingBox();
    await page.evaluate(async ({ x, y, dy }) => { const el = document.elementFromPoint(x, y); const ev = (t, yy) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: yy, pointerId: 1, pointerType: 'touch', isPrimary: true }));
      ev('pointerdown', y); for (let i = 1; i <= 12; i++) { await new Promise((r) => requestAnimationFrame(r)); ev('pointermove', y + dy * i / 12); } ev('pointerup', y + dy); }, { x: g.x + g.width / 2, y: g.y + g.height / 2, dy });
    await page.waitForTimeout(900);
  }
  const hs = await page.evaluate(() => window.__fh);
  if (hs.some((h) => Math.abs(h - fh) > 0.5)) fail(`the search field changed height while the list was dragged (${Math.min(...hs)} to ${Math.max(...hs)} px, at rest ${fh})`);
  if (fh < 40) fail(`the search field is squeezed (${fh} px high)`);
  // back to the whole screen for the next step
  if (!(await page.locator('#start-panel.full').count())) { await page.locator('#f-resort').tap(); await page.waitForTimeout(500); await page.evaluate(() => document.querySelector('#f-resort').blur()); }
  // tapping search again while it already fills the screen: still at the top
  await page.locator('#f-resort').tap();
  await page.waitForTimeout(400);
  if ((await rect('#start-panel')).top !== 0) fail('second tap on search moved the list');
  await page.evaluate(() => document.querySelector('#f-resort').blur());
  // back to the normal place by tapping the grab bar
  await page.locator('#start-panel .grab').tap();
  await page.waitForTimeout(600);
  if (await page.locator('#start-panel.full').count()) fail('tapping the grab bar did not bring the list back down');

  // ---- 2. picking a mountain: no map building during the globe's turn (1.8 s)
  // its files fetched once first, so they come from the cache and the map could otherwise be built straight away
  await page.evaluate(() => Promise.all(['resort.json', 'terrain.z16', 'terrain.bin', 'surround.z16', 'surround.bin', 'canopy.z8'].map((f) => fetch('/data/jay-peak/' + f).then((r) => r.arrayBuffer()).catch(() => null))));
  await page.evaluate(() => {
    window.__mapAt = null;
    const m = document.querySelector('#map');
    new MutationObserver(() => { if (!window.__mapAt && m.querySelector('canvas')) window.__mapAt = performance.now(); }).observe(m, { childList: true, subtree: true });
    window.__pickAt = performance.now();
  });
  await page.evaluate(() => document.querySelector('[data-act="pick-resort"][data-id="jay-peak"]').click());
  await page.locator('[data-act="ski-here"][data-id="jay-peak"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => window.__mapAt, null, { timeout: 30000 });
  const builtAfter = await page.evaluate(() => Math.round(window.__mapAt - window.__pickAt));
  if (builtAfter < 1700) fail(`the 3D map was built ${builtAfter} ms after the pick, while the globe was still turning`);
  await page.locator('[data-act="ski-here"][data-id="jay-peak"]').click();
  await page.locator('#start').waitFor({ state: 'hidden', timeout: 60000 });
  console.log(`Start screen: map built ${builtAfter} ms after the pick (the turn takes 1800 ms).`);
} catch (e) {
  fail(`start screen test stopped: ${e.message}`);
}

if (problems.length && page) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/start-failure.png` }).catch(() => {});
}
await browser?.close();
stop();

if (problems.length) {
  console.error('Start screen test FAILED:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Start screen test passed: search pulls the list to the top and no further, keyboard handled, map built after the globe turn.');
process.exit(0);
