// Daily email of new "Report a map mistake" reports to the owner (issue #112, step 1), with each mountain's map help:
// the share of skiing on the drawn runs, places people keep leaving the map, and suggested fixes (#112, GPS evidence).
//
// Sent once a day by the Worker's Cron Trigger (wrangler configs "triggers") through Resend, the same mail account
// that sends the sign-in codes (RESEND_API_KEY secret, MAIL_FROM), to REPORT_DIGEST_TO (hello@builtbyroger.app, which
// the owner forwards to their own inbox). See docs/MAP_REPORTS.md. Without the key, the sender or the inbox nothing
// is sent and nothing is marked as sent, so reports wait for the first digest after it is switched on. When Resend
// refuses, nothing is marked either and the reports come again the next day. Days with nothing new send nothing.
//
// Bookkeeping lives in the ResortLog Durable Objects that already hold the reports:
// - the instance named DIGEST_INDEX (not a valid resort id) lists mountains with reports not yet emailed, and the
//   date of the last digest, so a retried cron run on the same day sends nothing twice;
// - each mountain keeps the highest report id already emailed.
import { KIND_NAMES, ratingName } from './confidence.js';
import { findGaps, placeText } from './mapgaps.js';
import { suggestFixes, photoSource } from './mapfixes.js';
import { inR2 } from './maps.js';
import { K_ANON } from './evidence.js';
import places from '../public/data/index.json';

export const DIGEST_INDEX = '_digest';
/** The daily report email's Cron Trigger: must match the second entry of "crons" in both wrangler configs. */
export const DIGEST_CRON = '23 11 * * *';
export const SITE = 'https://skiwithme.builtbyroger.app';
export const MAX_REPORTS_PER_MOUNTAIN = 40;
export const MAX_PROBLEMS_PER_MOUNTAIN = 10;
export const MAX_PLACES_PER_MOUNTAIN = 3;     // "Places people keep leaving the map": the top few lines
export const MAX_FIXES_PER_MOUNTAIN = 5;      // "Suggested fixes": the top few (safe ones first)

const NAMES = new Map(places.map((p) => [p.id, p.name]));
const REGIONS = new Map(places.map((p) => [p.id, p.region]));
export const resortName = (id) => NAMES.get(id) || id;
/** Only mountains in the app's index can be reported on, so made-up ids cannot fill the daily email. */
/** At most this many mountains per email; the rest wait for the next day (keeps one run within Cloudflare's limits). */
export const DIGEST_MAX_MOUNTAINS = 60;
export const isKnownResort = (id) => NAMES.has(id);

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
 * Map help for one mountain, for the email: the on-map share (latest day with at least K_ANON ski days), places people
 * keep leaving the map (worker/mapgaps.js) and suggested fixes (worker/mapfixes.js). `heat`: public map-help totals;
 * `map`: the live resort.json or null. Returns null when there is nothing to say.
 */
export function mapHelpPart(id, heat, map, problems, now = Date.now()) {
  if (!heat || !(heat.days > 0)) return null;
  const yesterday = day(now - 86400e3);
  const recent = (heat.onMap || []).filter((d) => d.day >= day(now - 7 * 86400e3));
  const share = recent.length ? { ...recent[recent.length - 1] } : null;
  if (share) share.yesterday = share.day === yesterday;
  const gaps = findGaps(heat, map, problems).filter((p) => p.line);
  // the date of the live map is not known inside the Worker, so no hide is "safe" here: the weekly tool decides those
  const fixes = suggestFixes({ id, heat, map, problems, places: gaps, photo: photoSource(REGIONS.get(id)), mapSince: null });
  return { days: heat.days, share, places: gaps, fixes };
}

function mapHelpLines(p, L) {
  const m = p.mapHelp;
  if (!m) return;
  L.push('');
  if (m.share) {
    const what = `${m.share.pct}% of skiing was on the drawn runs (${plural(m.share.days, 'ski day')})`;
    L.push(m.share.yesterday ? `Yesterday: ${what}.` : `Latest day with enough ski days, ${m.share.day}: ${what}.`);
  } else L.push(`On the drawn runs: not enough ski days yet (a day is shown once ${K_ANON} or more ski days sent map help).`);
  if (m.places.length) {
    L.push(`Places people keep leaving the map (each square skied on ${K_ANON}+ days):`);
    for (const pl of m.places.slice(0, MAX_PLACES_PER_MOUNTAIN)) {
      L.push(`- ${placeText(pl)}`);
      L.push(`    ${pl.link || spotText(pl)}`);
    }
    if (m.places.length > MAX_PLACES_PER_MOUNTAIN) L.push(`  ...and ${m.places.length - MAX_PLACES_PER_MOUNTAIN} more (tools/map_fixes.mjs ${p.resort})`);
  }
  if (m.fixes.length) {
    const safe = m.fixes.filter((f) => f.safety === 'safe'), review = m.fixes.filter((f) => f.safety !== 'safe');
    L.push(`Suggested fixes: ${safe.length} safe, ${review.length} need review:`);
    for (const f of m.fixes.slice(0, MAX_FIXES_PER_MOUNTAIN)) {
      const tag = f.safety === 'safe' ? (f.check === 'photo' ? 'SAFE if the aerial photo agrees' : 'SAFE') : 'NEEDS REVIEW';
      L.push(`- ${tag} (${f.confidence}): ${oneLine(f.title)}`);
      L.push(`    ${oneLine(f.reasons[0])}`);
    }
    if (m.fixes.length > MAX_FIXES_PER_MOUNTAIN) L.push(`  ...and ${m.fixes.length - MAX_FIXES_PER_MOUNTAIN} more (tools/map_fixes.mjs ${p.resort})`);
  }
}

