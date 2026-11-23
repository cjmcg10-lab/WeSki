# Forecast: handover

Built and accepted on 2026-11-22 (issues #1 to #12). This page is the starting point: what the Forecast tab does, where its data comes from, what is stored, where the code is, how to check it again, what is not done and what the owners still have to do. The detail lives in the other `FORECAST_*` pages, linked below.

## What it does

The **Forecast** tab (and the Forecast button on the start screen) lets anyone build a watchlist of ski resorts and compare them.

- **Add a mountain.** Search any of the 4,792 downhill resorts in the worldwide catalog (the 60 mapped resorts are in it too). A mountain that is not listed can be added as a **pin**: drop one pin at the base, optionally a second at the top, or type coordinates. A pin is labelled "Pinned" and "Terrain unverified" everywhere.
- **Calendar.** Mountains are rows, the next seven days are columns. Each cell shows the score out of 100, a word (Poor, Fair, Good, Great, Epic), the best 3 hour window and confidence as bars plus a word. Tap a date to sort the rows by it. Reorder, remove (with Undo) and add under "Edit list".
- **Day view.** Tap a cell: score, confidence and why, best window and peak hour, an hourly chart (time blocks beyond two days), base and summit numbers, snow surface, and the weather source and age.
- **Plan a trip.** Pick days, or a range, and the mountains are ranked by their average over the days they all forecast, with the strongest and weakest day each, and "too close to call" when the gap is smaller than the forecast can tell apart.
- **Offline.** The list, the last forecasts and the catalog are kept on the phone; the screens say how old a forecast is.

The whole section is free (owner decision, 2026-11-21). The map, groups and tracking are unchanged.

## How a score is made

Full rules: `docs/FORECAST_SCORING.md` (engine version 1.8.0) and `docs/FORECAST_SPEC.md` (Connor's spec).

1. Each hour is scored from 0 to 100 at the base and at the upper mountain from four parts: expected snow surface 45% (carried hour by hour from the last 48 to 72 hours: new snow, rain then refreeze, daytime softening, grooming), visibility 25%, wind 20%, temperature and precipitation comfort 10%.
2. The hour score is the average of base and upper. If the source cannot tell them apart, one estimate is used and confidence drops. Summit wind and visibility are never invented.
3. The day score is `0.60 x average of the ski hours + 0.40 x best average of any 3 consecutive ski hours`. It is rounded only for display. Ski hours are the published hours, otherwise an assumed 9:00 to 16:00 that the screens label "Assumed".
4. Confidence (High, Medium, Low) is kept apart from the score and has a stated reason: forecast age, model grid size, how much history there is, one estimate instead of two, a stale copy.
5. "Closed" appears only for a confirmed closure. "Insufficient data" appears when too many ski hours are missing.
6. Days 6 and later have Low confidence. For Swiss resorts, days 6 to 8 come from MeteoSwiss's ensemble forecast and show a likely range ("77, 74–85"), and "Close call" can appear when two mountains are within it (issue #57). Elsewhere day 6 has no range.

## Where the data comes from

Details, licences and live checks: `docs/FORECAST_SOURCES.md`. In short:

| Data | Source | Licence |
| --- | --- | --- |
| Forecast | US National Weather Service in the USA; MET Norway elsewhere | Public domain; CC BY 4.0 (credit on `/legal/credits`) |
| Ranges for days 6 to 8, Swiss resorts | MeteoSwiss open data, local forecasts with 10% and 90% ensemble values, read by a scheduled job every 12 hours | CC BY ("Source: MeteoSwiss", on `/legal/credits` and under the forecast) |
| Weather alerts | NWS, Environment Canada, MET Norway | Public domain; ECCC Open Government licence; CC BY 4.0 |
| Resort list | OpenSkiData (OpenSkiMap), time zones from `timezonefinder`, height checks from Copernicus GLO-30 | ODbL (derived files in `public/forecast/` are covered by the offer on the credits page); free with credit |
| Hours, closures, lift holds, grooming | mtnpowder.com resort feeds, 10 Alterra resorts only | No published terms; switched on by the owner on 2026-11-22 without explicit permission, can be switched off in `LIVE_SOURCES` |
| Observed history (USA) | NWS station observations | Public domain |
| Pin height | AWS terrain tiles | Free with credit |
| Pin map | OpenFreeMap, drawn with MapLibre GL JS | Free for any use, credit shown on the map |

Open-Meteo is not used (its free tier forbids commercial use).

## What is stored, and for how long

Full detail: `docs/FORECAST_HISTORY.md` (server) and `docs/PRIVACY_DATA.md`.

- **On the phone only:** the watchlist and pins (`fcList`), the calendar sort (`fcView`), trip days (`fcTrip`), saved forecasts (20 minutes fresh, kept for offline), saved resort status, the catalog files (cached as opened). Nothing about a person leaves the phone for the Forecast, except the resort id and place in each request.
- **On the server, per resort (never per person):** the last 72 hours of hourly weather (recorded only when someone asks about a catalog resort, at most every 30 minutes), the last good forecast (for the stale fallback, used for up to 48 hours), and an archive of forecasts as issued, at most one every 6 hours, pruned after 28 days. Pins are never stored.
- **Skier feedback ("How was it?"):** a rating, optional tags, resort and date, counted by day. No identity is kept, so an answer cannot be found or deleted later. Rate-limited by a hashed network code (see `IP_SALT` below).

## Files map

| Area | Files |
| --- | --- |
| Scoring engine (pure, no network) | `src/forecast/score/` (`index.js`, `hour.js`, `day.js`, `components.js`, `explain.js`, `codes.js`, `version.js`) |
| Screens | `src/forecast/ui.js` (calendar, day, add, edit), `pinscreen.js` and `pinmap.js` (pins), `tripscreen.js` (trip), `text.js` (wording and formats), styles in `src/styles.css` ("fc-" classes) |
| Phone data | `src/forecast/data.js` (load, score, offline), `watchlist.js`, `catalog.js` and `resorts.js` (search), `status.js`, `trip.js`, `pin.js`; `src/weather.js` (`loadWeather`, `loadHistory`), `src/feedback.js` |
| Worker (server) | `worker/meteoswiss.js` and `worker/meteoswiss-points.js` (ensemble job, built by `tools/build_meteoswiss_points.mjs`), `worker/weather.js` and `worker/sources/` (weather and alert adapters), `worker/history.js` and `worker/observations.js` (history store), `worker/resort-status.js` and `resort-status-feeds.js`, `worker/catalog.js`, `worker/elevation.js`, `worker/calibration.js`, `worker/index.js` (routes) |
| Catalog | `public/forecast/catalog-index.json`, `public/forecast/detail/*.json`, built by `tools/build_forecast_catalog.py`, ids kept in `tools/forecast_catalog_ids.json` |
| Calibration | `tools/forecast_backtest.mjs`, `tools/forecast_calibrate.mjs` |
| Tests | `tests/forecast-*.test.js`, `tests/weather-sources.test.js`, `tests/worker-catalog.test.js`, `tests/worker-elevation.test.js`; recorded data in `tests/fixtures/forecast/` (each file says in `_label` what it is and when it was recorded) |
| Docs | `FORECAST_PLAN.md`, `FORECAST_SPEC.md`, `FORECAST_SCORING.md`, `FORECAST_HISTORY.md`, `FORECAST_SOURCES.md`, design in `design/forecast/approved-design.md` |
| iPhone beta | `ios-beta/`, `.github/workflows/ios-beta.yml`: every merge to `main` also uploads a TestFlight build |

## Checking it again

```
npm ci
npm test                      # 457 tests; the formula, windows, local dates, missing hours, stale fallback, unresolved summit data and closures are in the forecast-*.test.js files
npm run lint
npm run build:assets && npm run smoke
node tests/acceptance/acceptance.mjs [site address]
```

The expected local failure of `npm test` is the Sunday River map test, because the other maps live in R2 (`node tools/maps_r2.mjs pull --all` fixes it).

`tests/acceptance/acceptance.mjs` drives the live site (default `https://skiwithme.builtbyroger.app`) with Playwright in four set-ups (360 px and 1280 px, light and dark): empty list, add Jay Peak, Burke and Cannon through search, sort, open a day and come back to the same place, remove all three, add Sundown Mountain Resort (a small Iowa hill), Zermatt and Mount Buller (Southern Hemisphere), reorder, reload, open each, plan a trip, add a pin by coordinates. It writes `smoke-output/acceptance/report.json` (every cell's text, the day views, console errors, horizontal-scroll checks) and a set of screenshots (calendar, day, add, trip, pin) beside it; the folder is git-ignored. It exits with an error when a page error, a failed request or a horizontal scroll appears, and also when one of three checks fails: the "Where should you ski?" prompt must show after every mountain is removed in Edit list, Back from a day view must return to the same place (same scroll position, same sort and the same cell focused), and the row order set in Edit list must be kept through a reload. Change the three mountain names at the top of the script to try others. The live API can be checked with curl (User-Agent `weski-build`): `/api/weather?...&id=<id>`, `/api/history/<id>`, `/api/resort-status/<id>`.

### What the 2026-11-22 acceptance run showed

Against main at 8d71ea4, live. Weather answers took about 0.6 s.

| Step | Result |
| --- | --- |
| 1. Jay Peak, Burke, Cannon through search; compare a date; hourly view; return | Pass. Scores for Sun 22 to Sat 28 Nov, for example Jay Peak 57, 55, 64, 74, 78, 63, 63 (Low confidence), Burke 60, 58, 66, 75, 78, 73, 74 and Cannon 57, 53, 65, 75, 78, 61, 74 (Medium, Low on the last day). Sorting kept, scroll position, row order and the focused cell were the same after coming back from the day view |
| 2. Replace with a small hill, a resort outside North America, a Southern Hemisphere resort; add, reorder, reload, open | Pass with Sundown Mountain Resort (Iowa, 131 m vertical, not a mapped resort), Zermatt – Cervinia (Switzerland) and Mount Buller (Australia): all added from search, order kept through reload, no code or config edited. Zermatt 69 to 93 (Medium), Sundown 60 to 73 (Low: one estimate, the weather service cannot separate base and summit), Buller 56 to 40 (Medium). Time zones in the day views were Europe/Zurich, America/Chicago and Australia/Melbourne. Mount Buller has no "Today" cell: it is already 23 November there |
| 3. Pin by map | Pass. A pin at 44.5, -72.78 with a base height gave 59, 57, 65, 74, 78, 63, 63 with Low confidence, labelled "Pinned" and "Terrain unverified", and the day view says it is one estimate for the whole mountain. The OpenFreeMap map drew in headless Chromium |
| 4. Formula, windows, local dates, missing hours, stale fallback, unresolved summit data, closures | Pass in `npm test` on labelled fixtures (not live data). Live check: all three mountains used assumed hours (9 to 16) because the status source covers only 10 Alterra resorts, and no alerts were in force |
| 5. Narrow phone, without colour | Pass. At 360 px nothing scrolls sideways on the page (the calendar scrolls inside its own frame, by design). Every cell carries the number, a word, the window and bars with Low, Med or High, and its spoken label has the same text, so colour is never the only signal. Checked by eye on the screenshots; contrast was checked in earlier phases and not measured again |

Snow history: Sundown had observed hours (NWS), Zermatt and Buller had none (no observation source outside the USA), so their confidence is capped at Medium and the calendar says history is limited.

Found and fixed in this pass (each has a test): the trip screen printed "undefined" instead of the score on each day tile (and in its spoken label); removing every mountain in Edit list and tapping Done left an empty calendar instead of the "Where should you ski?" prompt; a wet base under a dry, cold summit was explained as "Rain is likely across the whole mountain" (Zermatt, 23 November, summit -13 C); it now says "Rain is likely at the base; drier higher up." (new code `EX_RAIN_AT_BASE_DRY`, engine 1.6.0).

Filed for the owners: #50 (out-of-season resorts such as Mount Buller in November still get ordinary scores) and #51 (a -25 C summit still scores Epic).

Seen and left alone: the "Base and summit" block in the day view is about 5 px wider than its card at 360 px (cosmetic, nothing is cut off).

## Known limits

- **Ensembles only in Switzerland.** Swiss resorts get ranges for days 6 to 8 from MeteoSwiss (issue #57). Elsewhere the weather comes from one model per place, day 6 has no range and "Close call" never appears. See "Ensembles and ranges" in `docs/FORECAST_SOURCES.md`. The MeteoSwiss job runs on Cloudflare only once deployed; it has not run there yet.
- **Calibration needs a season of data.** Round 1 used airport observations only (`docs/FORECAST_SCORING.md`). Real calibration needs the forecast archive and skier feedback from a winter.
- **Hours, closures and season dates** exist only for 10 Alterra resorts. Everywhere else the 9 to 16 window is assumed and the screens say so; nobody can tell the app a resort is out of season (#50).
- **Translations were written by Claude and not checked by native speakers.** New Forecast wording exists in all ten languages.
- **Nothing has been tested on a real phone.** All checks used Playwright with Chromium on a Mac, at phone sizes. Touch feel, the pin map on a phone, offline behaviour of the installed app and the TestFlight build are untested.
- Snow history outside the USA builds up only from the moments someone asks about a resort.
- Pins are one 30 m ground height; on a ridge it can be 10 to 50 m off (the person can overwrite it).
- Catalog names and places are as OpenStreetMap has them; a resort near a border can carry the neighbour's region.

## Owner to-dos

- **#42 (for Connor):** set the `IP_SALT` secret on the Worker (needed before the paid launch: without it the anonymous network codes used for rate limits can be worked back to an address), push the compact terrain files to R2 with `node tools/maps_r2.mjs push --all` (optional, halves the download per mountain), and later, only if wanted, set `ARCHIVE_ADMIN_SECRET` to turn on the calibration export. Never paste secret values into chat or issues.
- **#17:** allow pinch-zoom (the app's zoom lock fails WCAG 1.4.4). Needs both owners' decision and a real iPhone, because it can change two-finger gestures on the 3D map. Forecast acceptance item AC-46 waits on it.
- **#50 and #51:** decide what to show for resorts with no season data, and whether very cold days should score lower.
- Decide whether to keep the mtnpowder.com feeds switched on (no published terms; Alterra's contact is on its terms page), and whether to archive the separate SkiReport repository (open question in `docs/FORECAST_PLAN.md`).
- Try the TestFlight build on a real iPhone and report what feels wrong.
