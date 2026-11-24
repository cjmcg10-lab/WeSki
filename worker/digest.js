// Daily email of new "Report a map mistake" reports to the owner (issue #112, step 1).
//
// Sent once a day by the Worker's Cron Trigger (wrangler.assets.jsonc "triggers"), through Cloudflare's own email
// sending: a `send_email` binding called REPORT_MAIL, which can only send to addresses verified in the Cloudflare
// dashboard (Email Routing → Destination addresses). See docs/MAP_REPORTS.md for what the owner sets up.
// Without the binding (or without an address) nothing is sent and nothing is marked as sent, so reports wait for the
// first digest after it is switched on. Days with nothing new send nothing.
//
// Bookkeeping lives in the ResortLog Durable Objects that already hold the reports:
// - the instance named DIGEST_INDEX (not a valid resort id) lists mountains with reports not yet emailed, and the
//   date of the last digest, so a retried cron run on the same day sends nothing twice;
// - each mountain keeps the highest report id already emailed.
import { KIND_NAMES } from './confidence.js';
import places from '../public/data/index.json';

export const DIGEST_INDEX = '_digest';
export const SITE = 'https://skiwithme.builtbyroger.app';
export const MAX_REPORTS_PER_MOUNTAIN = 40;
export const MAX_PROBLEMS_PER_MOUNTAIN = 10;

const NAMES = new Map(places.map((p) => [p.id, p.name]));
export const resortName = (id) => NAMES.get(id) || id;

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const when = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const oneLine = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim();

/** Where a report or problem is: an OpenStreetMap link when the spot's lat/lon is known, else the map position. */
export function spotText(p) {
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    const lat = p.lat.toFixed(5), lon = p.lon.toFixed(5);
    return `${lat}, ${lon}  https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  }
  return `map position x ${p.x} m, y ${p.y} m (tools/reports.py turns it into a map link)`;
}

/** The app opens straight on a mountain with ?skip=<id>. It cannot yet open on a given spot. */
export const appLink = (id) => `${SITE}/?skip=${encodeURIComponent(id)}`;

/**
 * The email for one day. `parts`: [{resort, reports: [new reports, oldest first], problems: [scored, see confidence.js],
 * days (map-help ski days at the mountain)}]. Returns {subject, text}, or null when there is nothing new.
 */
export function buildDigest(parts, now = Date.now()) {
  const withNew = parts.filter((p) => p.reports?.length);
  if (!withNew.length) return null;
  const total = withNew.reduce((s, p) => s + p.reports.length, 0);
  const subject = `SkiWithMe map reports: ${plural(total, 'new report')} at ${plural(withNew.length, 'mountain')} (${day(now)})`;
  const L = [];
  L.push(`${plural(total, 'new map-mistake report')} since the last digest.`);
  L.push('');
  L.push('Confidence says how sure we are that a problem is real: low, medium or high. It counts separate phones that');
  L.push('reported it, whether a reporter was standing near the spot, map-help GPS counts (only places reached by 5 or');
  L.push('more ski days), and age (reports fade out over 60 days). Nothing on the map changes automatically yet.');
  for (const p of withNew) {
    const name = resortName(p.resort);
    const byReport = new Map();
    for (const pr of p.problems || []) for (const id of pr.reports) byReport.set(id, pr);
    L.push('');
    L.push(`== ${name} (${p.resort}): ${plural(p.reports.length, 'new report')} ==`);
    L.push(`Open the mountain in the app: ${appLink(p.resort)}`);
    const shown = p.reports.slice(-MAX_REPORTS_PER_MOUNTAIN);
    if (shown.length < p.reports.length) L.push(`(Showing the newest ${shown.length}; the full list is at ${SITE}/api/reports/${p.resort})`);
    shown.forEach((r, i) => {
      L.push('');
      L.push(`${i + 1}. ${KIND_NAMES[r.kind] || r.kind}${r.name ? `: ${oneLine(r.name)}` : ' (not on a named run)'}  [report #${r.id}, ${when(r.at)}]`);
      if (r.text) L.push(`   Note: "${oneLine(r.text)}"`);
      L.push(`   Spot: ${spotText(r)}`);
      L.push(`   Reporter's GPS: ${Number.isFinite(r.near) ? `${r.near} m from the spot when sent` : 'not known'}`);
      const pr = byReport.get(r.id);
      if (pr) L.push(`   Confidence: ${pr.level.toUpperCase()} (score ${pr.score}): ${pr.why[0]}`);
      else L.push('   Confidence: not scored (report closed or too old)');
    });
    const probs = (p.problems || []).slice(0, MAX_PROBLEMS_PER_MOUNTAIN);
    if (probs.length) {
      L.push('');
      L.push(`Open problems at ${name} (all reports from the last 60 days, most certain first; ${plural(p.days || 0, 'map-help ski day')} so far):`);
      for (const pr of probs) {
        L.push(`- ${pr.level.toUpperCase()} ${pr.score}  ${KIND_NAMES[pr.kind] || pr.kind}${pr.name ? `: ${oneLine(pr.name)}` : ''}  (reports ${pr.reports.map((id) => '#' + id).join(', ')})`);
        L.push(`    Spot: ${spotText(pr)}`);
        for (const w of pr.why) L.push(`    ${w}`);
      }
      if ((p.problems || []).length > probs.length) L.push(`  ...and ${p.problems.length - probs.length} more: ${SITE}/api/reports/${p.resort}/problems`);
    }
  }
  L.push('');
  L.push('--');
  L.push('Sent once a day by the SkiWithMe Worker, only on days with new reports. Reports are anonymous public notes.');
  L.push('How this works: docs/MAP_REPORTS.md in the repository.');
  return { subject, text: L.join('\n') + '\n' };
}