/**
 * The email for one day. `parts`: [{resort, reports: [new reports, oldest first], problems: [scored, see confidence.js],
 * days (map-help ski days at the mountain), mapHelp (mapHelpPart, optional)}]. Returns {subject, text}, or null when
 * there is nothing new.
 */
export function buildDigest(parts, now = Date.now()) {
  const withNew = parts.filter((p) => p.reports?.length);
  const helpOnly = parts.filter((p) => !p.reports?.length && (p.mapHelp?.share?.yesterday || p.mapHelp?.places.length || p.mapHelp?.fixes.length));
  if (!withNew.length && !helpOnly.length) return null;
  const total = withNew.reduce((s, p) => s + p.reports.length, 0);
  const subject = withNew.length
    ? `SkiWithMe map reports: ${plural(total, 'new report')} at ${plural(withNew.length, 'mountain')} (${day(now)})`
    : `SkiWithMe map help: ${plural(helpOnly.length, 'mountain')} (${day(now)})`;
  const L = [];
  L.push(withNew.length ? `${plural(total, 'new map-mistake report')} since the last digest.` : 'No new map-mistake reports today; map help from skiers below.');
  L.push('');
  L.push('Confidence says how sure we are that a problem is real: low, medium or high. It counts separate phones that');
  L.push('reported it, whether a reporter was standing near the spot, map-help GPS counts (only places reached by 5 or');
  L.push('more ski days), and age (reports fade out over 60 days). Nothing on the map changes by itself: "safe" fixes go');
  L.push('into a weekly pull request for review, "needs review" ones wait for a person.');
  L.push('Reports about a run or lift are one problem per run or lift, wherever on it they were sent; reports about no');
  L.push('run or lift (a missing run, runs that do not connect) are one problem per spot.');
  for (const p of withNew) {
    const name = resortName(p.resort);
    const byReport = new Map();
    const byReply = new Map();
    for (const pr of p.problems || []) {
      for (const id of pr.reports) byReport.set(id, pr);
      for (const id of pr.replies?.ids || []) byReply.set(id, pr);
    }
    L.push('');
    L.push(`== ${name} (${p.resort}): ${plural(p.reports.length, 'new report')} ==`);
    L.push(`Open the mountain in the app: ${appLink(p.resort)}`);
    const shown = p.reports.slice(-MAX_REPORTS_PER_MOUNTAIN);
    if (shown.length < p.reports.length) L.push(`(Showing the newest ${shown.length}; the full list is at ${SITE}/api/reports/${p.resort})`);
    shown.forEach((r, i) => {
      L.push('');
      if (r.about) {
        // a reply to a known problem: "this spot is fine" or "it has been fixed" (lowers the problem's confidence)
        L.push(`${i + 1}. ${KIND_NAMES[r.kind] || r.kind}, about "${KIND_NAMES[r.about] || r.about}"${r.name ? `: ${oneLine(r.name)}` : ''}  [report #${r.id}, ${when(r.at)}]`);
        L.push(`   Spot: ${spotText(r)}`);
        L.push(`   Reporter's GPS: ${Number.isFinite(r.near) ? `${r.near} m from the spot when sent` : 'not known'}`);
        const pr = byReply.get(r.id);
        L.push(pr ? `   Answers the problem with reports ${pr.reports.map((id) => '#' + id).join(', ')}, now ${pr.level.toUpperCase()} (score ${pr.score})`
          : '   Answers no open problem (it was closed or its reports are too old)');
        return;
      }
      L.push(`${i + 1}. ${KIND_NAMES[r.kind] || r.kind}${r.name ? `: ${oneLine(r.name)}` : ' (not on a named run)'}  [report #${r.id}, ${when(r.at)}]`);
      if (Number.isInteger(r.should)) L.push(`   It should be: ${ratingName(r.scale, r.should)}`);
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
        L.push(`- ${pr.level.toUpperCase()} ${pr.score}  ${KIND_NAMES[pr.kind] || pr.kind}${pr.name ? `: ${oneLine(pr.name)}${pr.lift ? ' (lift)' : ''}` : ''}${pr.should ? ` -> should be ${pr.should.name}` : ''}  (reports ${pr.reports.map((id) => '#' + id).join(', ')})`);
        L.push(`    ${pr.by === 'thing' && Number.isFinite(pr.lat) ? 'Latest spot' : 'Spot'}: ${spotText(pr)}`);
        for (const w of pr.why) L.push(`    ${w}`);
      }
      if ((p.problems || []).length > probs.length) L.push(`  ...and ${p.problems.length - probs.length} more: ${SITE}/api/reports/${p.resort}/problems`);
    }
    mapHelpLines(p, L);
  }
  for (const p of helpOnly) {
    L.push('');
    L.push(`== ${resortName(p.resort)} (${p.resort}): map help, ${plural(p.mapHelp.days, 'ski day')} so far ==`);
    L.push(`Open the mountain in the app: ${appLink(p.resort)}`);
    mapHelpLines(p, L);
  }
  L.push('');
  L.push('--');
  L.push('Sent once a day by the SkiWithMe Worker, only on days with new reports or map help. Reports are anonymous public');
  L.push('notes; map help is counts only. How this works: docs/MAP_REPORTS.md in the repository.');
  return { subject, text: L.join('\n') + '\n' };
}

