# Forecast data sources

Issue #10 (resort status) and #8 (weather), part of #1. Checked on 2026-11-22.

## Resort status sources (#10)

What the Forecast needs from the resort itself: published operating hours, season dates, confirmed closures, lift status and holds, grooming reports. Weather is not covered here.

Rule: a source is **live** when the Worker calls it (`LIVE_SOURCES` in `worker/resort-status-feeds.js`); a **candidate** is built or considered but not called. Terms that clearly allow commercial use make a source live without question. Where terms are unclear, only the owner can switch it on, and the note below says so.

| Source | Verdict |
| --- | --- |
| mtnpowder.com resort feeds | **Live**, switched on by the owner without explicit permission |
| OpenStreetMap `opening_hours` | Candidate (almost no data) |
| Resorts' own pages | Not used (refuse automated clients; terms forbid it) |

### mtnpowder.com resort feeds

| | |
| --- | --- |
| Provider | Alterra Mountain Company's snow-report service, the same data its resorts' own apps and sites show |
| Endpoint | `https://mtnpowder.com/feed?resortId=<n>`, JSON, no key. Sent with User-Agent `weski-build` only |
| Coverage | 10 of our resorts: Stratton 1, Snowshoe 2, Winter Park 5, Steamboat 6, Deer Valley 49, Mammoth 60, Palisades Tahoe 61, Solitude 65, Sugarbush 70, Crystal Mountain 80 (mapping in `worker/resort-status-feeds.js`). The feed also answers for Blue 3, Tremblant 4, Bear 57 and June 59, which are not in the app yet. Alta 63, Snowbird 64, Jackson Hole 67, Big Sky 68 and Taos 78 return weather only, with no lift or trail data |
| Fields we use | `LastUpdate` (resort local time with offset), `OperatingStatus`, per lift: `StatusEnglish` (`open`, `delayed`, `open_to_mid_station_only`, `closed`, `closed_for_season`), `Hours` (open and close for each weekday), `UpdateDate`; per trail: `Grooming` (`Yes`, `Nightly`, `No`), `StatusEnglish`, `UpdateDate` |
| Fields it does not have | Season open and close dates. A hold reason (wind or otherwise). The time a hold lasts. A real grooming time: `UpdateDate` is when the resort last edited the trail record |
| Licence and terms | **Unclear.** The site's only terms page (`/terms-of-use`) covers the text-alert sign-up and ends "All Rights Reserved". Nothing is published about the JSON feed, an API, automated access or commercial reuse. `robots.txt` blocks only some summer pages and does not mention `/feed` |
| Limits | None stated. The server sends `cache-control: max-age=180` |
| Caching | The Worker keeps the raw feed in Cloudflare's cache for 300 seconds and answers with `max-age=300`, shared by everyone. It is fetched only when the app asks for a watched resort |
| Status | **Live.** Switched on by the owner (Zach) on 2026-11-22. mtnpowder.com publishes no terms for the feed, so this is used without explicit permission; if Alterra objects or blocks it, remove `'mtnpowder'` from `LIVE_SOURCES` and every resort falls back to the labelled assumed hours. Requests are kept minimal: shared through Cloudflare's cache, made only when the app asks for a watched resort, User-Agent `weski-build`, 8 second timeout. Alterra's contact on the terms page is `webmaster@alterramtnco.com` |

How the feed is read (`worker/resort-status.js`):

