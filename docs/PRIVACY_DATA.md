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
- Switching on stores the time (`prefs contrib`); only days started after it are ever sent.
- Sent the day after a ski day (never the same day), once per mountain and day, for the mountain that is open.
- The first and last 300 m of the day's track are cut (home, car, lodging).
- Lift rides are skipped. Each other point becomes either the run it is on (`trailAt`, run id on that map build) or a
  20 m square in the map's local grid if it is off the shown runs.
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
