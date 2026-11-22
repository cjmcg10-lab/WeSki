# Forecast history, observations and archive (server side of issue #5)

Part of #1. The engine side (how history changes scores and confidence) is in `docs/FORECAST_SCORING.md`. This page covers what the Worker keeps and serves.

## What is kept, and when

A resort is only recorded when somebody asks about it: the phone adds `&id=<resort id>` to `/api/weather` (`loadWeather` in `src/weather.js` does this for any place that has an id). No id, no recording. Nothing crawls resorts. A new Durable Object class, `ForecastHistory` (one per resort id, SQLite backed, binding `FORECASTHIST`, migration tag `v3` in both wrangler configs), holds:

| Key | What | Size (measured with the recorded Stowe forecast) |
| --- | --- | --- |
| `hist` | The last 72 hourly rows for the summit and base: temperature, feels-like, snowfall (cm in that hour), wind, gusts, visibility, weather code, plus `issued` (when the forecast was issued), `acc` (the hours the source's snowfall figure covered: 1 to 6 for NWS, 1, 6 or 12 for MET Norway), `src` (`nws`, `met` or `nws-obs`) and `model` (`nws_ndfd`, `met_locationforecast` or `obs:<station>`) | about 22 KB when full (about 157 bytes a row) |
| `last` | The last good `/api/weather` response, for the stale fallback | about 21 KB |
| `a:<issue time in ms>` | One archived forecast (see Archive) | about 9.5 KB each |
| `meta` | The place first seen, the newest issue time, the last archive time | about 0.2 KB |

Rows are keyed by the hour's UTC start, so daylight-saving changes cannot merge or split hours: a fall-back day keeps 25 rows and `GET /api/history` labels the repeated hour `01:00` twice, in order; a spring-forward day has 23 rows and no `02:00`. Local labels are made when the rows are read, from the resort's time zone.

**Overlap.** A row holds one hour's snowfall, so two forecasts that cover the same hour never add up: the later issue replaces the earlier one for that hour, an earlier issue arriving late is ignored, and a measured (observed) hour is never replaced by a forecast. NWS gives snowfall in blocks of up to 6 hours; the adapter spreads a block evenly over its hours and records the block length in `acc`. NWS observations that report the last 1, 3 or 6 hours of precipitation are claimed finest first: a longer total only spreads what the shorter ones left over, so overlapping totals are never counted twice. Most stations report no total at all; the hour then keeps the forecast's snowfall (flagged `snowEstimated`) until a later forecast confirms it, and the engine counts the hour as measured for temperature, wind and visibility but never for snowfall.

## NWS observations (USA only)

For each of the summit and the base, the Worker reads `points/<lat>,<lon>` (already cached for the forecast), the grid's station list (24 hour cache), picks the nearest station within **25 km** whose height is within **300 m** of that site (distance plus 1 km per 50 m of height gap decides between candidates), and reads its last 72 hours of observations (`start` rounded to the hour, 15 minute cache, 500 at most). Requests use the User-Agent `weski-build` and go through the same Cloudflare cache as the forecast, so a busy resort costs the NWS at most one request per cache window. Most summits have no station that close in height, so usually only the base has measured hours. A failed observation fetch is logged and skipped; the forecast and the recording carry on.

## Endpoints

- `GET /api/weather?...&id=<resort id>`: unchanged shape, with new top-level fields: `model`, `issuedAt`, `fetchedAt`, `ageHours` (hours since the source issued it), `stale` (false), `resolutionKm` (nominal model grid: 2.5 for the US grid and MET Norway's Nordic model, 9 for MET Norway's global model elsewhere), `gridElevation` (`{ summit, base }` in metres from the NWS grid cell; null for MET Norway). The `id` also switches on recording and the stale fallback.
- **Stale fallback.** If no source answers and the resort has a recorded forecast issued within the last 48 hours, the same endpoint returns that forecast with `stale: true` and `ageHours` counted from its issue time (cache 60 seconds). The engine reads those two fields and gives Low confidence (`CR_STALE`). Without a usable copy the answer is the old 502. The Worker does not replace a fresh but old forecast with an older stored one; it only labels the age.
- `GET /api/history/<resort id>`: `{ id, tz, sources, ageHours, coverage: { summit: { hours, observedHours }, base: {...} }, summit: { hourly }, base: { hourly } }`. Each `hourly` has the same fields as the weather's (`time` local labels, `temperature_2m`, `apparent_temperature`, `snowfall`, `wind_speed_10m`, `wind_gusts_10m`, `visibility`, `weather_code`) plus `observed` (a boolean per hour). Hours run oldest first up to the last completed hour. 404 until the resort has been recorded. Pass it to the engine as `opts.history`. `ageHours` is the age of the newest source that fed the history. A resort that has just started being watched only has the completed hours of today (from local midnight) plus, in the USA, up to 72 hours of observations; the rest builds up by itself.
- The archive has no public route yet (phase 8 adds one, or reads `ForecastHistory.archive(sinceMs, limit)` from inside the Worker).

Recording is cheap by design: a per resort gate (Cloudflare's cache, 30 minutes) lets one request in a half hour reach the Durable Object, the recording runs after the response is sent (`ctx.waitUntil`), and an unchanged forecast writes nothing. A request for a place far (over 5 km) from where the resort id was first seen is refused, so a wrong id cannot poison a real resort's history.

## Archive

Every forecast is archived as issued, at most one per resort every 6 hours (4 a day), and pruned after 28 days. An entry holds: `v` (`SCORING_VERSION` that scored it), `issued`, `fetched`, `source`, `model`, `resolutionKm`, `ms0` (UTC milliseconds of the first forecast hour; hours are consecutive from it), `hoursAssumed` (archive scores use the assumed 9:00 to 16:00 window, because the archive does not read the resort's status), `inputs` (age, resolution, elevation gap, history hours, observed hours at that time), the hourly numbers for each site over the 7 days (`t`, `snow`, `wind`, `gust`, `vis`, `code`), and per day `date`, `status`, `score` (unrounded), `mean`, `window`, `peak` (hour), `conf` (`[level, reason code]`), `wconf` and `detail`. That is enough for phase 8 to compare the forecast with what happened at each hour, the day score and the best window.

## Cloudflare free tier: limits checked and the math

Limits from <https://developers.cloudflare.com/durable-objects/platform/pricing/> (read 2026-11-22), Workers Free plan, SQLite backed Durable Objects, which are available on the free plan. Going over a daily limit makes further operations of that type fail until 00:00 UTC; nothing is billed on the free plan. Everything that touches the store is wrapped so a failure never breaks the weather response.

| Limit (free) | Amount | What this uses |
| --- | --- | --- |
| Durable Object requests | 100,000 a day | One RPC per recording (at most 48 a day per watched resort, usually fewer) plus one per `/api/history` read and one per stale fallback. 60 resorts watched all day: about 3,000 |
| Rows written | 100,000 a day (a key written by `put`, a key deleted, each count as a row) | Per resort per day with continuously fresh data: about 24 `hist` + 24 `last` + 24 `meta` + 4 archive entries + prune deletes, roughly 80. That supports about 1,200 resorts being watched all day. 60 resorts: about 5,000 |
| Rows read | 5 million a day | About 3 per recording and 2 per history read, so about 150 a day per resort. Not close |
| Stored data | 5 GB in total | Per watched resort: 22 KB history + 21 KB last good + 28 days of archive (4 a day x 9.5 KB, about 1.06 MB), about 1.1 MB. 60 resorts: about 66 MB. About 4,500 resorts would fill 5 GB; lowering `ARCHIVE_KEEP_MS` to 14 days halves the archive |
| Duration | 13,000 GB-s a day | Each call runs a few milliseconds (the archive scoring is the longest, a few ms of CPU, 4 times a day per resort) |
| Worker requests | 100,000 a day (unchanged by this work) | `/api/weather` already counted; `/api/history` adds a request per read |

Storage billing for SQLite Durable Objects began in January 2026 on the paid plan; the free plan stays at 5 GB. If the account is on the paid plan the same numbers apply with overage prices (rows written $1.00 per million over 50 million a month, storage $0.20 per GB-month beyond 5 GB), far from reachable at this scale. The owner should be asked before the number of watched resorts reaches the low thousands.

**Abuse.** The only way to create stores is `/api/weather` with a valid-looking id and a real forecast fetch; each creates a store of about 1 MB at most after 28 days. Anyone could invent ids, so the free daily limits are the backstop (they fail operations, which the Worker swallows), not a quota per person. If that ever matters, restrict recording to ids in `public/data/index.json` and the phase 3 catalog.

## Tests

`tests/forecast-store.test.js` (stubbed key-value storage, recorded NWS stations and observations, a recorded Stowe forecast, no network): overlapping forecasts and totals, daylight-saving days, station choice, observation rows, the store (write skipping, observations, place check, last good, archive, pruning), `weatherResponse` (recording only with an id, the stale fallback end to end including the engine's confidence, failures of the store and of observations, `/api/history`) and model resolution. `tests/forecast-history.test.js` covers the engine side.
