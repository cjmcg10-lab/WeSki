# Map-mistake reports: daily email and confidence scores

Written 2026-11-24 for issue #112 (steps 1 and 2). Automatic fixes (step 3), the weekly job (step 4) and phone changes
beyond the fields below (step 5) are not built yet.

## What it does

- **Daily email.** Once a day (11:23 UTC, about 6:23 in the morning in Connecticut in winter) the Worker emails
  hello@builtbyroger.app the map-mistake reports that arrived since the last email, grouped by mountain. Each report
  shows the kind, the run, the skier's note, the spot (an OpenStreetMap link when the phone sent the spot's lat/lon,
  otherwise the map position), how far the reporter's own GPS was from the spot, and the confidence of the problem it
  belongs to. Under each mountain it lists that mountain's open problems, most certain first, with the reasons.
  The app link opens the mountain (`?skip=<id>`); the app cannot yet open on a given spot.
  Nothing is sent on days without new reports.
- **Confidence scores.** `GET /api/reports/<id>/problems` returns each mountain's problems with a score, a level
  (low, medium, high) and the reasons. The same list is in the email.

## How a score is made (`worker/confidence.js`)

All numbers that decide anything are in the one constant `CONFIDENCE` at the top of that file, with a comment on each.
When automatic fixes are added, tighten them there if they start adding or removing runs wrongly; the tests in
`tests/map-reports.test.js` show what each number does.

1. Reports of the same kind within 60 m of each other are one problem.
2. Each phone counts once per problem. Phones send a random install id with each report (see Privacy); reports from
   before that count half each, because repeats from one phone cannot be told apart.
3. A report fades in a straight line to nothing at 60 days old.
4. A report sent while the phone's own GPS was within 200 m of the spot counts 1.5 times.
5. Map help ("Help improve the maps") adds or takes away points. Only the public counts are used (squares and runs
   reached by at least 5 ski days), so "no ski days" really means "fewer than 5":
   - "Run or lift missing" and "Drawn in the wrong place": squares off the mapped runs within 60 m of the spot skied on
     5+ days. Three or more: +1.5; one or two: +0.75.
   - "Run does not exist" and "Closed for good": the run skied on 5+ days takes 1 point away (it looks real); no
     published ski days adds 1 point, but only once the mountain has 50 map-help ski days in all (before that a quiet
     run means nothing).
   - "Wrong rating": never judged from GPS. A wrong, easier rating can send someone onto terrain above their level, so
     ratings always go to a person and the resort's own list.
6. Score = report points + map-help points. Medium from 1.5, high from 3. Example: three phones on the spot today
   score 4.5 (high); one phone far away scores 1 (low).

There is no "these runs don't connect" kind on the phone yet; a gap reported as "missing" gets the off-run squares as
evidence. Map help does not record tracks, so "tracks crossing a gap" can only show as off-run squares at the gap.

## Where things are stored

- Reports: the `reports` table of each mountain's `ResortLog` Durable Object (`worker/stores.js`). New columns `dev`
  (hash), `near`, `run`, `lat`, `lon`, added to old objects on first use.
- The mountain's `kv` row `digestSent`: the highest report id already emailed.
- The `ResortLog` object named `_digest` (not a valid resort id, so it never clashes): `digest_due` lists mountains with
  reports not yet emailed; `kv` `lastDigestDay` stops a second email on the same day if the cron run repeats.
- When sending fails nothing is marked as sent, so the reports come again the next day.
- Reports from before this change are not in `digest_due`; a mountain's old reports appear in the first email after
  its next new report.

## Switching it on: what the owner does in Cloudflare

The code is deployed switched off. It needs Cloudflare's free email sending, which only sends to addresses you have
confirmed. About ten minutes:

1. Go to https://dash.cloudflare.com and sign in. Choose your account, then the domain **builtbyroger.app**.
2. In the left menu open **Email**, then **Email Routing**.
   - If it says Email Routing is not set up, press **Get started** (or **Enable Email Routing**) and accept the mail
     records Cloudflare offers to add.
   - **Stop first if hello@builtbyroger.app already receives mail through another service** (for example Google
     Workspace, Zoho or Fastmail). Turning on Email Routing replaces the domain's mail records and would cut that inbox
     off. In that case tell Claude, and a different sender domain can be used instead.
3. Open the **Destination addresses** tab, press **Add destination address**, type `hello@builtbyroger.app` and save.
   Cloudflare emails a confirmation link to that address: open it and press the button. The address then shows as
   **Verified**.
   - If Cloudflare will not accept hello@builtbyroger.app (for example because that address itself is a forwarding rule
     on this domain), confirm the inbox it forwards to instead (it may already show as verified). Then, so that address
     never goes into the code: **Workers & Pages** → **skiwithme** → **Settings** → **Variables and Secrets** → **Add**,
     type **Secret**, name `REPORT_DIGEST_INBOX`, value: that inbox address. Save.
4. Tell Claude "the email address is verified". A session then switches on the one line in `wrangler.assets.jsonc`
   (`"send_email": [{ "name": "REPORT_MAIL" }]`) through a reviewed pull request. It is left off until then because the
   deploy may fail while Email Routing is not set up.
5. The first email comes the morning after the next report. Check the spam folder the first time and mark it "not spam".

No password, key or paid plan is needed. Cron Triggers and Email Routing are free.

## Settings in the Worker

| Setting | Where | Meaning |
| --- | --- | --- |
| `triggers.crons` `23 11 * * *` | both wrangler configs | when the daily job runs (UTC) |
| `send_email` binding `REPORT_MAIL` | both wrangler configs, commented out | Cloudflare's email sending; without it nothing is sent |
| `REPORT_DIGEST_TO` | vars | the inbox: hello@builtbyroger.app (owner, 2026-11-24) |
| `REPORT_DIGEST_INBOX` | optional Cloudflare secret | overrides `REPORT_DIGEST_TO` when set |
| `REPORT_DIGEST_FROM` | vars | sender, reports@builtbyroger.app (must be on a domain with Email Routing on) |

## Checking it

- `npx vitest run tests/map-reports.test.js`: scores, the email text from fixtures, the message format, and the job
  (nothing without the binding, one email per day, nothing marked when sending fails). No real email is sent.
- Locally: `npx wrangler dev -c wrangler.jsonc --test-scheduled` (with the `send_email` line uncommented in a copy of
  the config), send a few reports with curl to `/api/reports`, then open `/__scheduled`; wrangler writes the email to a
  `.eml` file under `.wrangler/tmp/email/` instead of sending it.
- After switching on: the Worker's logs (Cloudflare → Workers & Pages → skiwithme → Logs) show `report digest {...}`
  once a day with what happened.
