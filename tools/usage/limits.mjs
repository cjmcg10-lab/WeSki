// The allowances SkiWithMe runs inside, and what the next step up costs. See docs/USAGE_ALERTS.md.
//
// CHECKED: the date and source of these figures. On 2026-11-23 the Cloudflare and Resend docs could not be opened from
// the build container (their hosts are not on its network list), so every figure below is from memory of those pages
// and must be checked against them before money is spent: change the numbers here and the date in CHECKED.
export const CHECKED = '2026-11-23 (from memory, not re-read: see docs/USAGE_ALERTS.md)';

// Alert levels, from the owner's request: notice 60%, warning 80%, urgent 90% or the limit reached within 14 days.
export const LEVELS = ['ok', 'notice', 'warning', 'urgent'];
export const THRESHOLDS = { notice: 60, warning: 80, urgent: 90 };
export const URGENT_DAYS = 14;

const WORKERS_PAID = 'Move the Cloudflare account to the Workers Paid plan: $5 a month for the whole account. '
  + 'Cloudflare dashboard > Workers & Pages > Plans (Overview > "Upgrade"), then set the repository variable '
  + 'CF_WORKERS_PLAN to "paid" (GitHub > Settings > Secrets and variables > Actions > Variables) so these alerts use the paid allowances.';

const perMillion = (price) => (extra) => (extra / 1e6) * price;

/**
 * One entry per thing watched. `period`: "day" (resets 00:00 UTC each day), "month" (resets on the 1st, UTC) or "level"
 * (a stored amount that does not reset). `limit` is the free or included amount; `extraCost(amountOver)` is the price
 * of going over it in dollars, where going over is simply billed; `next` is what to do about it.
 */
