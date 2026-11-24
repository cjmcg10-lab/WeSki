# Map-mistake reports and map help: daily email, confidence scores, suggested fixes

Written 2026-11-24 for issue #112. Steps 1 and 2 (the daily email and confidence scores) and the GPS-evidence step
(on-map share, places people leave the map, suggested fixes, the weekly tool and workflow) are built. Joins and stubs
from the issue's table and the phone changes of step 5 are not built yet.

## In short: what the owner sees, what is automatic, what needs the owner

| What | Automatic? | Needs the owner |
| --- | --- | --- |
| Daily email of new reports, with confidence | yes, every morning with something new | nothing (check the spam folder once) |
| "Yesterday: N% of skiing was on the drawn runs (M ski days)" in the email | yes, only when 5+ ski days sent map help that day | nothing |
| "Places people keep leaving the map" in the email and the weekly reports | yes | read them |
| Suggested fixes, marked SAFE or NEEDS REVIEW | yes, listed | decide every NEEDS REVIEW one |
| Weekly pull request with the SAFE fixes written into the configs | yes, opened as a draft every Monday when there are any | review it; decide whether it may ever merge by itself (see below) |
| The live map changing | **never by itself** | approve the rebuilt maps on the preview before they are pushed |

**Open decision for the owner:** the owner has said safe fixes may go live automatically, but the repository's rule
(docs/DEVELOPMENT_PROCESS.md) is that `main` only changes through a reviewed pull request, and maps only go live after
the owner approves the preview. So today the weekly job only opens a draft pull request. Letting it merge itself (and
rebuild and push maps itself) would need: a change to the development process agreed by both people, a place to run
the full rebuild (OpenStreetMap extracts and terrain do not fit the GitHub job), and the Cloudflare token in that job.
Until then, a person reviews each weekly pull request.

## What it does

- **Daily email.** Once a day (11:23 UTC, about 6:23 in the morning in Connecticut in winter) the Worker emails
  hello@builtbyroger.app the map-mistake reports that arrived since the last email, grouped by mountain. Each report
  shows the kind, the run or lift, what the rating should be (wrong ratings), the skier's note, the spot (an
  OpenStreetMap link when the phone sent the spot's lat/lon, otherwise the map position), how far the reporter's own GPS
  was from the spot, and the confidence of the problem it belongs to. Under each mountain it lists that mountain's open
  problems, most certain first, with the reasons, then the mountain's map help (below). The app link opens the
  mountain (`?skip=<id>`); the app cannot yet open on a given spot. Mountains with new map-help days but no new reports
  get a short map-help part of their own. Nothing is sent on days with nothing new.
- **Confidence scores.** `GET /api/reports/<id>/problems` returns each mountain's problems with a score, a level
  (low, medium, high) and the reasons. The same list is in the email.

## Map help in the email (GPS evidence)

Map help ("Help improve the maps", opt-in) sends, once per ski day, the runs skied, the 20 m squares skied off the
shown runs, and since 2026-11-24 the *number* of 20 m squares skied on the shown runs (only the count). The server only
uses or shows what 5 or more ski days reached (`K_ANON` in `worker/evidence.js`). Per mountain the email shows, kept
short:

1. **On the drawn runs.** "Yesterday: 82% of skiing was on the drawn runs (7 ski days)": of all the 20 m squares
   skied going downhill that day, the share that was on a shown run. Only days with 5+ ski days (from phones new
   enough to send the count) are shown; otherwise "not enough ski days yet". Phones send a day's summary the day after,
   when the app is next opened at that mountain, so yesterday is often not complete by the morning email: the email
   then shows the latest complete-enough day of the last week, with its date. A low share means people ski where the
   map has no run (missing runs, runs drawn off their line, or open terrain the map does not show).
2. **Places people keep leaving the map** (the top 3 lines; `worker/mapgaps.js`). Neighbouring off-run squares are
   grouped. A group at least 80 m long and 2.5 times longer than wide is a *line*. For each: its size, how many ski
   days reached its squares (most and median), the nearest shown run and how far it is, map-mistake problems within
   100 m, and a map link. A line running alongside a shown run within 60 m is probably that run *drawn off its real
   line*; a line away from the runs is probably a *missing run*.
3. **Suggested fixes** (the top 5, safe ones first; `worker/mapfixes.js`), each SAFE or NEEDS REVIEW with its first
   reason. The full list with all the evidence is in the weekly report.

## Suggested fixes and their safety class (`worker/mapfixes.js`)

Every number is in the one constant `FIXES` (and `GAPS` in `worker/mapgaps.js`), with a comment on each.

**SAFE** (the weekly tool may write them into the configs; a person still reviews the pull request):

- **Move a run's line** onto the strip skiers follow, when the strip has 6+ off-run squares skied on 10+ days each
  (median), lies 10 to 60 m from the drawn line, runs the same way, covers at least 30% of the run, the run is not a
  glade or tree run, and there are aerial photos for that country. Even then nothing is written until the aerial-photo
  check (`tools/align_trails.py`, with its own rules: strong evidence, never more than 70 m, never onto another mapped
  run, never glades) finds the cut run within 20 m of the skiers' strip. The change is `way_pts` (OpenStreetMap runs)
  or the points of an `extra_trails` run in `tools/resorts/<id>.json`, written by `align_trails.py --write`.
