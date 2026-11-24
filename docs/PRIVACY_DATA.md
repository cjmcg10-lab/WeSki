# Skier data: what is collected, how it is stored, how it improves the maps

Written 2026-11-20. The public version is `public/legal/privacy.html`; keep both in step.

## Principles

1. Location stays on the phone unless the skier chooses otherwise (group sharing, map help).
2. Collect the least that answers the question. The maps need "do skiers go here?", not "where did this person go?".
3. No identity on map data: no account, device id, IP address or time travels with a map-help summary. (Map-mistake
   reports carry a random install id, hashed per mountain on the server, only to count separate phones; see below.)
4. Counts only, and only counts reached by at least K = 5 separate ski days are used or published.
5. Short retention for anything that could link records.

## Map help (opt-in, "Help improve the maps")

On the phone (`flushContrib` in `src/main.js`, `daySummary` and `contribBody` in `src/contrib.js`):
- Asked once, the first time location is turned on (`askMapHelp`): two buttons, "Yes, help improve the maps" (the
  main button) and "No thanks". Not pre-ticked: a pre-ticked box is not valid consent in the EU and UK, and several US
  state laws (Colorado, Connecticut and others) require an active opt-in for precise location. Also in More.
- Switching on stores the time (`prefs contrib`); only days started after it are ever sent.
- Sent the day after a ski day (never the same day), once per mountain and day, for the mountain that is open.
- Only points that look like skiing are used: tracker state "skiing" (not lift, not idle), speed 2.5 to 40 m/s, inside
  the map's terrain, not within 70 m of a lodge, car park, restaurant or service point nor within 30 m of any building.
  That removes home, car, lodging and lift lines wherever they fall in the day (a fixed 300 m trim at each end did not:
  a day can start on the summit or end mid-run).
- Each kept point becomes the run it is on (`trailAt`, run id on that map build), or, if it is off the shown runs and
  going downhill, a 20 m square in the map's local grid.