export const PLANS = {
  free: [
    { id: 'workers_requests', name: 'Worker requests (whole Cloudflare account)', unit: 'requests', period: 'day', limit: 100000,
      source: 'Cloudflare Workers pricing, free plan: 100,000 requests a day',
      next: `${WORKERS_PAID} It includes 10 million requests a month (about 330,000 a day), then $0.30 per extra million.`,
      hard: 'Over the limit, the app\'s /api and /data requests fail with an error for the rest of the day (UTC).' },
    { id: 'workers_cpu', name: 'Worker requests stopped for using too much CPU', unit: '% of requests', period: 'day', limit: 1,
      source: 'Cloudflare Workers limits, free plan: 10 ms of CPU per request',
      next: `${WORKERS_PAID} Paid requests may use up to 30 seconds of CPU (30 million CPU ms a month included, then $0.02 per extra million ms).`,
      hard: 'Requests over the CPU limit fail.' },
    { id: 'do_requests', name: 'Durable Object requests (groups, accounts, forecast history)', unit: 'requests', period: 'day', limit: 100000,
      source: 'Cloudflare Durable Objects pricing, free plan: 100,000 requests a day',
      next: `${WORKERS_PAID} It includes 1 million Durable Object requests a month, then $0.15 per extra million.`,
      hard: 'Over the limit, groups, sign-in and forecast history stop working until 00:00 UTC.' },
    { id: 'do_duration', name: 'Durable Object duration', unit: 'GB-s', period: 'day', limit: 13000,
      source: 'Cloudflare Durable Objects pricing, free plan: 13,000 GB-s a day',
      next: `${WORKERS_PAID} It includes 400,000 GB-s a month, then $12.50 per extra million GB-s.`,
      hard: 'Over the limit, Durable Objects stop until 00:00 UTC.' },
    { id: 'do_rows_read', name: 'Durable Object database rows read', unit: 'rows', period: 'day', limit: 5e6,
      source: 'Cloudflare Durable Objects pricing (SQLite storage), free plan: 5 million rows read a day',
      next: `${WORKERS_PAID} It includes 25 billion rows read a month, then $0.001 per extra million.` },
    { id: 'do_rows_written', name: 'Durable Object database rows written', unit: 'rows', period: 'day', limit: 100000,
      source: 'Cloudflare Durable Objects pricing (SQLite storage), free plan: 100,000 rows written a day',
      next: `${WORKERS_PAID} It includes 50 million rows written a month, then $1.00 per extra million.` },
    { id: 'do_storage', name: 'Durable Object stored data', unit: 'GB', period: 'level', limit: 5,
      source: 'Cloudflare Durable Objects pricing (SQLite storage), free plan: 5 GB in all',
      next: `${WORKERS_PAID} It includes 5 GB-month, then $0.20 per extra GB-month.` },
  ],
  paid: [
    { included: true, id: 'workers_requests', name: 'Worker requests (whole Cloudflare account)', unit: 'requests', period: 'month', limit: 10e6,
      extraCost: perMillion(0.30), source: 'Cloudflare Workers pricing, Paid plan: 10 million a month included, then $0.30 per million',
      next: 'Nothing to switch on: extra requests are billed at $0.30 per million on the monthly Cloudflare bill.' },
    { included: true, id: 'workers_cpu_ms', name: 'Worker CPU time (whole account)', unit: 'CPU ms', period: 'month', limit: 30e6,
      extraCost: perMillion(0.02), source: 'Cloudflare Workers pricing, Paid plan: 30 million CPU ms a month included, then $0.02 per million ms',
      next: 'Nothing to switch on: extra CPU time is billed at $0.02 per million ms.' },
    { included: true, id: 'do_requests', name: 'Durable Object requests', unit: 'requests', period: 'month', limit: 1e6,
      extraCost: perMillion(0.15), source: 'Cloudflare Durable Objects pricing, Paid plan: 1 million a month included, then $0.15 per million',
      next: 'Nothing to switch on: billed at $0.15 per extra million.' },
    { included: true, id: 'do_duration', name: 'Durable Object duration', unit: 'GB-s', period: 'month', limit: 400000,
      extraCost: perMillion(12.5), source: 'Cloudflare Durable Objects pricing, Paid plan: 400,000 GB-s a month included, then $12.50 per million GB-s',
      next: 'Nothing to switch on: billed at $12.50 per extra million GB-s.' },
    { included: true, id: 'do_rows_read', name: 'Durable Object database rows read', unit: 'rows', period: 'month', limit: 25e9,
      extraCost: perMillion(0.001), source: 'Cloudflare Durable Objects pricing, Paid plan: 25 billion rows read a month included',
      next: 'Nothing to switch on: billed at $0.001 per extra million rows.' },
    { included: true, id: 'do_rows_written', name: 'Durable Object database rows written', unit: 'rows', period: 'month', limit: 50e6,
      extraCost: perMillion(1), source: 'Cloudflare Durable Objects pricing, Paid plan: 50 million rows written a month included',
      next: 'Nothing to switch on: billed at $1.00 per extra million rows.' },
    { included: true, id: 'do_storage', name: 'Durable Object stored data', unit: 'GB', period: 'level', limit: 5,
      extraCost: (gb) => gb * 0.2, source: 'Cloudflare Durable Objects pricing, Paid plan: 5 GB-month included, then $0.20 per GB-month',
      next: 'Nothing to switch on: billed at $0.20 per extra GB a month.' },
  ],
  // the same on either Workers plan
  both: [
    { id: 'r2_storage', name: 'R2 map storage (all buckets)', unit: 'GB', period: 'level', limit: 10,
      extraCost: (gb) => gb * 0.015, source: 'Cloudflare R2 pricing, Standard storage: 10 GB-month free, then $0.015 per GB-month',
      next: 'Nothing to switch on: R2 keeps working and bills storage over 10 GB at $0.015 per GB a month to the card on the Cloudflare account. '
        + 'To stay free instead, delete old map versions: `node tools/maps_r2.mjs` lists what is stored.' },
    { id: 'r2_class_a', name: 'R2 writes and lists (Class A)', unit: 'operations', period: 'month', limit: 1e6,
      extraCost: perMillion(4.5), source: 'Cloudflare R2 pricing: 1 million Class A operations a month free, then $4.50 per million',
      next: 'Nothing to switch on: billed at $4.50 per extra million. Writes come from map uploads (`tools/maps_r2.mjs push`, the preview); '
        + 'lists from map tools. Upload fewer times or only changed files to stay free.' },
    { id: 'r2_class_b', name: 'R2 reads (Class B)', unit: 'operations', period: 'month', limit: 10e6,
      extraCost: perMillion(0.36), source: 'Cloudflare R2 pricing: 10 million Class B operations a month free, then $0.36 per million',
      next: 'Nothing to switch on: billed at $0.36 per extra million. Reads come from phones opening maps and from every '
        + 'Deploy and Checks run pulling all maps; longer caching of map files in worker/maps.js would cut them.' },
    { id: 'resend_month', name: 'Sign-in emails (Resend)', unit: 'emails', period: 'month', limit: 3000,
      source: 'Resend pricing, free plan: 3,000 emails a month', selfCount: true,
      next: 'Move to Resend Pro: $20 a month for 50,000 emails a month and no daily limit. resend.com > Settings > Billing.' },
    { id: 'resend_day', name: 'Sign-in emails in one day (Resend)', unit: 'emails', period: 'day', limit: 100,
      source: 'Resend pricing, free plan: 100 emails a day', selfCount: true,
      next: 'Move to Resend Pro: $20 a month, no daily limit. resend.com > Settings > Billing.',
      hard: 'Over the limit, sign-in emails are refused until the next day.' },
  ],
};

/** Things that need no alert, listed in every report so the owner knows they were considered. */
export const NOT_LIMITED = [
  ['Static files (the app itself)', 'Requests for the app\'s own files are served without running the Worker and are free and unlimited. Only /api/* and /data/* run the Worker and count as Worker requests.'],
  ['Outside requests (weather, resort status)', 'Not billed. The free plan allows 50 outside requests per incoming request; the app makes one or two. The self-count shows how many are made a day.'],
  ['GitHub Actions minutes', 'The repository is public, so GitHub-hosted runners (Linux and macOS) cost nothing.'],
  ['Paddle', 'No plan limits: Paddle takes 5% + 50 cents per sale.'],
  ['KV', 'Not used by the app.'],
];

export const limitsFor = (plan) => [...(plan === 'paid' ? PLANS.paid : PLANS.free), ...PLANS.both];
