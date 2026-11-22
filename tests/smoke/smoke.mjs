import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = 'smoke-output';
const problems = [];

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(ORIGIN)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview did not start');
}

// Under `vite preview` there is no Worker, so /api/* calls (weather, accounts, groups) cannot succeed: those are
// answered with an empty reply here and never count as failures. Map files of resorts kept in R2 are not in a
// plain build either (only Jay Peak is in git), so failed requests under /data/ for any other resort are ignored.
const isIgnorable = (url) => {
  const u = new URL(url);
  if (u.origin !== ORIGIN) return true;
  if (u.pathname.startsWith('/api/')) return true;
  return u.pathname.startsWith('/data/') && !u.pathname.startsWith('/data/jay-peak/');
};

let browser;
let page;
try {
  await waitForServer();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await context.newPage();

  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const where = m.location().url;
    if (where && isIgnorable(where)) return;
    problems.push(`console.error: ${m.text()}`);
  });
  page.on('requestfailed', (r) => { if (!isIgnorable(r.url())) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !isIgnorable(r.url())) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

  await context.addInitScript(() => localStorage.setItem('weski:installSeen', 'true'));
  await page.addLocatorHandler(page.locator('#modal:not(.hidden) .modal-box'), async () => {
    await page.locator('#modal:not(.hidden) [data-act="modal-cancel"]').first().click();
  });

  await page.goto(ORIGIN);

  await page.locator('#f-consent').check({ timeout: 30000 });
  await page.locator('#consent-ok').click();

  await page.locator('#start-panel').waitFor({ state: 'visible', timeout: 30000 });
  const jay = page.locator('[data-act="pick-resort"][data-id="jay-peak"]');
  await jay.waitFor({ state: 'visible', timeout: 15000 });

  await jay.click();
  await page.locator('[data-act="ski-here"][data-id="jay-peak"]').click({ timeout: 15000 });

  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.locator('[data-act="tab"][data-tab="forecast"]').click();
  await page.locator('.fc-empty').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.fc-empty [data-act="fc-add"]').click();
  await page.locator('#fc-q').waitFor({ state: 'visible', timeout: 15000 });
} catch (e) {
  problems.push(`smoke test stopped: ${e.message}`);
}

if (problems.length && page) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/failure.png` }).catch(() => {});
}
await browser?.close();
stop();

if (problems.length) {
  console.error('Smoke test FAILED:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Smoke test passed: start screen shown, Jay Peak opened, map canvas drawn, Forecast tab opened, no errors.');
process.exit(0);
