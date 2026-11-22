# Skier data: what is collected, how it is stored, how it improves the maps

Written 2026-11-20. The public version is `public/legal/privacy.html`; keep both in step.

## Principles

1. Location stays on the phone unless the skier chooses otherwise (group sharing, map help).
2. Collect the least that answers the question. The maps need "do skiers go here?", not "where did this person go?".
3. No identity on map data: no account, device id, IP address or time travels with a summary.
4. Counts only, and only counts reached by at least K = 5 separate ski days are used or published.
5. Short retention for anything that could link records.

## Map help (opt-in, "Help improve the maps")

On the phone (`flushContrib` and `daySummary` in `src/main.js`):
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
- Body: `{resort, key (random 128 bits, new each upload), day, runs: [ids], cells: [[i, j]]}`. No times or order.

On the server (`ResortLog` Durable Object, one per resort, `worker/stores.js`; rules in `worker/evidence.js`):
- `seen`: upload keys, deleted after 3 days (drops a retried duplicate).
- `pending`: the cleaned summary waits briefly, then an alarm merges it into `buckets` and deletes it.
  (Writing every summary straight into counts would cost many row writes; the free plan allows about 100,000 a day.)
- `buckets`: counts per run and per 20 m square, grouped in 1 km bands. This is all that is kept.
- `GET /api/heat/<id>` publishes only counts of at least 5.
- Rate limit: 30 summaries a day per network, keyed by a daily-salted hash of the IP that is never stored as an address.

Size: a busy day is a few hundred squares, about 5 kB. 10,000 ski days at one mountain fit in well under a megabyte of
counts, since repeat visits add to the same squares.

## How the counts improve the maps

`tools/evidence.py` (public OpenStreetMap GPS traces today) will read `/api/heat/<id>` as a second evidence source:
- a run with many ski days: confirmed real and used (supports `unof` runs being real);
- a band of squares off the mapped runs that many days cross: a missing run or a line in the wrong place, to check
  against aerial photos and the trail map before anything is drawn;
- a mapped run nobody skis over a whole season: a candidate for "closed for good" or a wrong line.
Nothing changes on the map automatically: every change still passes `docs/MOUNTAIN_CHECKLIST.md`.

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
  request is kept. Rate limit: 20 answers a day per network (daily-salted hash of the IP, never stored as an address).
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

Public notes: mountain, place (map grid metres), run at that place, kind, text (contact details stripped), time.
No account or address is stored with them. 10 a day per network. Listed at `GET /api/reports/<id>`.
To review: fetch the list per mountain, check each against the trail map and photos, fix, then mark it done
(status column; a review script is still to write).

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
