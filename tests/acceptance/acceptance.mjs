import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'https://skiwithme.builtbyroger.app';
const OUT = 'smoke-output/acceptance';
mkdirSync(OUT, { recursive: true });

const FIRST = ['Jay Peak', 'Burke Mountain', 'Cannon Mountain'];
const SECOND = ['Sundown Mountain Resort', 'Zermatt', 'Mount Buller'];
const CONFIGS = [
  { name: '360-light', width: 360, height: 780, scheme: 'light', mobile: true },
  { name: '360-dark', width: 360, height: 780, scheme: 'dark', mobile: true },
  { name: '1280-light', width: 1280, height: 800, scheme: 'light', mobile: false },
  { name: '1280-dark', width: 1280, height: 800, scheme: 'dark', mobile: false },
];

const flat = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function run(browser, cfg, report) {
  const ctx = await browser.newContext({
    viewport: { width: cfg.width, height: cfg.height }, hasTouch: cfg.mobile, isMobile: cfg.mobile,
    colorScheme: cfg.scheme, locale: 'en-US', timezoneId: 'America/New_York',
  });
  await ctx.addInitScript((theme) => {
    localStorage.setItem('weski:installSeen', 'true');
    if (!localStorage.getItem('weski:theme')) localStorage.setItem('weski:theme', JSON.stringify(theme));
  }, cfg.scheme);
  const page = await ctx.newPage();
  const r = { errors: [], steps: {}, layout: [] };
  report[cfg.name] = r;
  const live = new URL(BASE).origin;
  page.on('pageerror', (e) => r.errors.push(`page error: ${e.message}`));
  const noHistory = new Set();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) r.errors.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('response', (res) => {
    const path = res.url().replace(live, '');
    if (res.status() < 400 || !res.url().startsWith(live)) return;
    if (res.status() === 404 && path.startsWith('/api/history/')) noHistory.add(path.slice(13));
    else r.errors.push(`HTTP ${res.status()} ${path}`);
  });
  r.noHistoryYet = noHistory;
  const shot = (n) => page.screenshot({ path: `${OUT}/${cfg.name}-${n}.png` });
  const layout = async (label) => {
    const o = await page.evaluate(() => {
      const w = window.innerWidth;
      const sheet = document.querySelector('#sheet');
      const wide = [...document.querySelectorAll('#sheet *')].filter((e) => e.clientWidth && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').slice(0, 3).map((e) => `${e.tagName}.${e.className}`);
      return { doc: document.documentElement.scrollWidth <= w + 1, sheet: !sheet || sheet.scrollWidth <= sheet.clientWidth + 1, textOverflow: wide };
    });
    r.layout.push({ label, ...o });
  };
  r.fail = () => page.screenshot({ path: `${OUT}/${cfg.name}-failure.png` }).catch(() => {});
  const settled = () => page.waitForFunction(() => document.querySelectorAll('.fc-cell').length > 0 && document.querySelectorAll('.fc-cell.skeleton').length === 0, null, { timeout: 45000 });
  const rows = () => page.$$eval('.fc-rowhead b', (els) => els.map((e) => e.textContent));
  const cells = () => page.$$eval('tbody tr', (trs) => trs.map((tr) => ({
    row: tr.querySelector('.fc-rowhead b')?.textContent,
    cells: [...tr.querySelectorAll('.fc-cell')].map((c) => c.getAttribute('aria-label')),
  })));
  const add = async (query, name) => {
    await page.fill('#fc-q', query);
    const hit = page.locator('#fc-results .fc-res', { hasText: name }).first();
    await hit.waitFor({ state: 'visible', timeout: 30000 });
    await hit.locator('[data-act="fc-doadd"]').click();
    await hit.locator('[data-act="fc-unadd"]').waitFor({ timeout: 10000 });
  };
  const openDay = async (index) => {
    await page.locator('tbody .fc-cell').nth(index).click();
    await page.waitForSelector('.fc-dateline', { timeout: 30000 });
    return { title: flat(await page.textContent('#sheet-title')), text: flat(await page.textContent('#sheet-body')).slice(0, 900) };
  };

  await page.goto(BASE);
  await page.locator('#f-consent').check({ timeout: 30000 });
  await page.locator('#consent-ok').click();
  await page.waitForSelector('[data-act="start-forecast"]', { timeout: 30000 });
  await page.click('[data-act="start-forecast"]');
  await page.waitForSelector('.fc-empty');
  r.steps.s1_empty = flat(await page.textContent('.fc-empty'));
  await shot('1-empty');

  await page.click('.fc-empty [data-act="fc-add"]');
  await page.waitForSelector('#fc-q');
  await shot('2-add-search');
  for (const [q, n] of [['jay', FIRST[0]], ['burke', FIRST[1]], ['cannon', FIRST[2]]]) await add(q, n);
  await page.click('[data-act="fc-home"][data-first]');
  await page.waitForSelector('.fc-grid');
  await settled();
  r.steps.s1_dates = await page.$$eval('.fc-datehead', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  r.steps.s1_calendar = await cells();
  await page.locator('.fc-datehead').nth(2).click();
  await page.waitForSelector('.fc-sortline .btn');
  r.steps.s1_sortedRows = await rows();
  await page.$eval('.fc-scroll', (s) => { s.scrollLeft = 120; });
  await page.waitForTimeout(100);
  const scrollBefore = await page.$eval('.fc-scroll', (s) => s.scrollLeft);
  const label = await page.locator('tbody .fc-cell').nth(3).getAttribute('aria-label');
  r.steps.s1_day = await openDay(3);
  await page.click('.fc-back');
  await page.waitForSelector('.fc-grid');
  await page.waitForTimeout(200);
  r.steps.s1_backSamePlace = {
    scroll: Math.abs((await page.$eval('.fc-scroll', (s) => s.scrollLeft)) - scrollBefore) < 2,
    sortKept: (await rows()).join() === r.steps.s1_sortedRows.join(),
    focus: await page.evaluate((a) => document.activeElement?.getAttribute('aria-label') === a, label),
  };

  await page.click('[data-act="fc-edit"]');
  await page.waitForSelector('.fc-edit');
  for (let i = 0; i < 3; i++) await page.locator('.fc-edit-row:not(.undo) [data-act="fc-remove"]').first().click();
  r.steps.s2_removedAll = await page.$$eval('.fc-edit-row.undo', (e) => e.length);
  await page.click('[data-act="fc-home"]:has-text("Done")');
  await page.waitForSelector('.fc-empty, .fc-actions');
  r.steps.s2_emptyPromptAfterRemovingAll = (await page.locator('.fc-empty').count()) > 0;
  await page.click('[data-act="fc-add"]');
  await page.waitForSelector('#fc-q');
  for (const n of SECOND) await add(n, n);
  await page.click('[data-act="fc-home"][data-first]');
  await page.waitForSelector('.fc-grid');
  await settled();
  await page.click('[data-act="fc-edit"]');
  await page.waitForSelector('.fc-edit');
  await page.locator('[data-act="fc-move"][data-dir="up"]').last().click();
  await page.click('[data-act="fc-home"]:has-text("Done")');
  await page.waitForSelector('.fc-grid');
  r.steps.s2_rowsAfterReorder = await rows();
  await page.reload();
  await page.waitForSelector('[data-act="start-forecast"]');
  await page.click('[data-act="start-forecast"]');
  await page.waitForSelector('.fc-grid');
  await settled();
  r.steps.s2_rowsAfterReload = await rows();
  r.steps.s2_calendar = await cells();
  await shot('3-calendar');
  await layout('calendar');
  r.steps.s2_days = [];
  const rowCount = (await rows()).length;
  for (let i = 0; i < rowCount; i++) {
    const day = await openDay(i * (await page.locator('tbody tr:first-child .fc-cell').count()) + 1);
    r.steps.s2_days.push(day);
    if (i === 0) { await shot('4-day'); await layout('day'); }
    await page.click('.fc-back');
    await page.waitForSelector('.fc-grid');
  }

  await page.click('[data-act="fc-add"]');
  await page.waitForSelector('#fc-q');
  await page.fill('#fc-q', 'zer');
  await page.waitForSelector('#fc-results .fc-res');
  await shot('5-add');
  await layout('add');
  await page.click('.fc-back');
  await page.waitForSelector('.fc-grid');

  await page.click('[data-act="fc-trip"]');
  await page.waitForSelector('#fc-trip-out');
  const picks = page.locator('[data-act="fc-trip-pick"]');
  const n = await picks.count();
  for (let i = 0; i < Math.min(3, n); i++) await picks.nth(i).click();
  await page.waitForTimeout(500);
  r.steps.s2_trip = flat(await page.textContent('#fc-trip-out')).slice(0, 700);
  await shot('6-trip');
  await layout('trip');
  await page.locator('.fc-back').first().click();
  await page.waitForSelector('.fc-grid');

  await page.click('[data-act="fc-add"]');
  await page.waitForSelector('#fc-q');
  await page.click('[data-act="fc-pin-new"]');
  await page.fill('#fc-name', 'Acceptance Hill');
  r.steps.s3_mapDrawn = await page.locator('.maplibregl-canvas').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  await page.waitForTimeout(3000);
  await shot('7-pin');
  await layout('pin');
  await page.click('[data-act="fc-pin-coords"]');
  await page.fill('#fc-lat', '44.5');
  await page.fill('#fc-lon', '-72.78');
  await page.press('#fc-lon', 'Tab');
  await page.fill('#fc-hbase', '400');
  await page.press('#fc-hbase', 'Tab');
  await page.click('[data-act="fc-pin-save"]');
  await page.locator('.fc-rowhead', { hasText: 'Pinned' }).waitFor({ state: 'visible', timeout: 20000 });
  await settled();
  const pinRow = (await cells()).find((x) => x.row === 'Acceptance Hill');
  r.steps.s3_pinRow = flat(await page.locator('.fc-rowhead', { hasText: 'Pinned' }).innerText());
  r.steps.s3_pinCells = pinRow?.cells;
  const pinIndex = (await rows()).indexOf('Acceptance Hill');
  r.steps.s3_pinDay = await openDay(pinIndex * (await page.locator('tbody tr:first-child .fc-cell').count()) + 1);

  r.errors = [...new Set(r.errors)];
  r.noHistoryYet = [...noHistory];
  await ctx.close();
}

const browser = await chromium.launch();
const report = {};
for (const cfg of CONFIGS) {
  if (process.env.ONLY && !cfg.name.startsWith(process.env.ONLY)) continue;
  try { await run(browser, cfg, report); } catch (e) {
    const r = (report[cfg.name] ||= { errors: [] });
    r.fatal = e.message.split('\n').slice(0, 3).join(' ');
    await r.fail?.();
    delete r.fail;
  }
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), report }, null, 1));
const checks = (v) => {
  const s = v.steps || {};
  return [
    s.s2_emptyPromptAfterRemovingAll === false && 'no "Where should you ski?" prompt after removing every mountain',
    s.s1_backSamePlace && !Object.values(s.s1_backSamePlace).every(Boolean) && `Back did not return to the same place: ${JSON.stringify(s.s1_backSamePlace)}`,
    s.s2_rowsAfterReorder && s.s2_rowsAfterReload && s.s2_rowsAfterReorder.join() !== s.s2_rowsAfterReload.join() && 'row order changed through reload',
  ].filter(Boolean);
};
const ran = Object.entries(report);
const bad = ran.filter(([, v]) => v.fatal || v.errors?.length || v.layout?.some((l) => !l.doc || !l.sheet) || checks(v).length);
console.log(`Acceptance run against ${BASE}: ${ran.length - bad.length}/${ran.length} configurations clean. Report: ${OUT}/report.json`);
for (const [k, v] of bad) console.log(` - ${k}: ${v.fatal || ''} ${(v.errors || []).slice(0, 5).join(' | ')} ${JSON.stringify((v.layout || []).filter((l) => !l.doc || !l.sheet))} ${checks(v).join('; ')}`);
process.exit(bad.length ? 1 : 0);