/** The live resort.json of a mountain (R2 or the static files), or null. Read only, never written. */
export async function loadMap(env, id) {
  try {
    if (inR2(id) && env.MAPS) {
      const o = await env.MAPS.get(`data/${id}/resort.json`);
      return o ? await o.json() : null;
    }
    if (env.ASSETS) {
      const r = await env.ASSETS.fetch(new Request(`${SITE}/data/${id}/resort.json`));
      return r.ok ? await r.json() : null;
    }
  } catch { /* the email goes out without nearest runs and suggestions */ }
  return null;
}

// ---------------------------------------------------------------- sending, through Resend (as the sign-in emails)
export const RESEND_URL = 'https://api.resend.com/emails';

/** Is the digest switched on? Needs the sign-in mail account (RESEND_API_KEY secret, MAIL_FROM) and an inbox. */
export function digestConfig(env) {
  const to = env.REPORT_DIGEST_TO, from = env.MAIL_FROM, key = env.RESEND_API_KEY;
  if (!key || !from || !to) return null;
  return { to, from, key };
}

/** One plain-text email through Resend. Throws when Resend does not accept it, so nothing is marked as sent. */
export async function sendMail(env, cfg, mail, _now, fetchFn = fetch) {
  const res = await fetchFn(RESEND_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json', 'user-agent': 'weski-build' },
    body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject: oneLine(mail.subject), text: mail.text }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}`);
}


/**
 * The daily job. `log(env, id)` returns the ResortLog stub for a mountain (or the index). `send` is replaceable for tests.
 * Returns what happened, for the Worker's logs.
 */
export async function runDigest(env, log, now = Date.now(), send = sendMail, getMap = loadMap) {
  const cfg = digestConfig(env);
  if (!cfg) return { sent: false, why: 'switched off (no RESEND_API_KEY, MAIL_FROM or REPORT_DIGEST_TO)' };
  const index = log(env, DIGEST_INDEX);
  // digestDue claims the day in the same call (a Durable Object runs one call at a time), so if Cloudflare fires the
  // job twice at once, only one run goes on to send
  const state = await index.digestDue(day(now), now);
  if (state.sentToday) return { sent: false, why: 'already sent today' };
  if (state.busy) return { sent: false, why: 'another run is sending' };
  const unknown = state.resorts.filter((id) => !isKnownResort(id));
  const known = state.resorts.filter(isKnownResort).slice(0, DIGEST_MAX_MOUNTAINS);
  if (unknown.length) await index.digestDone(unknown, null, now);
  if (!known.length) { await index.digestRelease(); return { sent: false, why: 'nothing new' }; }
  const parts = [];
  for (const id of known) {
    const part = { resort: id, ...(await log(env, id).digestPart(now)) };
    const h = part.heat;
    // the map is needed only when map help has published something there
    const map = h && (Object.keys(h.cells || {}).length || Object.keys(h.runs || {}).length) ? await getMap(env, id) : null;
    part.mapHelp = mapHelpPart(id, h, map, part.problems, now);
    delete part.heat;
    parts.push(part);
  }
  const mail = buildDigest(parts, now);
  if (!mail) { await index.digestDone(known, null, now); await index.digestRelease(); return { sent: false, why: 'nothing new' }; }
  try { await send(env, cfg, mail, now); } catch (e) { await index.digestRelease(); throw e; }
  for (const p of parts) if (p.reports.length) await log(env, p.resort).digestSent(p.maxId);
  await index.digestDone(known, day(now), now);
  return { sent: true, mountains: parts.filter((p) => p.reports.length).length, reports: parts.reduce((s, p) => s + p.reports.length, 0), mapHelp: parts.filter((p) => p.mapHelp).length };
}
