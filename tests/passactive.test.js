// The pass counts only for a signed-in account that paid, and only until it ends (owner, 2026-11-26).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { passActive } from '../src/account.js';

const now = Date.parse('2026-12-01T12:00:00Z');
const paid = (until, extra = {}) => ({ signedIn: true, email: 'a@example.com', pass: { active: true, plan: 'day', until }, ...extra });

describe('who gets the paid tier', () => {
  it('a signed-in account with a pass that has not ended', () => {
    expect(passActive(paid(now + 3600e3), now)).toBe(true);
  });
  it('nobody signed in', () => {
    expect(passActive(null, now)).toBe(false);
    expect(passActive({ signedIn: false, paywall: true }, now)).toBe(false);
  });
  it('signed out, even if an old pass is still in memory', () => {
    expect(passActive(paid(now + 3600e3, { signedIn: false }), now)).toBe(false);
  });
  it('signed in to an account without a pass', () => {
    expect(passActive({ signedIn: true, pass: { active: false, plan: null, until: 0 } }, now)).toBe(false);
    expect(passActive({ signedIn: true }, now)).toBe(false);
  });
  it('a pass that has ended, even while the app stayed open', () => {
    expect(passActive(paid(now - 1), now)).toBe(false);
  });
});

describe('testing switches stay off the live app', () => {
  const main = readFileSync('src/main.js', 'utf8');
  it('only the preview build and local development turn them on', () => {
    expect(main).toMatch(/const TEST_TOOLS = import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_TEST_TOOLS === '1';/);
    expect(main).toMatch(/testMode: TEST_TOOLS && prefs\.get\('testMode', false\)/);
    expect(main).toMatch(/function simFreeSaved\(\) \{ if \(!TEST_TOOLS\) return false;/);
    expect(main).toMatch(/\$\{TEST_TOOLS \? `<div class="card"><div class="rowf"><div class="grow"><h4>Simulated location<\/h4>/);
    expect(readFileSync('tools/preview/deploy.mjs', 'utf8')).toMatch(/VITE_TEST_TOOLS: '1'/);
  });
});
