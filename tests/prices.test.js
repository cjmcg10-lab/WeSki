// Prices live in one place: PLANS in worker/accounts.js. This test names every page and document that shows a
// different number, so changing a price is one edit there plus whatever this test lists (and Paddle).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANS } from '../worker/accounts.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const money = (n) => `$${n.toFixed(2)}`;

describe('prices match PLANS everywhere they are written', () => {
  it('has the four plans the owner set on 2026-11-23', () => {
    expect(Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, p.price]))).toEqual({ day: 2.99, week: 5.99, season: 24.99, crew: 44.99 });
    expect(PLANS.crew.seats).toBe(4);
  });
  it('the About page (the website Paddle reviews)', () => {
    const html = read('public/about.html');
    for (const [k, p] of Object.entries(PLANS)) {
      const cell = new RegExp(`data-plan="${k}">([^<]*)<`).exec(html);
      expect(cell, `about.html has no data-plan="${k}" cell`).toBeTruthy();
      expect(cell[1].startsWith(money(p.price)), `about.html ${k}: ${cell[1]}`).toBe(true);
    }
  });
  it('the plans table in docs/PAID_TIER.md', () => {
    const md = read('docs/PAID_TIER.md');
    for (const p of Object.values(PLANS)) {
      const row = md.split('\n').find((l) => l.startsWith(`| ${p.name} |`));
      expect(row, `PAID_TIER.md has no row for ${p.name}`).toBeTruthy();
      expect(row.includes(money(p.price)), `PAID_TIER.md ${p.name}: ${row}`).toBe(true);
    }
  });
  it('no legal page names a price (the app shows them before payment)', () => {
    for (const f of ['terms', 'refunds', 'privacy']) expect(read(`public/legal/${f}.html`), f).not.toMatch(/\$\d+\.\d\d/);
  });
});