- Hours: the most common lift schedule across all lifts and weekdays, as whole hours (open rounded up, close rounded down, so 8:30 to 16:30 is 9 to 16). **One schedule for every day:** the feed has a schedule per weekday and per lift, but the Forecast takes one window, so a resort that opens later or closes earlier on some weekdays is scored with its most common hours. Not published when lifts list no times.
- Season state: any lift open, delayed or open to mid-station means `open`; every lift `closed_for_season` means `closed_for_season`. `not_open` is set only when the feed was generated inside the published hours and at least one lift shows `closed` with an `UpdateDate` from today (resort local time). Otherwise the state is unknown (`null`): a feed read in the evening or before opening says nothing about the day. No dates, because the feed has none.
- Closure: only when the headline status is Closed and the state is `not_open`, for the feed's local date only. A resort whose headline says Closed while lifts run (Palisades Tahoe on 2026-11-22) is not closed. Closed for season is a season state, never a closure.
- Lift holds: lifts that are `delayed` (`delayed`) or `open_to_mid_station_only` (`partial`) whose own `UpdateDate` is today (resort local time), dated from that `UpdateDate`. A plain `closed` lift is not a hold, because the feed cannot tell a hold from a lift that is simply not scheduled. The reason is unknown, so a hold is never labelled as wind.
- Grooming: trails marked `Grooming: Yes` and open, updated within 24 hours before the feed's generation time. The engine counts a report from the 24 hours before the first weather hour as that hour.
- Staleness: `LastUpdate` is when the feed was generated, not when the resort last reported. A feed whose newest lift `UpdateDate` is more than 36 hours old is treated as no data (assumed), except when every lift is `closed_for_season`, which is a settled state. A resort whose lifts really do not change for a day and a half therefore falls back to assumed; this has not been seen in the data.

### OpenStreetMap `opening_hours`

| | |
| --- | --- |
| Provider | OpenStreetMap contributors, via Overpass or the extracts the map pipeline already uses |
| Coverage | Checked on Stowe: the resort's `landuse=winter_sports` outline has no `opening_hours`, and no lift within 6 km carries one. The local map files carry none. Season dates are not mapped either |
| Licence | ODbL 1.0. Allowed commercially with credit. Anything derived and published is a share-alike database, which is why the credits page already offers the derived database |
| Limits | Overpass asks for modest use. No live status at all (no holds, closures or grooming) |
| Status | **Candidate.** Allowed, but with nothing to read there is nothing to build. Worth a second look per resort when someone maps it |

### Resorts' own pages and apps

Epic resort sites and most others refuse automated clients, and `CLAUDE.md` forbids faking a browser to get past that. Their terms generally bar scraping. Not used.

### Not found

No free, commercially licensed source of season open and close dates or of lift holds with reasons exists for the rest of the world. Those resorts keep the labelled assumed window of 9:00 to 16:00 and no closure, hold or grooming information, and the app must say so.

### How the app gets it

`GET /api/resort-status/<id>` (`worker/resort-status.js`) returns:

```
{ id, source: 'mtnpowder' | 'assumed', fetchedAt, updatedAt (null when assumed),
  hours: { from, to } | null,
  season: { open: null, close: null, state: 'open' | 'closed_for_season' | 'not_open' } | null,
  closures: { 'YYYY-MM-DD': { code, params, source } },
  liftHolds: [{ lift, status: 'delayed' | 'partial', date, at }],
  grooming: [{ trail, at }],
  assumed: boolean }
```

`assumed: true` means nothing real is known (unmapped resort, source not live, stale feed, or the phone could not reach the server); the engine then keeps its labelled assumed window. `src/forecast/status.js` has `loadResortStatus(resort)` and `statusToScoreOpts(status)`. A feed failure (including a body that is not JSON, which is never cached) returns 502 with `no-store`, and the phone falls back to the assumed status after a 6 second timeout. `assumedStatus` is defined once in `src/forecast/status.js` and imported by the Worker.

## Resort catalog source (#4)

The worldwide list of resorts the Forecast can watch. Checked on 2026-11-22.

