# Usage alerts

Built 2026-11-23 (issue #116). A daily check that warns before SkiWithMe outgrows the free (or included) allowances of
the services it runs on, and says exactly what to add or upgrade, what it costs and how much room it gives.

## In short

- **Every day at 07:17 UTC** the GitHub workflow "Usage alerts" (`.github/workflows/usage.yml`) reads Cloudflare's own
  usage figures (read-only), works out each figure against its limit, the trend over the last 7 days and how many days
  remain until 70%, 90% and 100%.
- **One GitHub issue labelled `usage-alert`** is opened when anything needs attention, updated each day, and closed
  when everything is back under 60%. GitHub emails the repository owners when it opens and whenever something gets
  worse (the check adds a comment then; quiet daily updates only edit the text, so they send no email).
- **Every Monday** a summary comment is added to the standing issue "Usage: weekly summary" (label `usage-summary`),
  even when all is fine. Chosen **on** by default so a broken check is noticed: if the Monday email stops coming, the
  check has stopped. One email a week. Set the repository variable `USAGE_WEEKLY` to `off` to stop it.
- Each run's full table is also on the run's page under GitHub → Actions → Usage alerts.
- The workflow runs only once it is on `main` (GitHub runs scheduled workflows from the default branch). After merging,
  run it once by hand: Actions → Usage alerts → Run workflow (tick "Also post the weekly summary now" to see one).

## Levels

| Level | When |
| --- | --- |
| Notice | 60% of a limit or more; or a monthly figure on course for 80% by month end; or a Cloudflare figure that cannot be read |
| Warning | 80% or more; or a monthly figure on course to pass the limit before the month ends |
| Urgent | 90% or more, or the limit reached within 14 days at the current growth |

"Growth" is a straight line through the last 7 full days (UTC). Daily limits are judged on the last full day (today's
part-day is left out); monthly ones on the month so far plus the trend to the end of the month; stored amounts on the
latest reading. A daily limit resets at 00:00 UTC, a monthly one on the 1st.

## What is watched

Figures from memory of the providers' pricing pages. On 2026-11-23 those pages (developers.cloudflare.com, resend.com)
could not be opened from the build container, so **check them before spending money** and correct
`tools/usage/limits.mjs` (and its `CHECKED` date) if anything moved.

### On the Workers Free plan (assumed until the variable `CF_WORKERS_PLAN` is set to `paid`)

| What | Free allowance | What happens over it | Next step and cost | Source |
| --- | --- | --- | --- | --- |
| Worker requests, whole Cloudflare account | 100,000 a day | /api and /data requests fail until 00:00 UTC | Workers Paid, $5/month for the account: 10 million requests a month (about 330,000 a day), then $0.30 per million | developers.cloudflare.com/workers/platform/pricing |
| Worker CPU | 10 ms per request | that request fails | Workers Paid: up to 30 s per request; 30 million CPU ms a month, then $0.02 per million ms | developers.cloudflare.com/workers/platform/limits |
| Durable Object requests (groups, accounts, forecast history) | 100,000 a day | Durable Objects stop until 00:00 UTC | Workers Paid: 1 million a month, then $0.15 per million | developers.cloudflare.com/durable-objects/platform/pricing |
| Durable Object duration | 13,000 GB-s a day | as above | Workers Paid: 400,000 GB-s a month, then $12.50 per million GB-s | same |
| Durable Object rows read / written | 5 million / 100,000 a day | as above | Workers Paid: 25 billion / 50 million a month | same |
| Durable Object stored data | 5 GB | writes fail | Workers Paid: 5 GB-month, then $0.20 per GB-month | same |

### On either plan

| What | Free allowance | Over it | Source |
| --- | --- | --- | --- |
| R2 map storage, all buckets | 10 GB-month | billed $0.015 per GB-month | developers.cloudflare.com/r2/pricing |
| R2 Class A (writes, lists) | 1 million a month | billed $4.50 per million | same |
| R2 Class B (reads) | 10 million a month | billed $0.36 per million | same |
| Sign-in emails (Resend) | 3,000 a month, 100 a day | refused; Resend Pro $20/month gives 50,000 a month and no daily limit | resend.com/pricing |

R2 has no plan to upgrade: past the free amount it keeps working and bills the card on the Cloudflare account.

### Considered and not limited

- **Static files** (the app's own pages, scripts, icons): served without running the Worker, free and unlimited. Only
  `/api/*` and `/data/*` run the Worker (`run_worker_first` in `wrangler.assets.jsonc`), so only those count.
- **Outside requests** (weather from NWS and MET Norway, resort status): not billed; the free plan allows 50 per
  incoming request and the app makes one or two. The Worker's own count (below) shows how many a day.
- **KV**: not used. **GitHub Actions**: the repository is public, so minutes cost nothing (macOS runners included).
- **Paddle**: no plan limits (5% + 50 cents a sale). **TestFlight / Apple**: not needed.

### Worth knowing (first real reading, 2026-11-23)

- The free 100,000 Worker requests a day are shared by **every Worker in the Cloudflare account**. The account also
  runs other Workers (the preview and other projects); on 22 November it served 5,620 requests in all, of which the
  `skiwithme` Worker made 2,650. The check counts the whole account and names the app's share.
- R2 reads were about 30,000 a day on 22 and 23 November, mostly from map uploads and every Deploy and Checks run
  pulling all maps (probably: the app's Worker served only about 2,600 requests a day), not from phones. 61,700 so far this month against 10 million.
- R2 storage: 0.27 GB of 10 GB.
- The app's Worker used up to 60-96 ms of CPU at the 99th percentile on 21-23 November, above the free plan's 10 ms,
  yet no request was stopped for CPU. Either the account is already on Workers Paid or Cloudflare's free-plan
  allowance absorbed it. **Check the plan** (Cloudflare dashboard → Workers & Pages → Plans) and set
  `CF_WORKERS_PLAN` to match. The check watches the share of requests stopped for CPU and alerts at 1%.

## Reading an alert

Each limit gets one sentence, for example:

> Worker requests (whole Cloudflare account) reached 72,000 requests a day (72% of the free 100,000 requests). At
> this growth you reach the limit in about 10 days. Next step: Move the Cloudflare account to the Workers Paid plan: $5
> a month for the whole account. Cloudflare dashboard > Workers & Pages > Plans …

The table under it lists every limit with the amount used, the change per day over the last week and the days until
70% and 90%. "Not measured" lists figures that could not be read and why.

## One-time steps for the owner

1. **Token permission (needed).** The workflow uses the existing GitHub secret `CLOUDFLARE_API_TOKEN`. It needs
   permission to read analytics. In this session the environment's Cloudflare token could read every figure, but the
   GitHub secret may be a different token. If the first alert says "Cloudflare refused the analytics read":
   1. Cloudflare dashboard → the person icon top right → **My Profile** → **API Tokens**.
   2. Find the token used by GitHub (the one the Deploy workflow uses) → **⋯** → **Edit**.
   3. Under **Permissions**, **+ Add more**: choose **Account**, then **Account Analytics**, then **Read**.
   4. **Continue to summary** → **Update token**. The token's value does not change, so nothing in GitHub changes.
2. **Which Workers plan (recommended).** Check Workers & Pages → Plans. If it says Paid, add the repository variable
   `CF_WORKERS_PLAN` = `paid` (GitHub → Settings → Secrets and variables → Actions → **Variables** → New repository
   variable). After any upgrade, do the same.
3. **The Worker's own count (optional).** Needed for the Resend email figures and the app's own daily counts. Choose a
   long random password yourself (a password manager can make one; never paste it in a chat), then:
   - on the Worker: `npx wrangler secret put USAGE_SECRET -c wrangler.assets.jsonc` (it asks for the value), or
     Cloudflare dashboard → Workers & Pages → skiwithme → Settings → Variables and secrets → Add → type Secret, name
     `USAGE_SECRET`;
   - in GitHub, the same value: Settings → Secrets and variables → Actions → **Secrets** → New repository secret,
     name `USAGE_SECRET`.
4. **Email as well as GitHub (optional).** GitHub already emails the owners. To also get the alert at
   hello@builtbyroger.app (which the owner forwards to their own inbox), set the repository variable `USAGE_EMAIL` =
   `on` (step 3 above must be done too: the workflow uses the secret). Nothing else to set up: the Worker sends it
   through the sign-in Resend account, like the daily map-report email (to `USAGE_MAIL_TO`, or else
   `REPORT_DIGEST_TO`). It goes out when the alert opens or gets worse.

## The Worker's own count

`worker/usage.js` counts, per UTC day: map files served, directions data, weather and resort-status requests, groups
created and group connections, other /api requests, and the outside requests made to weather sources, resort feeds and
Resend. Counts wait in memory and are written to the existing Accounts Durable Object (`usage` table, kept 60 days) at
most once a minute per running copy of the Worker, so the count adds very few Durable Object requests. A copy that is
shut down loses up to a minute of counts; it is a guide next to Cloudflare's figures, not a bill.

- `GET /api/admin/usage?days=35` with header `x-admin-key: <USAGE_SECRET>`: `{days: {date: {counter: n}}}`.
- `POST /api/admin/usage/mail` with the same header and `{subject, text}`: sends the email (step 4).
- Both answer 404 while `USAGE_SECRET` is not set, and 401 for a wrong key.

## Files

| File | What |
| --- | --- |
| `tools/usage/limits.mjs` | The limits, sources, next steps and costs. Change figures here. |
| `tools/usage/assess.mjs` | Trend, days until 70/90/100%, levels, the advice sentences and the report (no network) |
| `tools/usage/collect.mjs` | Reads Cloudflare's GraphQL Analytics API and the Worker's own count |
| `tools/usage/github.mjs` | Opens, updates and closes the alert issue; the weekly comment |
| `tools/usage/run.mjs` | The command the workflow runs |
| `worker/usage.js` | The Worker's own count and the admin endpoints |
| `tests/usage.test.js` | Tests with made-up usage |

Run it by hand (prints the report, changes nothing):

```
node tools/usage/run.mjs                               # real figures; in a Claude container add NODE_USE_ENV_PROXY=1
node tools/usage/run.mjs --fake data.json --today 2026-11-23 --plan paid
```

Cloudflare datasets used: `workersInvocationsAdaptive` (requests, CPU, status), `durableObjectsInvocationsAdaptiveGroups`,
`durableObjectsPeriodicGroups` (active time → GB-s at 128 MB, rows, WebSocket messages billed 20 to 1),
`durableObjectsSqlStorageGroups`, `r2OperationsAdaptiveGroups` (Class A/B by operation), `r2StorageAdaptiveGroups`.

## Not checked

- The prices and allowances were not re-read from the providers' pages (blocked from the container): from memory.
- Whether the GitHub secret token has Account Analytics: Read (the environment's token does).
- The GitHub issue steps ran only against a stand-in for GitHub in the tests, not the real repository.
- The email path ran only in tests with a stand-in for Resend.
- The account's actual Workers plan (the token cannot read billing).
