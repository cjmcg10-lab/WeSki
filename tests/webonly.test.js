// Owner's requests of 2026-11-26: pocket mode on the website only; a Close button for Paddle's checkout; any mountain
// for the free two-day forecast.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

describe('pocket mode', () => {
  it('sits in the right-hand button column after the location button', () => {
    expect(html).toMatch(/data-act="locate" aria-label="Show my location">.*\n\s*<button data-act="pocket"/);
    expect(html).toMatch(/<div id="pocket" class="hidden"/);
  });
  it('is left out of the iPhone app', () => {
    expect(main).toMatch(/const POCKET = !globalThis\.Capacitor\?\.isNativePlatform\?\.\(\);/);
    expect(main).toMatch(/if \(!POCKET\) \{ el\?\.remove\(\); document\.querySelector\('#fabs \[data-act="pocket"\]'\)\?\.remove\(\); \}/);
  });
});

describe('checkout', () => {
  it('shows the app’s own Close bar while Paddle’s checkout is open', () => {
    const acct = readFileSync('src/account.js', 'utf8');
    expect(acct).toMatch(/payBar\(true\);\n\s*P\.Checkout\.open/);
    expect(acct).toMatch(/ev\.name === 'checkout\.closed'\) payBar\(false\)/);
    expect(readFileSync('src/styles.css', 'utf8')).toMatch(/html\.paying :is\(iframe\.paddle-frame-overlay/);
  });
});

describe('free forecast', () => {
  it('lets a free user choose the mountain', () => {
    const ui = readFileSync('src/forecast/ui.js', 'utf8');
    expect(ui).toMatch(/data-act="fc-choose">\$\{t\('Change mountain'\)\}/);
    expect(ui).toMatch(/case 'fc-pick': pickResort\(d\.r\); break;/);
    expect(ui).toMatch(/const tasteOf = \(\) => fc\.pick \|\| tasteResort\(fc\.here, fc\.list\);/);
  });
});