// ---------------------------------------------------------------- the email itself (plain text, UTF-8)
const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** A raw RFC 5322 message, as Cloudflare's EmailMessage expects. */
export function mimeMessage({ from, to, subject, text, now = Date.now(), id = crypto.randomUUID() }) {
  const domain = String(from).split('@')[1]?.replace(/[>\s].*$/, '') || 'localhost';
  const body = b64(text).replace(/.{76}/g, '$&\r\n');
  return [
    `From: SkiWithMe map reports <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeWord(oneLine(subject))}`,
    `Date: ${new Date(now).toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

/** Is the digest switched on? Needs the REPORT_MAIL binding, a sender and an inbox. */
export function digestConfig(env) {
  const to = env.REPORT_DIGEST_INBOX || env.REPORT_DIGEST_TO;   // the secret, when set, wins over the plain setting
  const from = env.REPORT_DIGEST_FROM;
  if (!env.REPORT_MAIL || typeof env.REPORT_MAIL.send !== 'function' || !to || !from) return null;
  return { to, from };
}

async function sendMail(env, cfg, mail, now) {
  const raw = mimeMessage({ from: cfg.from, to: cfg.to, subject: mail.subject, text: mail.text, now });
  const { EmailMessage } = await import('cloudflare:email');
  await env.REPORT_MAIL.send(new EmailMessage(cfg.from, cfg.to, raw));
}

/**
 * The daily job. `log(env, id)` returns the ResortLog stub for a mountain (or the index). `send` is replaceable for tests.
 * Returns what happened, for the Worker's logs.
 */
export async function runDigest(env, log, now = Date.now(), send = sendMail) {
  const cfg = digestConfig(env);
  if (!cfg) return { sent: false, why: 'switched off (no REPORT_MAIL binding or address)' };
  const index = log(env, DIGEST_INDEX);
  const state = await index.digestDue(day(now));
  if (state.sentToday) return { sent: false, why: 'already sent today' };
  if (!state.resorts.length) return { sent: false, why: 'nothing new' };
  const parts = [];
  for (const id of state.resorts) parts.push({ resort: id, ...(await log(env, id).digestPart(now)) });
  const mail = buildDigest(parts, now);
  if (!mail) { await index.digestDone(state.resorts, null, now); return { sent: false, why: 'nothing new' }; }
  await send(env, cfg, mail, now);
  for (const p of parts) if (p.reports.length) await log(env, p.resort).digestSent(p.maxId);
  await index.digestDone(state.resorts, day(now), now);
  return { sent: true, mountains: parts.filter((p) => p.reports.length).length, reports: parts.reduce((s, p) => s + p.reports.length, 0) };
}
