# Map-mistake reports: daily email and confidence scores

Written 2026-11-24 for issue #112 (steps 1 and 2). Automatic fixes (step 3), the weekly job (step 4) and phone changes
beyond the fields below (step 5) are not built yet.

## What it does

- **Daily email.** Once a day (11:23 UTC, about 6:23 in the morning in Connecticut in winter) the Worker emails
  hello@builtbyroger.app the map-mistake reports that arrived since the last email, grouped by mountain. Each report
  shows the kind, the run or lift, what the rating should be (wrong ratings), the skier's note, the spot (an
  OpenStreetMap link when the phone sent the spot's lat/lon, otherwise the map position), how far the reporter's own GPS
  was from the spot, and the confidence of the problem it belongs to. Under each mountain it lists that mountain's open
  problems, most certain first, with the reasons. The app link opens the mountain (`?skip=<id>`); the app cannot yet
  open on a given spot. Nothing is sent on days without new reports.
- **Confidence scores.** `GET /api/reports/<id>/problems` returns each mountain's problems with a score, a level
  (low, medium, high) and the reasons. The same list is in the email.

## What the skier can report

On the phone (More → Privacy & map help, the flag button on the map, or a dropped pin), one of:

| Kind | On the phone | Grouped by |
| --- | --- | --- |
| `missing` | A run or lift is missing | spot, 150 m |
| `not_real` | This run does not exist | the run or lift |
| `wrong_rating` | Wrong rating, plus a required "It should be:" choice | the run |
| `wrong_place` | Drawn in the wrong place | the run or lift |
| `closed_for_good` | Closed for good | the run or lift |
| `wrong_name` | The name is wrong (added 2026-11-24) | the run or lift |
| `no_connection` | Runs or lifts don't connect here (added 2026-11-24) | spot, 60 m |
| `other` | Something else | the run or lift, or spot (60 m) when the pin is on neither |

"It should be:" offers the resort's own scale: green, blue, black, double black in North America; the piste colours
green, blue, red, black and freeride (yellow) in Europe and Japan, as the map legend shows them. The phone sends the
choice as `should` (0 to 3, the `d` level, or 0 to 4, the colour class `c`) with `scale` (`us` or `colour`); the
server refuses a value off that scale.

## How reports are grouped into problems

Two reports are the same problem when they are the same kind and about the same thing:

- **About a run or lift.** A wrong rating, a run that does not exist, one closed for good, drawn in the wrong place or
  with the wrong name is about the whole run, which can be kilometres long. So two people reporting the same run 800 m
  apart are one problem. The phone sends what the pin is on: the run's OpenStreetMap id and name, or, when the pin is
  on a lift line (within 25 m and nearer the lift than any run), `lift:<OSM id or name>` and the lift's name. Reports
  that share the OSM id or the name are grouped, so a run OpenStreetMap draws as several pieces with one name is still
  one run, and a hand-drawn run with no OSM id is grouped by its name. A lift and a run with the same name stay apart.
  The run number on the map is never used for this: it changes each time the map is rebuilt. (Phones before this change
  sent the run number when a run had no OSM id; such reports are grouped by name, or by spot when they have none.)
- **About a place.** "A run or lift is missing" and "Runs or lifts don't connect here" are about a spot, not about the
  run the pin happens to sit on, and so is anything reported where there is no run or lift. These are grouped by
  distance: missing runs within 150 m (a missing run is a line, not a point, so two people can drop their pins some way
  apart along it), everything else within 60 m. Both radii are in `CONFIDENCE` (`missingM`, `spotM`).

## How a score is made (`worker/confidence.js`)

All numbers that decide anything are in the one constant `CONFIDENCE` at the top of that file, with a comment on each.
When automatic fixes are added, tighten them there if they start adding or removing runs wrongly; the tests in
`tests/map-reports.test.js` show what each number does.

1. Reports are grouped as above.
2. Each phone counts once per problem. Phones send a random install id with each report (see Privacy); reports from
   before that count half each, because repeats from one phone cannot be told apart.