- Squares skied on the shown runs (going downhill, same rules) are counted too, and only the count is sent (`on`, added
  2026-11-24 for #112): which squares they were never leaves the phone. It lets the server say what share of the skiing
  was on the drawn runs.
- Body: `{resort, key (random 128 bits, new each upload), day, runs: [ids], cells: [[i, j]], on: number}`. No times or
  order.

On the server (`ResortLog` Durable Object, one per resort, `worker/stores.js`; rules in `worker/evidence.js`):
- `seen`: upload keys, deleted after 3 days (drops a retried duplicate).
- `pending`: the cleaned summary waits briefly, then an alarm merges it into `buckets` and deletes it.
  (Writing every summary straight into counts would cost many row writes; the free plan allows about 100,000 a day.)
- `buckets`: counts per run and per 20 m square, grouped in 1 km bands, plus one row `daily`: per date, the number of
  ski days that sent an on-run count and the sums of on-run and off-run squares (three numbers a day, newest 400 days).
  This is all that is kept.
- `GET /api/heat/<id>` publishes only counts of at least 5. The on-map share (`onMap`: date, ski days, percent) is
  published only for dates with at least 5 ski days; other dates are left out entirely ("not enough ski days yet").
- Rate limit: 30 summaries a day per network, keyed by a daily-salted hash of the IP that is never stored as an address.

Size: a busy day is a few hundred squares, about 5 kB. 10,000 ski days at one mountain fit in well under a megabyte of
counts, since repeat visits add to the same squares.

## How the counts improve the maps

Only the published counts (5+ ski days) are used, by `worker/mapgaps.js` and `worker/mapfixes.js` in the daily email
and by the weekly `tools/map_fixes.mjs` (see `docs/MAP_REPORTS.md`); `tools/evidence.py` also reads them:
- a run with many ski days: confirmed real and used (supports `unof` runs being real);
- a band of squares off the mapped runs that many days cross: a missing run or a line in the wrong place, checked
  against aerial photos and the trail map before anything is drawn;
- an unlisted connecting piece nobody skis over a whole season: hidden by a weekly pull request, after review;
- the share of skied squares on the drawn runs per day: how well the map matches where people ski.
Nothing changes on the live map automatically: a config change needs a rebuild, the preview and the owner's approval.

## Ski-day feedback ("How was it?", added for #9)

Optional, never pre-filled, and not tied to the map-help switch: each answer is the person's own choice.
- Phone (`src/feedback.js`, `feedbackCard` in `src/main.js`): a card at the top of a saved day. Rating 1 to 5, optional tags
  (icy, powder, slushy, windy/lifts on hold, crowded, visibility), Send or Skip. Asked once per mountain and local date:
  Send and Skip both write `feedbackAsked` (`resort:day`), so it is never asked again for that day. Answers wait in
  `feedbackQueue` while offline and go out at the next map open (`flushFeedback`).
- Body: `{resort, day, rating, tags}`. No key, account, device id, location, track or time of day.
- Server (`worker/calibration.js`, table `feedback` in the `ResortLog` Durable Object): `POST /api/feedback` checks the
  mountain is on the server-side resort list (`worker/catalog.js`), the date is a real date within 120 days, the rating is
  1 to 5 and every tag is on the list. It adds to one row per date: five rating counts and a count per tag. Nothing from the
  request is kept. Rate limit: 20 answers a day per network. The key is a 16-character hash of the network (IPv4 address, or the first 64 bits of an IPv6 address) plus the date plus the optional Worker secret `IP_SALT` (the date alone when unset; set it with `npx wrangler secret put IP_SALT -c wrangler.assets.jsonc` so the hashes cannot be guessed from the public date). Limiter rows (`limits` table, `ResortLog` and `Accounts`) are deleted whenever `allow()` runs after their time has passed, so the keys do not pile up; an unused resort keeps its few rows until its next request.
- Counts are not public. They are read only through the admin export below, to compare scores with how days skied.
- Because an answer has no identity it cannot be found or deleted later; the privacy policy says so.
- Because no key is kept, a person can send twice for one day by reinstalling or clearing data. The rate limit bounds it and
  the calibration reads counts per day, so a few repeats do not move it.

## Calibration export (admin only)

`GET /api/forecast-archive/<id>?since=<ms>&limit=<n>` returns the archived forecasts (`docs/FORECAST_HISTORY.md`), the stored
72 hours and the feedback counts of one listed resort, for `tools/forecast_calibrate.mjs`. It needs the header `x-admin-key`
to equal the Worker secret `ARCHIVE_ADMIN_SECRET`; with no secret set the route answers 404, with a wrong key 401. The owner
sets the secret with `npx wrangler secret put ARCHIVE_ADMIN_SECRET -c wrangler.assets.jsonc`. The export holds no personal data.

## Map-mistake reports

Public notes: mountain, place (map grid metres, and its lat/lon since 2026-11-24), run or lift at that place (its
OpenStreetMap id or `lift:<id or name>`, and its name), kind, for a wrong rating the rating it should be (`should`,
`scale`, since 2026-11-24), text (contact details stripped), time. No account or address is stored with them. 10 a day per network. Listed at
`GET /api/reports/<id>`. To review: the daily email and `tools/reports.py` (see `docs/MAP_REPORTS.md`), check each
against the trail map and photos, fix, then mark it done (status column).

Added 2026-11-24 for the confidence scores (#112), kept on the server and never in the public list:
- **Install id.** The phone makes a random 128-bit id the first time it sends a report (`installId` in local storage,
  `reportExtras` in `src/main.js`) and sends it with each report. It is not tied to an account, a sign-in, the map-help
  summaries or anything else, and it is gone when the app is removed or its data cleared. The server stores only the
  first 16 characters of SHA-256(mountain id + ":" + id), so the same phone cannot be followed from one mountain to
  another, and the id itself is never stored. It is used only to count separate phones per problem.
- **Distance to the spot.** How far the phone's own GPS fix (under 10 minutes old) was from the reported spot, rounded
  to 10 m. Only the distance is sent, never the phone's position. When no pin is dropped the spot is where the person
  stands, as before (distance 0). Not sent while "Simulated location" is on.
- **Run number** on that map build, to compare with the map-help counts.
- Reports older than 60 days no longer count; the scores (`GET /api/reports/<id>/problems`) show counts and reasons only:
  report ids, number of phones, number sent from near the spot, map-help counts of 5 or more.
- The hashed id and the distance stay with the report row (not published). The distance also appears in the owner's
  daily email (worker/digest.js), which goes only to the owner's inbox. Reports are accepted only for mountains in
  the app's index.

Added 2026-11-24 for the phone side of #112 (step 5); nothing new about the person is sent:
- **Replies** "This spot is fine" and "It's been fixed, thanks" (kinds `fine`, `fixed`) are reports like the others,
  with one more field, `about` (the kind of problem they answer), and with *less* than a report: no note and no run
  number. They carry the install id (required: each phone counts once), the distance to the spot (not while
  "Simulated location" is on), the place and the run or lift at it. They are listed in `GET /api/reports/<id>` like
  any report.
- The problem list now also says, per problem, how many skiers reported it (`people`: phones plus older reports
  without an id), what it is about (`keys`: the OSM ids and names already public in the report list), the radius of
  a problem about a spot, and how many phones replied. Still nothing that identifies a phone.
- **On the phone only, never sent:** `myReports` and `myReplies` in local storage, the last 40 reports and replies this
  phone sent at that mountain (kind, place, run or lift, time; 60 days), so the phone does not count itself as
  "another skier" and does not ask the same person twice.
- Map help is unchanged. Issue #112 also proposed sending short simplified lines of the off-run squares; that was
  **not** built: the off-run squares already sent are enough.

## Offline maps and locked days (on the phone only, 2026-11-23)

Two small lists in the phone's settings, never sent: `openedMaps` {mountain id: local date it was opened today} and
`offlineMaps` {mountain id: {at, bytes}} for downloads. Without a pass, map files of mountains opened on an earlier day
are deleted from the phone's `weski-map` cache at the next start-up with a server answer. Saved ski days are never
deleted for lack of a pass: earlier days are only shown locked (`historyView` in `src/passrules.js`).
`public/legal/privacy.html` ("What stays only on your phone") says the same.

## Accounts and payments

See `docs/PAID_TIER.md`. Email, hashed session keys, first 80 characters of the browser name per signed-in phone,
purchases (plan, dates, Paddle ids), crew emails. Deleted with the account. Paddle holds card data, not us.

## Groups

Unchanged: positions relay through the group's Durable Object while sharing is on; the room is wiped when the group
ends or 12 hours after its last activity.

## Legal points to keep true

- EU/UK: consent for map help and sharing (both opt-in switches), withdrawal at any time, access/delete requests
  answered within 30 days, children under 16 only with a parent.
- US states that treat precise geolocation as sensitive (for example California, Colorado, Connecticut, Virginia,
  Oregon, Texas): we collect it only with the user's choice, for the stated purpose, never sell or share it for
  advertising. Revisit if any feature ever sends raw tracks to the server.
- Under 13: not for unsupervised use (COPPA).
