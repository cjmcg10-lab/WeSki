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

- Downhill ski areas that are operating or have no status, with a name. Cross-country-only, abandoned, disused, proposed and unnamed areas are left out. An area with no mapped lifts that lies within 5 km of a lifted area (15 km when the names match) and shares a name word or website with it is folded into it, and its names become aliases. 195 areas were folded this way.
- Ids are `osd-` plus the first 36 characters of the OpenSkiData id (the server routes allow 40). The 60 built resorts keep their built ids (`jay-peak`) and their verified points from `public/data/index.json`, are matched to their OpenSkiData area by proximity and name, and take its region, country, aliases and town names. Duplicate areas of the same name next to them are folded in. They get the map flag and nothing else special.
- Base point: the lowest bottom station of the main sector's lifts. Top point: the highest top station in that sector. The main sector is the group of lifts (stations within 1.5 km of each other) with the most lift vertical. Other groups with at least two lifts are kept as `sectors` in the detail file.
- An area with no mapped lifts takes its heights from its mapped runs, and a point at the area's centre (flag `approximate_points`). With no runs either, only the base height comes from GLO-30 and the top is missing.
- Cross-check: every resort whose height is missing or whose vertical is under 5 m or over 2800 m is sampled against GLO-30, plus a random sample of 150 others as an audit. A lift height that differs from GLO-30 by more than 150 m is replaced and flagged `*_corrected`; a missing one is filled. The 2026-11-22 run checked 466 resorts besides the audit: 336 points agreed, 289 missing heights were filled, none needed correcting, 26 still have a questionable vertical (indoor and flat hills, or a lift mapped only at the base), the DEM had no data for one.
- Each point records its source (`lifts`, `lifts+glo30`, `glo30`, `runs`, `built`).

Files (all in git, served as static files):

| File | Content |
| --- | --- |
| `public/forecast/catalog-index.json` | One row per resort: id, name, aliases, towns, region, country code, top point, base point, top and base height, time zone, flag bits (1 top height missing, 2 base height missing, 4 approximate points, 8 built map exists, 16 status unknown). `idAliases` maps old ids to the ids that replaced them. About 731 KB, 345 KB gzipped |
| `public/forecast/detail/<country>.json` | Per resort: OpenSkiData id, status, website, flags, the source of each point, the DEM check, sectors. Loaded only when a resort is opened. 1.5 MB, 330 KB gzipped in all |

Update method: download the two geojson files into an empty folder outside the repository, then run

```
python3 tools/build_forecast_catalog.py --areas <ski_areas.geojson> --lifts <lifts.geojson> --data-date <metadata.json dataTimestamp date> --dem-cache <cache.json>
```

in a virtual environment holding `timezonefinder==9.2.0` and `rasterio`. Commit the changed files in `public/forecast/`. `--no-dem` skips the elevation check. `tools/forecast_catalog_ids.json` lists every published id plus a manual `id_aliases` map; the build stops if a published id disappears without an alias (`--allow-id-loss` only warns). Folded and merged ids get an alias automatically. The service worker does not pre-download `/forecast/`; it caches those files as they are opened, serving the saved copy at once and refreshing it in the background. The page code is `src/forecast/catalog.js` (`loadCatalog`, `search`, `getResort`, `loadDetail`).

Known limits: names and places are as OpenStreetMap has them, so a resort near a border can carry the neighbouring country's region name or town. A resort whose only mapped lifts are on one small hill has a small vertical (flagged). Season dates and opening hours are not in this source.

## Provisional mountains by map pin (#6)

Someone can add a mountain that is not in the catalog by dropping a pin (or two) on a map. Two outside sources are involved. Checked on 2026-11-22; nothing here needs an account or key.