- **Hide a connecting piece nobody skis**: a piece that is not on the resort's trail list (shown only as a link), 40 m
  or longer, skied on fewer than 5 days, next to a run skied on 20+ days, over a whole season on the current map: 300+
  map-help ski days with counts, spanning 90+ days, all after the live map was last rebuilt (so run numbers from an
  older build cannot mix in). The change is `"hide": {"way <OSM id>": reason}` in `tools/official/<id>.json`, which
  `tools/verify_exists.py` applies at the next rebuild. The rebuild's connection checks must still pass.

**NEEDS REVIEW** (listed for a person, never written):

- a whole missing run (a line away from the runs, 100 m+, skied on 20+ days): the report gives a draft line to compare
  with the trail map; if real, trace it as `extra_trails` with the rating from the resort's list;
- a run drawn off its line that misses any SAFE condition;
- map-mistake problems at medium or high confidence: hiding a run on the resort's list, joins (`links`), names
  (`rename`), and every rating. **Ratings are never changed from GPS or reports**: a wrong, easier rating can send
  someone onto terrain above their level, so they always go to a person and the resort's own list.

Inside the Worker the date of the live map is not known, so the email never calls a hide SAFE; the weekly tool does.

## The weekly tool and workflow

- `node tools/map_fixes.mjs <id...>|--all` reads the live app's public numbers (`/api/heat/<id>`,
  `/api/reports/<id>/problems`, and the live `/data/<id>/resort.json`, whose run numbers are the ones phones used), with
  the User-Agent `weski-build`, and writes `tools/fixes/<id>.md` (map help, places, safe fixes with their status, needs
  review with evidence). With `--apply-safe` it writes the safe fixes into the configs and logs each one, with its
  evidence, in `tools/fixes/<id>.json` so it can be undone. `--no-photo` skips the aerial-photo check (line moves are
  then listed, not written). The live map's date is the last git commit touching the mountain's configs or the build
  scripts (`--map-since` overrides it).
- `.github/workflows/map-fixes.yml` runs it every Monday at 08:17 UTC on every mountain with `--apply-safe`. When a
  config changed it opens a **draft** pull request labelled `map-fixes` with the config changes and those mountains'
  reports; every report is also kept as a download on the run. It never deploys, never uploads maps, uses no
  Cloudflare token, never pushes to `main` and never merges. It does **not rebuild** the maps: that needs OpenStreetMap
  extracts and terrain downloads too big for the job. So before merging, a person (or a session) rebuilds the
  mountains named in the pull request with `python3 tools/pipeline.py <ids>` (without `--r2`), runs `npm test`, shows
  them on the preview, and pushes the maps with `node tools/maps_r2.mjs push` once the owner approves. Merging the
  pull request alone changes nothing on the live map.
- For the workflow to open pull requests, the owner turns on Settings → Actions → General → "Allow GitHub Actions to
  create and approve pull requests". A pull request opened by a workflow does not start "Checks" by itself: run Checks
  on its branch from the Actions tab (or close and reopen the pull request) before merging.

## Limits to know

- Run numbers change when a map is rebuilt, and map-help run counts do not say which build they came from. That is why
  a hide needs a whole season after the last rebuild. (A later improvement: phones send the map build with the summary.)
- Off-run squares only show where people went, not when or in which order, so "tracks crossing a gap" can only show as
  squares at the gap; nothing here can draw a run's exact line by itself.
- Nothing has been tried with real skiers yet: there is no map-help data on the live site so far, and thresholds are
  first guesses to tighten in `FIXES`/`GAPS` once real data arrives.

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
  reports not yet emailed or new map-help days; `kv` `lastDigestDay` stops a second email on the same day if the cron
  run repeats.
- Map-help counts: each mountain's `ResortLog` `buckets` (counts per run and per square, and the row `daily`: per date,
  ski days with an on-run count and the sums of on-run and off-run squares). See docs/PRIVACY_DATA.md.
- The email reads the live `resort.json` (R2 or the static files) only for mountains where map help published
  something, to name the nearest run. It never writes it.
- Weekly reports: `tools/fixes/<id>.md`; fixes written by the weekly tool, with their evidence: `tools/fixes/<id>.json`.
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
- `npx vitest run tests/map-evidence.test.js`: the on-run count (phone and server), per-day totals in the store (real
  SQLite), places, suggested fixes and their safety class, the weekly tool's report and hide writer, and the email's
  map-help part (Resend mocked).
- Locally: `npx wrangler dev -c wrangler.jsonc --test-scheduled` with a `.dev.vars` holding a test `RESEND_API_KEY`
  and `MAIL_FROM` (only with a key you are allowed to send with), send a few reports with curl to `/api/reports`, then
  open `/__scheduled?cron=23+11+*+*+*`.
- Live: the Worker's logs (Cloudflare → Workers & Pages → skiwithme → Logs) show `report digest {...}` once a day with
  what happened.
