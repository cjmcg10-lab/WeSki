#!/usr/bin/env node
// Usage alerts: read the numbers, compare them with the plan limits, and (with --github) open, update or close the
// usage-alert issue and post the weekly summary. Run daily by .github/workflows/usage.yml. See docs/USAGE_ALERTS.md.
//
//   node tools/usage/run.mjs                      read Cloudflare (read-only) and print the report
//   node tools/usage/run.mjs --fake data.json     use made-up numbers instead ({series, missing, notes, selfCount})
//   options: --today YYYY-MM-DD  --plan free|paid  --md out.md  --json out.json  --github  --weekly
//
// Environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (Cloudflare), CF_WORKERS_PLAN (free|paid), WORKER_NAME,
// APP_URL and USAGE_SECRET (the Worker's own count), GITHUB_TOKEN and GITHUB_REPOSITORY (--github), USAGE_EMAIL=on
// (also email through the Worker when the alert opens or gets worse).
import { readFileSync, writeFileSync } from 'node:fs';
import { assessAll, report } from './assess.mjs';
import { fromCloudflare, fromWorker } from './collect.mjs';
import { client, publishAlert, publishWeekly } from './github.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);

const today = opt('--today') || new Date().toISOString().slice(0, 10);
const plan = (opt('--plan') || process.env.CF_WORKERS_PLAN || 'free').toLowerCase() === 'paid' ? 'paid' : 'free';
const app = (process.env.APP_URL || 'https://skiwithme.builtbyroger.app').replace(/\/$/, '');
const secret = process.env.USAGE_SECRET || '';

let data;
if (opt('--fake')) data = JSON.parse(readFileSync(opt('--fake'), 'utf8'));
else {
  data = await fromCloudflare({ today, worker: process.env.WORKER_NAME || 'skiwithme' });
  const self = await fromWorker({ today, app, secret });
  if (self.error) data.notes.push(self.error + '.');
  else { Object.assign(data.series, self.series); data.selfCount = self.selfCount; }
}

const r = assessAll(data, { plan, today });
const md = report(r);
if (opt('--md')) writeFileSync(opt('--md'), md);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(r, (k, v) => (typeof v === 'function' ? undefined : v), 2));
if (!flag('--github')) console.log(md);
console.log(`Overall: ${r.level}`);

if (flag('--github')) {
  const gh = client({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY });
  const out = await publishAlert(gh, r, md);
  console.log(`Alert issue: ${out.action}${out.url ? ' ' + out.url : ''}`);
  if (flag('--weekly')) console.log(`Weekly summary: ${(await publishWeekly(gh, r, report(r, { title: 'Weekly usage summary' }))).url}`);
  if (out.worse && process.env.USAGE_EMAIL === 'on' && secret) {
    const res = await fetch(`${app}/api/admin/usage/mail`, {
      method: 'POST', headers: { 'x-admin-key': secret, 'content-type': 'application/json', 'user-agent': 'weski-build' },
      body: JSON.stringify({ subject: `SkiWithMe usage: ${r.level}`, text: `${md.replace(/<!--.*?-->/gs, '')}\n\n${out.url || ''}` }),
    }).catch((e) => ({ ok: false, status: e.message }));
    console.log(res.ok ? 'Email sent' : `::warning::The alert email was not sent (${res.status})`);
  }
}
