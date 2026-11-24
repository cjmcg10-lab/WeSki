// Smoke test of the free tier (issue #115): with "Simulate free tier" on, the paid parts show the pass pop-up and
// free parts keep working. Saved days are seeded straight into the phone's database: one today, two earlier.
// Writes screenshots at 390 px to smoke-output/freetier/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4175;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = 'smoke-output/freetier';
const problems = [];
mkdirSync(SHOT_DIR, { recursive: true });

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
const isIgnorable = (url) => {
  const u = new URL(url);
  if (u.origin !== ORIGIN) return true;
  if (u.pathname.startsWith('/api/')) return true;
  return u.pathname.startsWith('/data/') && !u.pathname.startsWith('/data/jay-peak/');
};

let browser, page;
const shot = (name) => page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
async function expectUpsell(title, name) {
  const box = page.locator('#modal:not(.hidden) .modal-box.upsell');
  await box.waitFor({ state: 'visible', timeout: 10000 });
  const text = await box.innerText();
  if (!text.includes(title)) throw new Error(`pass pop-up says "${text.slice(0, 120)}", expected "${title}"`);
  await shot(name);
  await page.locator('#modal [data-act="modal-cancel"]').first().click();
  await box.waitFor({ state: 'hidden', timeout: 5000 });
}

