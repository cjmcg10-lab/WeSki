// Pure part of the usage alerts: use against each limit, the 7-day trend, the days until 70% and 90%, the alert level and
// the plain advice. No network here, so it is tested with made-up numbers (tests/usage.test.js). See docs/USAGE_ALERTS.md.
import { LEVELS, THRESHOLDS, URGENT_DAYS, CHECKED, NOT_LIMITED, limitsFor } from './limits.mjs';

const DAY = 86400e3;
export const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const monthOf = (date) => date.slice(0, 7);
const daysInMonth = (date) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).getUTCDate();
const worse = (a, b) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);

/** Least-squares line through [x, y] points: {slope, at(x)}; slope 0 with fewer than 3 points. */
export function trend(ys) {
  const n = ys.length;
  if (n < 3) return { slope: 0, at: () => (n ? ys[n - 1] : 0) };
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) ** 2; });
  const slope = num / den;
  return { slope, at: (x) => my + slope * (x - mx) };
}

/** Round to a readable size: 72,345 -> "72,300"; 4,120,000 -> "4.12 million". */
export function fmt(v, unit) {
  if (v == null || !Number.isFinite(v)) return '?';
  if (unit === 'GB') return `${v < 10 ? v.toFixed(2) : v.toFixed(1)} GB`;
  if (unit === '% of requests') return `${v < 0.1 && v > 0 ? v.toFixed(3) : v.toFixed(2)}%`;
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toPrecision(3)} billion`;
  if (a >= 1e6) return `${+(v / 1e6).toPrecision(3)} million`;
  if (a >= 1000) return Number(v.toPrecision(3)).toLocaleString('en-US');
  return String(Math.round(v * 10) / 10);
}
const money = (d) => (d < 1 ? `under $1` : `about $${d < 100 ? d.toFixed(2) : Math.round(d)}`);
const dateText = (date) => new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const inDays = (d) => (d == null ? 'not on course' : d === 0 ? 'now' : d > 365 ? 'over a year' : `${d} day${d === 1 ? '' : 's'}`);

/**
 * Assess one limit. `points` are daily values [{date, value}] (UTC dates; for a "level" limit the amount held that day).
 * `today` is today's UTC date: its value, if any, is only part of a day and is left out of daily trends.
 */
export function assess(limit, points, today) {
  const pts = (points || []).filter((p) => p.date <= today && Number.isFinite(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const done = pts.filter((p) => p.date < today);
  const base = { ...limit, level: 'ok' };
  if (!pts.length) return { ...base, measured: false };
  const last7 = done.slice(-7);
  const line = trend(last7.map((p) => p.value));
  const slope = line.slope; // change per day
  let current, pct, days = {}, monthEnd = null, projectedPct = null;
  if (limit.period === 'month') {
    const month = pts.filter((p) => monthOf(p.date) === monthOf(today));
    const recorded = month.reduce((a, p) => a + p.value, 0);
    const todayRec = month.find((p) => p.date === today)?.value || 0;
    const predict = (k) => Math.max(0, line.at(last7.length - 1 + k)); // k days after the last full day
    // today counts as the larger of what is recorded so far and a full day at the trend
    const cum = recorded - todayRec + Math.max(todayRec, last7.length ? predict(1) : todayRec);
    current = recorded;
    const left = daysInMonth(today) - +today.slice(8, 10);
    const cross = (share) => {
      if (recorded >= share * limit.limit) return 0;
      let c = cum;
      if (c >= share * limit.limit) return 1;
      for (let d = 1; d <= left; d++) { c += predict(1 + d); if (c >= share * limit.limit) return d + 1; }
      return null; // not before the allowance starts again on the 1st
    };
    monthEnd = cum;
    for (let d = 1; d <= left; d++) monthEnd += predict(1 + d);
    projectedPct = (monthEnd / limit.limit) * 100;
    days = { 70: cross(0.7), 90: cross(0.9), 100: cross(1) };
  } else {
    // a daily limit is judged on the last full day; a stored amount on the latest reading
    const ref = limit.period === 'day' ? done[done.length - 1] || pts[pts.length - 1] : pts[pts.length - 1];
    current = ref.value;
    const until = (share) => (current >= share * limit.limit ? 0 : slope > 0 ? Math.ceil((share * limit.limit - current) / slope - 1e-9) : null);
    days = { 70: until(0.7), 90: until(0.9), 100: until(1) };
  }
  pct = (current / limit.limit) * 100;
  let level = pct >= THRESHOLDS.urgent ? 'urgent' : pct >= THRESHOLDS.warning ? 'warning' : pct >= THRESHOLDS.notice ? 'notice' : 'ok';
  if (days[100] != null && days[100] <= URGENT_DAYS) level = 'urgent';
  if (projectedPct != null) {
    if (projectedPct >= 100) level = worse(level, 'warning');
    else if (projectedPct >= THRESHOLDS.warning) level = worse(level, 'notice');
  }
  const out = { ...base, measured: true, current, pct, slope, days, monthEnd, projectedPct, level, latest: pts[pts.length - 1].date };
  out.advice = advice(out, today);
  return out;
}

/** The plain sentence for one assessed limit. */
export function advice(a, today) {
  const u = a.unit === 'GB' || a.unit === '% of requests' ? '' : ` ${a.unit}`;
  const allowance = a.included ? 'included' : 'free';
  let s;
  if (a.period === 'month') {
    s = `${a.name}: ${fmt(a.current, a.unit)}${u} so far this month (${Math.round(a.pct)}% of the ${allowance} ${fmt(a.limit, a.unit)}${u}); `
      + `on course for ${fmt(a.monthEnd, a.unit)} (${Math.round(a.projectedPct)}%) by ${dateText(addDays(today.slice(0, 8) + '01', daysInMonth(today) - 1))}.`;
  } else if (a.period === 'day') {
    s = `${a.name} reached ${fmt(a.current, a.unit)}${u} a day (${Math.round(a.pct)}% of the ${allowance} ${fmt(a.limit, a.unit)}${u}).`;
  } else {
    s = `${a.name}: ${fmt(a.current, a.unit)}${u} stored (${Math.round(a.pct)}% of the ${allowance} ${fmt(a.limit, a.unit)}${u}).`;
  }
  if (a.days[100] === 0) s += ' The limit is already reached.';
  else if (a.days[100] != null) s += ` At this growth you reach the limit in about ${inDays(a.days[100])}.`;
  else if (a.period !== 'month' && a.slope <= 0) s += ' Not growing over the last 7 days.';
  else if (a.period === 'month') s += ' Not on course to reach the limit this month.';
  if (a.level === 'ok') return s;
  if (a.extraCost) {
    const over = Math.max(0, (a.period === 'month' ? a.monthEnd : a.current) - a.limit);
    s += over > 0 ? ` Going over would cost ${money(a.extraCost(over))}${a.period === 'month' ? ' this month' : ' a month'} at this rate.` : '';
  }
  if (a.hard) s += ` ${a.hard}`;
  return `${s} Next step: ${a.next}`;
}

/**
 * Assess every limit of a plan. `data` = {series: {limitId: points}, missing: {limitId: why}, selfCount, notes}.
 * Returns {plan, today, level, rows, unmeasured, notes}.
 */
export function assessAll(data, { plan = 'free', today }) {
  const rows = [], unmeasured = [];
  for (const limit of limitsFor(plan)) {
    let pts = data.series?.[limit.id];
    // Cloudflare answered but listed nothing: nothing was used (an error is kept in `missing` instead)
    if (!pts?.length && !limit.selfCount && !data.missing?.[limit.id]) pts = [{ date: today, value: 0 }];
    const r = assess(limit, pts, today);
    if (r.measured) rows.push(r);
    else unmeasured.push({ ...r, why: data.missing?.[limit.id] || (limit.selfCount ? 'needs the Worker self-count (USAGE_SECRET); sign-in emails are not in use yet' : 'no data returned') });
  }
  let level = rows.reduce((l, r) => worse(l, r.level), 'ok');
  // a Cloudflare figure that cannot be read at all is itself worth a notice: the alerts are blind there
  const blind = unmeasured.filter((u) => !u.selfCount);
  if (blind.length) level = worse(level, 'notice');
  return { plan, today, level, rows, unmeasured, blind: blind.length, notes: data.notes || [], selfCount: data.selfCount || null };
}

export const LEVELS_TEXT = { ok: 'OK', notice: 'Notice', warning: 'Warning', urgent: 'URGENT' };

/** The issue or summary text, in Markdown. `state` is kept in a hidden comment so the next run can tell what got worse. */
export function report(r, { title = 'Usage against plan limits' } = {}) {
  const L = [];
  L.push(`## ${title}: ${LEVELS_TEXT[r.level]}`, '');
  L.push(`Checked ${r.today} (UTC). Cloudflare plan assumed: **Workers ${r.plan === 'paid' ? 'Paid' : 'Free'}** `
    + `(repository variable CF_WORKERS_PLAN). Levels: notice at 60%, warning at 80%, urgent at 90% or when the limit is `
    + `reached within ${URGENT_DAYS} days at the current growth.`, '');
  const act = r.rows.filter((x) => x.level !== 'ok').sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level));
  if (act.length) {
    L.push('### What to do', '');
    for (const x of act) L.push(`- **${LEVELS_TEXT[x.level]}**: ${x.advice}`);
    L.push('');
  } else L.push('Everything is under 60% of its limit and not on course to reach it within two weeks. Nothing to do.', '');
  if (r.unmeasured.length) {
    L.push('### Not measured', '');
    for (const u of r.unmeasured) L.push(`- ${u.name}: ${u.why}`);
    if (r.blind) L.push('', 'To fix a Cloudflare figure that cannot be read, see "Token permission" in docs/USAGE_ALERTS.md.');
    L.push('');
  }
  L.push('### All limits', '', '| Level | What | Used | Limit | Change a day (7 days) | 70% in | 90% in |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const x of r.rows) {
    const used = x.period === 'month' ? `${fmt(x.current, x.unit)} this month (${Math.round(x.pct)}%), ${Math.round(x.projectedPct)}% by month end`
      : `${fmt(x.current, x.unit)} (${Math.round(x.pct)}%)`;
    const per = x.unit === '% of requests' ? ' of requests' : x.period === 'day' ? ' a day' : x.period === 'month' ? ' a month' : '';
    const ch = x.slope ? `${x.slope > 0 ? '+' : '−'}${fmt(Math.abs(x.slope), x.unit)}` : 'flat';
    L.push(`| ${LEVELS_TEXT[x.level]} | ${x.name} | ${used} | ${fmt(x.limit, x.unit)}${per} | ${ch} | ${inDays(x.days[70])} | ${inDays(x.days[90])} |`);
  }
  L.push('');
  if (r.notes.length) { L.push('### Notes', ''); for (const n of r.notes) L.push(`- ${n}`); L.push(''); }
  if (r.selfCount?.length) {
    L.push('### The app\'s own count (yesterday, UTC)', '', '| What | Count |', '| --- | --- |');
    for (const [k, n] of r.selfCount) L.push(`| ${k} | ${n.toLocaleString('en-US')} |`);
    L.push('');
  }
  L.push('### Not limited', '');
  for (const [k, v] of NOT_LIMITED) L.push(`- ${k}: ${v}`);
  L.push('', `Limits from ${CHECKED}. Sources: ${[...new Set(r.rows.concat(r.unmeasured).map((x) => x.source))].join('; ')}.`);
  L.push('', `<!-- usage-state ${JSON.stringify(stateOf(r))} -->`);
  return L.join('\n');
}

/** What the next run compares with: the level of each limit. */
export const stateOf = (r) => ({ level: r.level, rows: Object.fromEntries(r.rows.map((x) => [x.id, x.level])) });
export const readState = (body) => { try { return JSON.parse(/<!-- usage-state (.*?) -->/.exec(body || '')?.[1]); } catch { return null; } };

/** True when this run is worse than the stored one: the overall level rose, or any one limit rose. */
export function gotWorse(prev, r) {
  if (!prev) return r.level !== 'ok';
  if (LEVELS.indexOf(r.level) > LEVELS.indexOf(prev.level)) return true;
  return r.rows.some((x) => LEVELS.indexOf(x.level) > LEVELS.indexOf(prev.rows?.[x.id] || 'ok'));
}