| | Ground height | Map picture |
| --- | --- | --- |
| Provider | AWS Terrain Tiles (Mapzen terrain tiles, public bucket `elevation-tiles-prod`), Terrarium PNG tiles | OpenFreeMap (openfreemap.org), style `https://tiles.openfreemap.org/styles/liberty`, drawn by MapLibre GL JS 5.6.2 (BSD-3-Clause) from cdnjs with a pinned integrity hash |
| Licence | The tiles combine SRTM, USGS 3DEP and other public elevation sources. Free to use, including commercially; the credit is on `/legal/credits` (Terrain) | OpenFreeMap states its tiles are free for any use, commercial included, with no key or sign-up. Required credit: OpenFreeMap, OpenMapTiles, and © OpenStreetMap contributors. The map shows it on screen through MapLibre's attribution control, which is never hidden. Listed on `/legal/credits` (Pin map) |
| Used by | `GET /api/elevation?lat=&lon=` (`worker/elevation.js`): the Worker fetches one zoom 12 tile (about 30 m a pixel), decodes the PNG and returns metres. Latitude is limited to ±85 and longitude to ±180; anything else is a 400. Six second timeout, 30 day cache in `caches.default`, User-Agent `weski-build`, no personal data sent | The phone loads the map library and tiles only when the pin screen opens. If the library cannot load, the screen says so and the coordinates can be typed instead |
| Limits | A single 30 m pixel: on a ridge the number can be 10 to 50 m off the true top. The person can overwrite either height | OpenFreeMap is a free public service with no guarantee; heavy use may need our own tiles (see the decision below) |

Decision for #19 (the pin map's tile source): OpenFreeMap as is, chosen by the owner. If it becomes unreliable or the limits bite, switch to Protomaps tiles on our own Cloudflare R2 (only `STYLE_URL` in `src/forecast/pinmap.js` changes).