3. A report fades in a straight line to nothing at 60 days old.
4. A report sent while the phone's own GPS was within 200 m of the spot it reported counts 1.5 times (for a problem
   about a long run, each report is judged against its own spot).
5. Wrong ratings: each phone's newest "It should be" is its vote. Phones that agree with the most-voted rating count in
   full; a phone that names a different rating counts half (`ratingOtherFactor`): it agrees the rating is wrong, not on
   the fix. The problem shows the most-voted rating and the count, e.g. "It should be Black: 3 phones say Black,
   1 says Blue". On a tie the harder rating is shown first.
6. Map help ("Help improve the maps") adds or takes away points. Only the public counts are used (squares and runs
   reached by at least 5 ski days), so "no ski days" really means "fewer than 5":
   - "Run or lift missing" and "Drawn in the wrong place": squares off the mapped runs within 60 m of any reported spot
     of the problem, skied on 5+ days. Three or more: +1.5; one or two: +0.75.
   - "Run does not exist" and "Closed for good": the run skied on 5+ days takes 1 point away (it looks real); no
     published ski days adds 1 point, but only once the mountain has 50 map-help ski days in all (before that a quiet
     run means nothing).
   - "Wrong rating": never judged from GPS. A wrong, easier rating can send someone onto terrain above their level, so
     ratings always go to a person and the resort's own list.
7. Score = report points + map-help points. Medium from 1.5, high from 3. Example: three phones on the spot today
   score 4.5 (high); one phone far away scores 1 (low).

Map help does not record tracks, so "tracks crossing a gap" can only show as off-run squares at the gap.

## Where things are stored

- Reports: the `reports` table of each mountain's `ResortLog` Durable Object (`worker/stores.js`). Columns added for
  #112: `dev` (hash), `near`, `run`, `lat`, `lon`, `should`, `scale`, added to old objects on first use.
- The mountain's `kv` row `digestSent`: the highest report id already emailed.
- The `ResortLog` object named `_digest` (not a valid resort id, so it never clashes): `digest_due` lists mountains with
  reports not yet emailed; `kv` `lastDigestDay` stops a second email on the same day if the cron run repeats.
- When sending fails nothing is marked as sent, so the reports come again the next day.
- Reports from before this change are not in `digest_due`; a mountain's old reports appear in the first email after
  its next new report.

## Switching it on

Nothing to set up: the email goes through Resend, the mail account that already sends the sign-in codes
(`RESEND_API_KEY` secret and `MAIL_FROM`), from `MAIL_FROM` to hello@builtbyroger.app, which the owner already forwards
to their own inbox. It is on wherever sign-in emails work. The first email comes the morning after the next report;
check the spam folder the first time and mark it "not spam".

## Settings in the Worker

| Setting | Where | Meaning |
| --- | --- | --- |
| `triggers.crons` `23 11 * * *` | both wrangler configs | when the daily job runs (UTC) |
| `RESEND_API_KEY` | Cloudflare secret (already set for sign-in) | Resend key; without it nothing is sent |
| `MAIL_FROM` | vars (already set for sign-in) | sender; without it nothing is sent |
| `REPORT_DIGEST_TO` | vars | the inbox: hello@builtbyroger.app (owner, 2026-11-24) |

The request to Resend carries the User-Agent `weski-build`. If Resend refuses (for example a bad key), the job logs
the error and marks nothing as sent.

## Checking it

- `npx vitest run tests/map-reports.test.js`: grouping, scores, rating votes, the email text from fixtures, the Resend
  request, and the job (nothing without the key or sender, one email per day, nothing marked when Resend refuses).
  `fetch` is replaced in the tests: Resend is never called.
- Locally: `npx wrangler dev -c wrangler.jsonc --test-scheduled` with a `.dev.vars` holding a test `RESEND_API_KEY`
  and `MAIL_FROM` (only with a key you are allowed to send with), send a few reports with curl to `/api/reports`, then
  open `/__scheduled?cron=23+11+*+*+*`.
- Live: the Worker's logs (Cloudflare → Workers & Pages → skiwithme → Logs) show `report digest {...}` once a day with
  what happened.
