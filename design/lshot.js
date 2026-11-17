const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1040, height: 900 } });
await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">' + require('fs').readFileSync('logo-options.html', 'utf8') + '</body></html>');
await p.waitForTimeout(800); await p.screenshot({ path: 'shots/logos.png', fullPage: true }); await b.close(); })();