What a pin is: a list entry with `pin: true` and an id `pin-` plus six letters or digits (matches the server's `[a-z0-9-]` route pattern). It lives only on the phone, in the same watchlist. The server treats an id it does not know as unlisted: the weather answer is the same and nothing is stored in history for it, and the status answer is the assumed one. One point gives one estimate with Low confidence (`CR_ONE_ESTIMATE`); two points give base and summit estimates at the heights of the pins. Lift and run positions are never checked, so every pin is labelled Provisional and Terrain unverified. The time zone comes from the nearest catalog resort within 300 km, otherwise a fixed `Etc/GMT` zone from the longitude, and the screens say when it is a guess. A pin within about 3 km of a catalog resort offers "Is this <name>?".

## Weather sources (#8)

Phase 7 of the Forecast, part of #1. Licences, terms and endpoints checked on 2026-11-22 with live requests from this machine (User-Agent `weski-build`); the notes say where a statement comes from a provider's page rather than a request.

How it works (`worker/weather.js`, `worker/sources/`):

- **Adapter.** Each forecast source is an object `{ id, model, family(lat, lon), covers(lat, lon, alt), variables, horizonHours, nominalKm(lat, lon), fetchPoint(lat, lon, alt, tz, grid) }`. `fetchPoint` returns the hourly points in the shape the rest of the Worker already reads (`t`, `feels`, `wind`, `gust`, `snow`, `rain`, `vis`, `frz`, `code`, `filled`, ...), so the history store and the scoring engine need nothing from a particular service. `nws.js` and `met.js` are the first two adapters; `index.js` lists them in order.
- **Routing.** `routeForecast({ lat, lon, alt, variable, leadHours })` returns the adapters that cover the place and height, offer the variable and reach the lead time, best first. `forecast()` asks the first, and moves to the next when a service fails or answers an error (the US service first inside the US box, MET Norway last: it covers the whole world and is the baseline). With two adapters this is the same fallback `/api/weather` always had.
- **Model family.** Each adapter says which model family stands behind its numbers at a place (`family(lat, lon)`): `ncep_blend` (the NWS digital forecast), `meps` (MET Norway's Nordic model), `ecmwf_ifs` (MET Norway's global model). `independentFamilies(adapters, lat, lon)` counts a family once however many services distribute it, so a future second source of the same model can never read as agreement between models. `/api/weather` reports the answering family as `family`.
- **Alerts** are a separate kind of adapter (`worker/sources/alerts.js`): `{ id, covers, fetchAlerts }`. They are asked in parallel with the forecast for the summit point, and a failing alert service gives no alerts and is logged; it never fails a forecast. Alerts have their own budget of 1.5 seconds for the whole lookup (and a 1.4 second fetch timeout), after which the forecast goes out with `alerts: []`, so a slow alert service cannot delay it. A stale answer served from the saved last good forecast always has `alerts: []`, so a cancelled warning never comes back. Only winter storm, snow, ice, freezing, wind chill, extreme cold, high wind, gale, storm and avalanche alerts are kept, and tropical, storm surge, dust, freezing spray, marine, coastal, surf and flood alerts are left out. A US point is asked of the NWS first, and only a point the NWS refuses (HTTP 400, outside the US) goes on to Environment Canada, so a Vermont resort never costs a Canadian request.
- **`/api/weather` response.** Unchanged, plus two additive fields: `family` and `alerts: [{ event, level: 'watch' | 'advisory' | 'warning', from, to, source }]` (`from` and `to` are the resort's local `YYYY-MM-DDTHH:00`; `[]` when there are none). The scoring engine turns them into the day note `NT_WEATHER_ALERT` (see `docs/FORECAST_SCORING.md`); an alert never changes a score.

### Live sources

Every row here is called by the Worker today. Each can be removed on its own by taking it out of its list (`FORECAST_ADAPTERS` or `ALERT_ADAPTERS`).

| Provider and endpoint | Area | Model family | Variables | Time step | Horizon | Update schedule | Licence and attribution | Fallback | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| US National Weather Service forecast grid: `api.weather.gov/points/<lat,lon>` then the `forecastGridData` it names | The US box in `inUS` (lower 48 and Alaska) | `ncep_blend`: the NWS digital forecast, edited by forecasters | Temperature, feels-like, wind, gust, direction, sky cover, chance of precipitation, precipitation amount, snowfall amount, visibility, snow level, weather type | 1 to 6 hour blocks, spread over the hours | 7 days used (the grid runs about 7) | Grid regenerated about hourly, model data every 6 to 12 hours (`updateTime`); shared through Cloudflare's cache for 1 hour | Public domain (weather.gov disclaimer: any lawful purpose, do not imply NWS endorsement). Credit given on `/legal/credits`. No fixed rate limit published ("generous for typical use", a refused request can be retried after about 5 seconds). The NWS asks for contact details in the User-Agent; `weski-build` has been accepted, and the owner's rule is to send no personal details | MET Norway | **Live** |
| MET Norway Locationforecast 2.0 `complete`: `api.met.no/weatherapi/locationforecast/2.0/complete` | Worldwide (the baseline) | `meps` in the Nordic box (`inNordics`), `ecmwf_ifs` elsewhere | Temperature, wind, gust (Nordic area only), direction, cloud, fog, precipitation, chance of precipitation, symbol. Snowfall, feels-like and freezing level are worked out from these | 1 hour for about 2.3 to 2.5 days, then 6 hours | 7 days used (the service gives 9 to 10) | Several times a day; the response's `Expires` is honoured; shared through Cloudflare's cache for 1 hour | CC BY 4.0, credit "Weather data from MET Norway" on `/legal/credits`, say that it was changed. Under 20 requests a second in total, cache, identify the application in the User-Agent (checked on `api.met.no/doc/TermsOfService`) | None: this is the last resort | **Live** |
| NWS alerts: `api.weather.gov/alerts/active?point=<lat,lon>` | US | Not a model | Event name, severity, onset, end | Alert by alert | Whatever is in force or announced | Real time; shared for exactly 5 minutes (the upstream's own expiry is not used) | Public domain | Environment Canada for a point the NWS refuses | **Live** |
| Environment Canada weather alerts: `api.weather.gc.ca/collections/weather-alerts/items?bbox=<lon,lat,lon,lat>` | Canada | Not a model | Alert name, type, colour, validity and end time, status (`ended` ones are dropped) | Alert by alert | Whatever is in force | Real time; shared for exactly 5 minutes (the upstream's own expiry is not used) | ECCC Data Services End-use Licence 2.1.1 (commercial use allowed): "Data Source: Environment and Climate Change Canada", link to the licence, and a weather alert's content or intent must not be altered, so the alert's own name is shown | None | **Live** |
| MET Norway MetAlerts: `api.met.no/weatherapi/metalerts/2.0/current.json?lang=en&lat=&lon=` | Norway, land areas (sea alerts are dropped) | Not a model | Event name, awareness colour, period | Alert by alert | Whatever is in force | Real time; shared for exactly 5 minutes (the upstream's own expiry is not used) | CC BY 4.0, same terms as the forecast | None | **Live** |

NWS observations (`worker/observations.js`, for the history) and the NWS raw grid are the same service as the first row: the "raw grid" is exactly what the adapter reads (`forecastGridData`).

### Candidates and rejected sources

Not called. The verdict says why, and what would be needed.

| Candidate | Area | Model family | Variables and step | Horizon | Licence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Environment Canada HRDPS and GDPS through GeoMet WMS** (`geo.weather.gc.ca/geomet`) | Canada (HRDPS 2.5 km); worldwide (GDPS) | `hrdps`, `gdps` (Canadian GEM) | Temperature, wind, precipitation, 1 hour, HRDPS to 48 hours | 48 h (HRDPS), 10 days (GDPS) | ECCC licence as above, commercial use allowed | **Not built.** A point value comes from `GetFeatureInfo`, which takes one time per request: a time range is refused (live: "Date format error"). One day of hourly values for summit and base would be about 500 requests per resort. The post-processed point forecasts (`prognos-hrdps-realtime`) exist only for weather stations, one record per variable, station and hour, so they do not describe a mountain. The town forecasts (`citypageweather-realtime`) are town level, 24 hours hourly, not height aware. The GRIB2 files on the Datamart need a GRIB decoder (see the ensembles row). Canada keeps MET Norway's global model plus the alerts above |
| **MET Norway regional guidance (Nordics)** | Nordics | `meps` | Same as Locationforecast | About 2.3 days hourly | CC BY 4.0 | **Already live.** Locationforecast uses MET's Nordic model in the Nordic area (it is why Nordic answers carry gusts and a 2.5 km grid), so there is no separate regional product to add. MetAlerts is live for Norway. Sweden and Finland have no alert source here |
| **Météo-France AROME** (`portail-api.meteofrance.fr`, `public-api.meteofrance.fr`) | French Alps and Pyrenees, about 1.3 km (from Météo-France's description, not re-checked) | `arome` | Gridded fields (WCS), hourly | About 2 days | Etalab Open Licence per Météo-France's published description (not re-checked here; commercial use with attribution) | **Candidate, needs the owner's account.** The API answers `401 Missing Credentials` without a key (live), and a key needs a free account on the Météo-France API portal. Do not build the key flow before the owner creates the account and adds the key as a secret. The data is gridded, so a point forecast also needs a grid decoder |
| **MeteoSwiss open data, local forecasts** (`data.geo.admin.ch`, collection `ch.meteoschweiz.ogd-local-forecasting`) | Switzerland: 5,800 points (stations, postal codes, and mountain points such as Pizol 2,844 m and Piz Corvatsch 3,451 m) | ICON-CH1-EPS and ICON-CH2-EPS ensembles, INCA and ECMWF blended (`icon_ch_blend`) | Temperature, precipitation, wind, gust, zero degree level, cloud, sunshine, each hourly with the **10% and 90% quantiles of the ensemble** | 192 hours (8 days) | CC BY (collection licence); commercial use allowed with credit | **Real value, not buildable per request.** Each parameter is one CSV of about 32 MB holding every point for all hours, sorted by hour and then point, so one point is spread through the whole file: about 190 range requests per parameter or the whole 32 MB, times about 8 parameters. A request-time Worker cannot do that. It would need a scheduled job (a cron Worker) that streams each new run once for the Swiss resorts on the list and stores their series, which is new infrastructure. It is the only candidate here that gives real ranges (days 6 to 8), so it is the next one worth building. It carries no snowfall, so snow would be worked out from precipitation and temperature as for MET |
| **ECMWF open ensembles** (`data.ecmwf.int/forecasts`) | Worldwide, 0.25 degrees, 51 members | `ecmwf_ens` | Many, 3 hourly then 6 hourly | 15 days | CC BY 4.0, commercial use allowed with attribution (checked on ECMWF's open data page) | **Not feasible.** Files are GRIB2 only, one field per member, variable and step. A point needs the whole global field for each, and no GRIB2 decoder is installed or allowed without a new dependency. Needs a decoding service outside the Worker |
| **NOAA GEFS** (`noaa-gefs-pds` on AWS) | Worldwide, 0.25 degrees, 30 members plus control | `gefs` | Many, 3 hourly | 16 days | US government work, public domain | **Not feasible.** GRIB2 with `.idx` byte ranges (live: each field is 0.35 to 0.9 MB). One point for 10 days would be about 30 members x 4 variables x 80 steps, around 9,600 fields or about 5 GB, and the same decoder problem as ECMWF |
| **Meteoalarm** (`feeds.meteoalarm.org`) | Europe alerts | Not a model | CAP warnings by country | In force | Terms page could not be read (it is built in the browser), so the licence is unverified | **Not built.** One country is a 21 MB JSON (live: Switzerland) and the licence is unclear. National services (MetAlerts) are used where they are simple |
| **Open-Meteo** (hosted forecast and ensemble APIs) | Worldwide | Many (`ecmwf`, `gfs`, `icon`, ...) | Many, hourly | 16 days | The free API is for non-commercial use only; its terms list "websites or apps that have subscriptions or display advertisements" as commercial, and commercial use needs a paid plan (`open-meteo.com/en/terms`, 2026-11-22) | **Rejected.** SkiWithMe sells passes, so the free tier is not allowed and the owner wants no paid services. This is why it was removed earlier. It would be the easiest ensemble source if the owner ever buys the Standard plan |

### Ensembles and ranges for days 6 to 15

**No ensemble source is feasible from a Cloudflare Worker at no cost.** The open ensembles (ECMWF, GEFS, and Environment Canada's GEPS) are published as GRIB2 fields, the one with ready-made point ranges (MeteoSwiss) is a 32 MB file per parameter, and the one with a plain JSON ensemble (Open-Meteo) does not allow commercial use without a paid plan. So phase 7 adds no ensemble members: the scoring engine keeps its `detail` labels (`range` for days 6 to 9, `trend` for 10 to 14) with no `range: {low, high}` field, and the screens keep showing those days as an outlook with no numbers, as `docs/FORECAST_SCORING.md` describes. The engine's `uncertainty` stays `null`, so no "Close call" can appear, and nothing is invented.

What would be needed, cheapest first:

1. **Swiss resorts:** a cron Worker that streams the MeteoSwiss run files and keeps each listed resort's hourly series with its 10% and 90% quantiles in a Durable Object or KV. Scoring the quantile series next to the central series gives a low and high day score for days 5 to 8 for Swiss resorts only.
2. **Everywhere:** a decoding service for GRIB2 (outside the Worker) that cuts the 31 GEFS or 51 ECMWF members to one point per watched resort once per model run, or the owner's paid Open-Meteo Standard plan. With members, each member would be scored separately by `scoreForecast` and the low and high taken per day (for example the 10th and 90th percentile of the member day scores), so a range is a spread of scored scenarios and not a spread of weather values.

### Live check (2026-11-22, from this machine)

One resort per covered region, through `forecast()` with real services (`UA weski-build`), one request set each:

| Resort | Source, model, family, grid | Result |
| --- | --- | --- |
| Stowe, Vermont (US) | `nws`, `nws_ndfd`, `ncep_blend`, 2.5 km | Answered in about 1.1 s; grid height 638 m against the summit's 1,116 m, so temperatures were corrected for height; today 8 to -0.3 °C, no snow, gust 9.8 m/s; no alerts |
| Mont Tremblant, Quebec | `met`, `met_locationforecast`, `ecmwf_ifs`, 9 km | The NWS refuses the point (404), the Worker falls back to MET Norway as before; no alerts in force |
| Lake Louise, Alberta | `met`, `ecmwf_ifs`, 9 km | MET Norway; today -12 to -19 °C |
| Hemsedal, Norway | `met`, `met_locationforecast`, `meps`, 2.5 km | MET Norway with its own gusts (5.8 m/s) from the Nordic model; MetAlerts answered, none for ski weather (a road ice alert in the north is dropped on purpose) |
| Zermatt, Switzerland | `met`, `ecmwf_ifs`, 9 km | 32 cm of snow forecast for the day |
| Val Thorens, France | `met`, `ecmwf_ifs`, 9 km | 60 cm of snow forecast for the day |

Alerts, checked against what was in force at the time: Hurricane Ridge, Washington returned the NWS "Winter Weather Advisory" (onset 18:00 PST, ends 16:00 the next day). Kapuskasing, Ontario (inside the US box, refused by the NWS with HTTP 400) returned Environment Canada's "Snowfall warning" through the hand-over. Both are recorded in `tests/fixtures/forecast/`.

### Tests

`tests/weather-sources.test.js`, on recorded responses in `tests/fixtures/forecast/`: `nws-gridpoints-stowe.json` (NWS point and grid), `met-locationforecast-zermatt.json` and `met-locationforecast-hemsedal.json` (MET Norway global and Nordic), `nws-alerts-olympics.json`, `eccc-alerts-kapuskasing.json`, `eccc-alerts-toronto-ended.json` (an ended alert is dropped) and `met-alerts-troms.json`. Each file says in `_label` what it is and when it was recorded. They cover the adapters, the fallback and the all-sources-fail error, routing by place, height, variable and lead time, model families counted once, the alert hand-over from the NWS to Environment Canada, a failing alert service, and the engine's `NT_WEATHER_ALERT` notes.
