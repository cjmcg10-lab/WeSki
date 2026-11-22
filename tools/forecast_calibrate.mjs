// Compares archived forecasts and their day scores with what happened and with skiers' "How was it?" answers.
// Run:  node tools/forecast_calibrate.mjs export-stowe.json export-killington.json
//       ARCHIVE_ADMIN_KEY=... node tools/forecast_calibrate.mjs --fetch https://skiwithme.builtbyroger.app --ids stowe,killington --since 2026-11-01 --save exports/
// Each export is the answer of GET /api/forecast-archive/<id> (docs/FORECAST_SCORING.md, "Calibration round 1").
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { scoreForecast, SCORING_VERSION } from '../src/forecast/score/index.js';

export const MIN_OBSERVED_SHARE = 0.6;
export const SCORE_BANDS = [[0, 40, 'under 40'], [40, 60, '40 to 59'], [60, 80, '60 to 79'], [80, 101, '80 and over']];
export const TAG_SHARE = 0.3;
const SKI_HOURS = [9, 16];

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

function ranks(xs) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

/** Rank correlation (ties share their average rank). Null for fewer than 3 pairs or when one side never changes. */
export function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const [a, b] = [ranks(xs), ranks(ys)];
  const [ma, mb] = [mean(a), mean(b)];
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va && vb ? cov / Math.sqrt(va * vb) : null;
}

export function meanRating(counts) {
  const total = counts.reduce((s, n) => s + n, 0);
  return total ? counts.reduce((s, n, i) => s + n * (i + 1), 0) / total : null;
}

/** One resort's exports merged: archive by issue time, feedback by date (the newest export has the latest counts), observed hours by hour. */
export function mergeExports(exports) {
  const byId = new Map();
  for (const e of exports) {
    const cur = byId.get(e.id) ?? { id: e.id, place: e.place, archive: new Map(), feedback: new Map(), histories: [] };
    for (const a of e.archive ?? []) cur.archive.set(a.issued, a);
    for (const f of e.feedback ?? []) cur.feedback.set(f.day, f);
    if (e.history) cur.histories.push(e.history);
    cur.place = e.place ?? cur.place;
    byId.set(e.id, cur);
  }
  return [...byId.values()].map((r) => ({ ...r, archive: [...r.archive.values()].sort((a, b) => a.issued - b.issued), feedback: [...r.feedback.values()] }));
}

/** The latest forecast issued on a day, for that day: the best estimate of how it scored without waiting for the day to end. */
export function nowcasts(archive) {
  const truth = new Map();
  for (const entry of archive) {
    const day = entry.days?.[0];
    if (day?.status === 'ok') truth.set(day.date, { score: day.score, window: day.window, peak: day.peak, entry });
  }
  return truth;
}

function observedWindows(resort, histories) {
  const out = new Map();
  for (const history of histories) {
    const weather = { summit: history.summit, base: history.base };
    const observed = history.summit?.hourly?.observed ?? [];
    const times = history.summit?.hourly?.time ?? [];
    const scored = scoreForecast({ id: resort.id, top: resort.place.top, base: resort.place.base }, weather);
    for (const day of scored.days) {
      if (day.status !== 'ok' || !day.window) continue;
      const wanted = times.map((t, i) => [t, i]).filter(([t]) => t.startsWith(day.date) && +t.slice(11, 13) >= SKI_HOURS[0] && +t.slice(11, 13) < SKI_HOURS[1]);
      const share = wanted.filter(([, i]) => observed[i]).length / (wanted.length || 1);
      if (share >= MIN_OBSERVED_SHARE) out.set(day.date, { start: day.window.start, end: day.window.end, score: day.score });
    }
  }
  return out;
}

function leadTime(resorts) {
  const byLead = new Map();
  for (const r of resorts) {
    const truth = nowcasts(r.archive);
    for (const entry of r.archive) {
      entry.days.forEach((day, lead) => {
        const t = truth.get(day.date);
        if (day.status !== 'ok' || !t || t.entry === entry) return;
        (byLead.get(lead) ?? byLead.set(lead, []).get(lead)).push(day.score - t.score);
      });
    }
  }
  return [...byLead].sort((a, b) => a[0] - b[0]).map(([lead, errs]) => ({ lead, n: errs.length, mae: round(mean(errs.map(Math.abs))), bias: round(mean(errs)) }));
}

function windowTiming(resorts) {
  const byLead = new Map();
  for (const r of resorts) {
    const seen = observedWindows(r, r.histories);
    for (const entry of r.archive) {
      entry.days.forEach((day, lead) => {
        const obs = seen.get(day.date);
        if (day.status !== 'ok' || !day.window || !obs) return;
        (byLead.get(lead) ?? byLead.set(lead, []).get(lead)).push(day.window.start - obs.start);
      });
    }
  }
  return [...byLead].sort((a, b) => a[0] - b[0]).map(([lead, d]) => ({
    lead, n: d.length, meanAbsHours: round(mean(d.map(Math.abs))), withinOneHour: round(d.filter((x) => Math.abs(x) <= 1).length / d.length),
  }));
}

function ratingPairs(resorts, minAnswers) {
  const pairs = [];
  for (const r of resorts) {
    const truth = nowcasts(r.archive);
    for (const f of r.feedback) {
      const n = f.ratings.reduce((s, x) => s + x, 0);
      const t = truth.get(f.day);
      if (n >= minAnswers && t) pairs.push({ id: r.id, date: f.day, score: t.score, rating: meanRating(f.ratings), answers: n, tags: f.tags });
    }
  }
  return pairs;
}