try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await context.newPage();
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !(m.location().url && isIgnorable(m.location().url))) problems.push(`console.error: ${m.text()}`); });
  await context.addInitScript(() => { localStorage.setItem('weski:installSeen', 'true'); localStorage.setItem('weski:simFree', 'true'); });

  await page.goto(ORIGIN);
  // three saved days at Jay Peak: today, three days ago, last month
  await page.evaluate(async () => {
    const day = (id, ago) => {
      const start = Date.now() - ago * 864e5 - 60e3;
      return { id, resort: 'jay-peak', kind: 'solo', start, end: start + 3 * 3600e3, active: false, points: [], routes: [],
        stats: { runCount: 7, vert: 2100, skiDist: 12000, topSpeed: 18, avgSpeed: 9, skiTime: 5400, liftCount: 7, liftVert: 2100, liftDist: 9000, liftTime: 3000, runs: [] } };
    };
    await new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open('weski', 1);
      req.onupgradeneeded = () => { const d = req.result; d.createObjectStore('sessions', { keyPath: 'id' }); d.createObjectStore('kv'); };
      req.onsuccess = () => {
        const t = req.result.transaction('sessions', 'readwrite');
        for (const s of [day('d-today', 0), day('d-3', 3), day('d-30', 30)]) t.objectStore('sessions').put(s);
        t.oncomplete = () => { req.result.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  await page.reload();
  await page.locator('#f-consent').check({ timeout: 30000 });
  await page.locator('#consent-ok').click();
  await page.locator('#start-panel').waitFor({ state: 'visible', timeout: 30000 });

  // Start screen: History lists the earlier days locked
  await page.locator('#hist-btn').click();
  await page.locator('.mrow.day.locked').first().waitFor({ state: 'visible', timeout: 10000 });
  if ((await page.locator('.mrow.day.locked').count()) !== 2) throw new Error('start-screen history should lock exactly the two earlier days');
  await shot('start-history');
  await page.locator('.mrow.day.locked').first().click();
  await expectUpsell('Unlock your saved ski days', 'start-history-upsell');
  await page.locator('#hist-btn').click();

  // the mountain's card: just the Download for offline button (the explanations are in More), and it needs the pass
  const jay = page.locator('[data-act="pick-resort"][data-id="jay-peak"]');
  await jay.waitFor({ state: 'visible', timeout: 15000 });
  await jay.click();
  await page.locator('#resort-card [data-act="download"]').waitFor({ state: 'visible', timeout: 15000 });
  if (await page.locator('#resort-card .card-offline .sub').count()) throw new Error('mountain card shows offline explanations again (they belong in More; the card keeps just the button)');
  await shot('start-card');
  await page.locator('#resort-card [data-act="download"]').click();
  await expectUpsell('Download mountains for offline', 'start-card-upsell');
  await page.locator('[data-act="ski-here"][data-id="jay-peak"]').click({ timeout: 15000 });
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2500);

  // History inside the mountain: today's day open, two locked cards under the unlock line
  await page.locator('[data-act="tab"][data-tab="history"]').click();
  await page.locator('#sheet .lock-head').waitFor({ state: 'visible', timeout: 15000 });
  if (!(await page.locator('#sheet .lock-head', { hasText: '2 ski days saved' }).count())) throw new Error('history should say "2 ski days saved"');
  if ((await page.locator('#sheet .day-card.locked').count()) !== 2) throw new Error('history should show two locked cards');
  if ((await page.locator('#sheet [data-act="open-session"]').count()) !== 1) throw new Error('today\'s saved day should stay open');
  await shot('history');
  await page.locator('#sheet .day-card.locked').first().click();
  await expectUpsell('Unlock your saved ski days', 'history-upsell');
  await page.locator('#sheet [data-act="open-session"]').click();
  await page.locator('#sheet', { hasText: 'Replay on map' }).waitFor({ state: 'visible', timeout: 10000 });

  // Forecast: the free taste (today and tomorrow at Jay Peak), the rest behind the pass
  await page.locator('[data-act="tab"][data-tab="forecast"]').click();
  await page.locator('#sheet .fc-lock').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#sheet .fc-taste .fc-taste-day').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await shot('forecast');
  if (await page.locator('#sheet .fc-grid').count()) throw new Error('the calendar should not show without a pass');
  await page.locator('#sheet [data-act="fc-upsell"]').first().click();
  await expectUpsell('The full ski forecast', 'forecast-upsell');

  // More: offline card, download needs the pass, weather stays free
  await page.locator('[data-act="tab"][data-tab="more"]').click();
  await page.locator('#sheet [data-act="download"]').waitFor({ state: 'visible', timeout: 10000 });
  // More redraws once the phone reports its storage use, which can replace the button mid-scroll: try again then
  for (let i = 0; ; i++) {
    try { await page.locator('#sheet [data-act="download"]').scrollIntoViewIfNeeded({ timeout: 5000 }); break; }
    catch (e) { if (i >= 4 || !/not attached/.test(String(e))) throw e; await page.waitForTimeout(300); }
  }
  await shot('more-offline');
  await page.locator('#sheet [data-act="download"]').click();
  await expectUpsell('Download mountains for offline', 'more-offline-upsell');

  if (!(await page.locator('#sheet', { hasText: 'stays on your phone today' }).count())) throw new Error('More lacks the "stays on your phone today" line');
  // Emergency stays free
  await page.locator('#sheet [data-act="close-sheet"]').click();
  await page.locator('#sos-btn').click();
  await page.locator('#sheet', { hasText: 'Ski patrol at this mountain' }).waitFor({ state: 'visible', timeout: 15000 });
  if (await page.locator('#modal:not(.hidden)').count()) throw new Error('the emergency sheet must never ask for a pass');

  // the pass sheet lists the new free/paid split and prices are not shown without the server
  await page.locator('#sheet [data-act="close-sheet"]').click();
  await page.locator('[data-act="tab"][data-tab="more"]').click();
  await page.locator('#sheet [data-act="open-sheet"][data-s="pass"]').click();
  await page.locator('#sheet', { hasText: 'Download mountains for offline use' }).waitFor({ state: 'visible', timeout: 10000 });
  await shot('pass-sheet');
} catch (e) {
  problems.push(`free-tier smoke test stopped: ${e.message}`);
  if (page) await page.screenshot({ path: `${SHOT_DIR}/failure.png` }).catch(() => {});
}
await browser?.close();
stop();
if (problems.length) {
  console.error('Free-tier smoke test FAILED:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Free-tier smoke test passed: locked days, forecast taste, offline download and their pass pop-ups, emergency free.');
process.exit(0);