| | |
| --- | --- |
| Provider | OpenSkiData (openskidata.org), the data behind OpenSkiMap.org. Built from OpenStreetMap with ski area records from Skimap.org and place names from Who's On First |
| Files | `https://tiles.openskimap.org/geojson/ski_areas.geojson` (21 MB) and `lifts.geojson` (120 MB, lift ends carry a height). Data timestamp 2026-11-21. Sent with User-Agent `weski-build` only. Raw downloads stay out of the repository |
| Licence | The site states the data is free to use, including commercially, and is ODbL because it derives from OpenStreetMap. A modified version that is distributed must be shared alike, and each source needs crediting. The credit is on `/legal/credits` (Worldwide resort list). The catalog files in `public/forecast/` are the derived database and are covered by the offer on that page |
| Time zones | `timezonefinder` 9.2.0 (code MIT, boundary data `timezonefinder-data` 4.2026.6, ODbL), offline, at the base point |
| Elevation check | Copernicus GLO-30 (public AWS bucket `copernicus-dem-30m`, free including commercial use with the credit on the credits page), read with `rasterio` over HTTP range requests, only for the resorts listed below |

What goes in (`tools/build_forecast_catalog.py`):

- Downhill ski areas that are operating or have no status, with a name. Cross-country-only, abandoned, disused, proposed and unnamed areas are left out.
- Ids are `osd-` plus the first 36 characters of the OpenSkiData id (the server routes allow 40). The 60 built resorts keep their built ids (`jay-peak`) and their verified points from `public/data/index.json`, are matched to their OpenSkiData area by proximity and name, and take its region, country, aliases and town names. Duplicate areas of the same name next to them are folded in. They get the map flag and nothing else special.
- Base point: the lowest bottom station of the main sector's lifts. Top point: the highest top station in that sector. The main sector is the group of lifts (stations within 1.5 km of each other) with the most lift vertical. Other groups with at least two lifts are kept as `sectors` in the detail file.
- An area with no mapped lifts takes its heights from its mapped runs, and a point at the area's centre (flag `approximate_points`). With no runs either, only the base height comes from GLO-30 and the top is missing.
- Cross-check: every resort whose height is missing or whose vertical is under 5 m or over 2800 m is sampled against GLO-30, plus a random sample of 150 others as an audit. A lift height that differs from GLO-30 by more than 150 m is replaced and flagged `*_corrected`; a missing one is filled. The 2026-11-22 run checked 635 resorts: 336 agreed, 458 missing heights were filled, none needed correcting, 26 still have a questionable vertical (indoor and flat hills, or a lift mapped only at the base), the DEM had no data for one.
- Each point records its source (`lifts`, `lifts+glo30`, `glo30`, `runs`, `built`).

Files (all in git, served as static files):

| File | Content |
| --- | --- |
| `public/forecast/catalog-index.json` | One row per resort: id, name, aliases, towns, region, country code, top point, base point, top and base height, time zone, flag bits (1 top height missing, 2 base height missing, 4 approximate points, 8 built map exists, 16 status unknown). About 735 KB, 346 KB gzipped |
| `public/forecast/detail/<country>.json` | Per resort: OpenSkiData id, status, website, flags, the source of each point, the DEM check, sectors. Loaded only when a resort is opened. 79 files, 1.6 MB, 341 KB gzipped in all |

Update method: download the two geojson files into an empty folder outside the repository, then run

```
python3 tools/build_forecast_catalog.py --areas <ski_areas.geojson> --lifts <lifts.geojson> --data-date <metadata.json dataTimestamp date> --dem-cache <cache.json>
```

in a virtual environment holding `timezonefinder==9.2.0` and `rasterio`. Commit the changed files in `public/forecast/`. `--no-dem` skips the elevation check. The page code is `src/forecast/catalog.js` (`loadCatalog`, `search`, `getResort`, `loadDetail`).

Known limits: names and places are as OpenStreetMap has them, so a resort near a border can carry the neighbouring country's region name or town. A resort whose only mapped lifts are on one small hill has a small vertical (flagged). Season dates and opening hours are not in this source.

## Weather sources (#8)

Placeholder. Phase 7 (#8) fills in the weather table: the sources behind `/api/weather` today (US National Weather Service, MET Norway), what a second forecast for comparison could be, licences and limits.