function resortRanking(pairs) {
  const byDate = new Map();
  for (const p of pairs) (byDate.get(p.date) ?? byDate.set(p.date, []).get(p.date)).push(p);
  const days = [...byDate.values()].filter((g) => g.length >= 2);
  const corr = days.map((g) => spearman(g.map((p) => p.score), g.map((p) => p.rating))).filter((x) => x != null);
  let agree = 0, compared = 0;
  for (const g of days) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (Math.abs(g[i].rating - g[j].rating) < 0.5 || g[i].score === g[j].score) continue;
        compared++;
        if ((g[i].score - g[j].score) * (g[i].rating - g[j].rating) > 0) agree++;
      }
    }
  }
  return { dates: days.length, meanSpearman: round(mean(corr)), pairsCompared: compared, concordance: compared ? round(agree / compared) : null };
}

function tagEffects(pairs) {
  const tags = new Set(pairs.flatMap((p) => Object.keys(p.tags)));
  return [...tags].sort().map((tag) => {
    const has = pairs.filter((p) => (p.tags[tag] ?? 0) / p.answers >= TAG_SHARE);
    const rest = pairs.filter((p) => !has.includes(p));
    return { tag, days: has.length, meanScore: round(mean(has.map((p) => p.score)), 1), otherMeanScore: round(mean(rest.map((p) => p.score)), 1) };
  });
}

/**
 * The calibration report for one or more resort exports. `version` keeps only forecasts scored by that SCORING_VERSION;
 * `minAnswers` is how many "How was it?" answers a day needs before it counts.
 */
export function analyse(exports, { version, minAnswers = 1 } = {}) {
  const merged = mergeExports(exports).map((r) => ({ ...r, archive: version ? r.archive.filter((a) => a.v === version) : r.archive }));
  const pairs = ratingPairs(merged, minAnswers);
  const versions = {};
  for (const r of merged) for (const a of r.archive) versions[a.v] = (versions[a.v] ?? 0) + 1;
  return {
    currentVersion: SCORING_VERSION,
    versions,
    resorts: merged.length,
    forecasts: merged.reduce((s, r) => s + r.archive.length, 0),
    scoreVsRating: {
      days: pairs.length,
      spearman: round(spearman(pairs.map((p) => p.score), pairs.map((p) => p.rating))),
      bands: SCORE_BANDS.map(([lo, hi, label]) => {
        const inBand = pairs.filter((p) => p.score >= lo && p.score < hi);
        return { band: label, days: inBand.length, meanRating: round(mean(inBand.map((p) => p.rating))) };
      }),
    },
    resortRanking: resortRanking(pairs),
    windowTiming: windowTiming(merged),
    leadTime: leadTime(merged),
    tags: tagEffects(pairs),
  };
}

const table = (rows) => rows.map((r) => `  ${Object.entries(r).map(([k, v]) => `${k} ${v ?? 'n/a'}`).join(' | ')}`).join('\n') || '  no data yet';

export function formatReport(r) {
  return [
    `Scoring version now ${r.currentVersion}; forecasts by version ${JSON.stringify(r.versions)} (${r.forecasts} forecasts, ${r.resorts} resorts)`,
    `Score against rating: ${r.scoreVsRating.days} days, rank correlation ${r.scoreVsRating.spearman ?? 'n/a'}`,
    table(r.scoreVsRating.bands),
    `Ranking between resorts on the same day: ${r.resortRanking.dates} dates, mean rank correlation ${r.resortRanking.meanSpearman ?? 'n/a'}, order agrees on ${r.resortRanking.concordance ?? 'n/a'} of ${r.resortRanking.pairsCompared} pairs`,
    'Best-window timing against observed hours, by lead in days:',
    table(r.windowTiming),
    'Score change against the same-day score, by lead in days:',
    table(r.leadTime),
    'Days tagged by skiers (at least 30% of answers):',
    table(r.tags),
  ].join('\n');
}

async function fetchExport(origin, id, sinceMs, key) {
  const res = await fetch(`${origin}/api/forecast-archive/${id}?since=${sinceMs}`, { headers: { 'x-admin-key': key, 'user-agent': 'weski-build' } });
  if (!res.ok) throw new Error(`${id}: ${res.status}`);
  return res.json();
}

const VALUE_OPTIONS = ['--fetch', '--ids', '--since', '--save', '--version', '--min-answers'];

function option(args, name) {
  const at = args.indexOf(name);
  return at < 0 ? null : args[at + 1];
}

async function main(args) {
  const files = args.filter((a, i) => !a.startsWith('--') && !VALUE_OPTIONS.includes(args[i - 1]));
  const exports = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const origin = option(args, '--fetch');
  if (origin) {
    const key = process.env.ARCHIVE_ADMIN_KEY;
    if (!key) throw new Error('Set ARCHIVE_ADMIN_KEY to the Worker secret ARCHIVE_ADMIN_SECRET.');
    const since = Date.parse(option(args, '--since') ?? '1970-01-01');
    const save = option(args, '--save');
    if (save) mkdirSync(save, { recursive: true });
    for (const id of (option(args, '--ids') ?? '').split(',').filter(Boolean)) {
      const out = await fetchExport(origin, id, since, key);
      if (save) writeFileSync(`${save}/export-${id}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out));
      exports.push(out);
    }
  }
  if (!exports.length) throw new Error('Give export files, or --fetch <origin> --ids a,b');
  const report = analyse(exports, { version: option(args, '--version') ?? undefined, minAnswers: Number(option(args, '--min-answers') ?? 1) });
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
