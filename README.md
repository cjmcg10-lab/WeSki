# WeSki

An installable web app for ski resorts: a low-poly 3D mountain built from real
LiDAR terrain, a one-tap 2D map, private friend groups with live GPS, directions that reroute as
people move, run stats with playback, and full offline use.

**Live app:** https://weski.cjmcg10.workers.dev

## What's in it

| Area | Details |
| --- | --- |
| Start | Spinning globe with a resort picker (search or scroll); picking a resort zooms the globe down to the ground and continues, without a cut or fade, into the 3D map; “Choose a different resort” (More) reverses it, with a save / don't-save choice. Ten resorts in four countries have built maps. |
| Maps | 3D mountain from national LiDAR elevation models (14 m mesh), every mapped trail, every lift animated on a real cable loop held clear of the snow (chairs, gondola cabins, tram cabins, T-bars, carpet sections), buildings, places, plus ~10 km of coarse surrounding terrain. 2D view with the base at the bottom. |
| Overlays | Difficulty colours and symbols, glades dashed, slow zones (green ▽) and terrain parks (orange ⬣) painted onto the snow surface. |
| Groups | Up to 20 people join by 6-character code; a display name is optional. Location sharing is opt-in, can be paused, and shows when each person last updated. |
| Directions | To a friend, a place, a dropped pin or the group meeting point. Uses trails downhill, lifts uphill and walking links, plus short climbs back up a trail and cut-acrosses to a neighbouring trail when that beats a lap (see Uphill tolerance); avoids closures you mark; keeps to your max difficulty where possible and warns when a route must go above it. |
| Voice | Optional spoken turn-by-turn directions, called ahead of each turn according to your speed, with a touch-proof Pocket mode that keeps the screen (and so GPS and speech) alive. |
| Weather | Summit and base conditions, ski-specific alerts, 12-hour strip and 7-day forecast (Open-Meteo). |
| My tracks | Optional dotted breadcrumb trail on the map along everything you have skied; works with or without stats tracking (location-only tracks are never added to History). |
| Appearance | Dark by default, light mode in More. |
| Stats | Current / average / top speed, runs, distance, vertical. Lift rides counted separately; GPS spikes filtered. |
| On a lift | Always-on lift detection (no stats or directions needed): about five seconds of steady movement up a lift line and you, your friends and replays are drawn seated in a chair (or cabin) on the cable. Directions asked for mid-ride start from the top of that lift. |
| History | Sessions, runs and routes are stored on the phone (IndexedDB) and can be replayed on the map, offline. |

## Data sources (all free)

- **Terrain:** USA: USGS 3DEP 1 m LiDAR DEM (public domain). Switzerland: swisstopo swissALTI3D 2 m.
  France: IGN RGE ALTI 1 m (Licence Ouverte). Japan: GSI 5 m LiDAR tiles where they exist, otherwise the
  GSI 10 m model (Geto Kogen is 10 m). Austria: BEV ALS DTM 1 m (CC BY 4.0), read straight from the
  national cloud-optimised tiles (`fetch_dem.py cog`). `tools/fetch_dem.py` downloads the non-US ones.
- **Trails, lifts, buildings, places:** © OpenStreetMap contributors (ODbL).
- **Surrounding terrain:** Mapzen/AWS Terrain Tiles. **Globe:** Natural Earth 1:50m and 1:10m, US Census state lines. **Weather:** Open-Meteo (CC BY 4.0).
- **Slow zones and terrain parks:** read from Jay Peak's Winter 2025–26 trail map and terrain parks
  page, then attached to the matching OSM trails in `tools/build_data.py`.

Closures are whatever the user (or their group) marks as confirmed closed; there is no live resort feed.
This is not an official product of any resort.

## Uphill tolerance

Trails are one-way downhill for routing, but a route may also go a short way back up a trail, back
up a link, or straight across open ground to a neighbouring trail (`src/routing.js`). Each such move
is scored in effort-time: real seconds times a multiplier.

| | Low | Normal (default) | High |
| --- | --- | --- | --- |
| Flat to 3% uphill (2 m/s) | 1.5× | 1× | 1× |
| 3–8% (1 m/s) | 4× | 2× | 1.5× |
| 8–15% (0.4 m/s) | not offered | 3× | 2× |
| 15–20% (0.3 m/s) | not offered | not offered | 3× |
| Steepest side slope on a cut-across | 20° | 25° | 30° |
| Total climb per route | 10 m | 25 m | 50 m |

Climbing on a black counts 1.5×, on a double black 2× (never at Low); trails above your limit keep
their usual heavy penalty. A cut-across is at most 70 m, is scaled by the side slope, and is dropped
if the ground between strays more than 5 m from an even grade or falls away steeper than 25%. A
step or two (2 m of climb) steeper than the cut-off is always allowed to reach a junction. The app
knows terrain only, not trees, ropes or signs.

## Layout

```
tools/build_data.py   LiDAR + OSM -> public/data/terrain.bin + resort.json (incl. routing graph)
tools/embed.mjs       copies the built app into the Worker bundle
src/                  the app (three.js map, routing, tracker, group client, storage)
worker/               Cloudflare Worker: serves the app + GroupRoom Durable Object (WebSockets)
tests/                unit tests (routing, tracker, group rules)
```

## Resorts

Built maps (26): **Jay Peak, Stowe, Smugglers' Notch, Sugarbush** (Vermont), **Cannon Mountain** (New
Hampshire), **Saddleback** (Maine), **Brundage Mountain** (Idaho), **Vail, Breckenridge, Keystone, Copper
Mountain, Steamboat, Winter Park** (Colorado), **Park City** (Utah), **Mammoth Mountain** (California),
**Heavenly** (California / Nevada), **Geto Kogen** (Japan), **Pizol, Zermatt** (Switzerland), **Les Contamines,
La Plagne, Les Arcs, Val Thorens, Tignes – Val d'Isère** (France), **SkiWelt** and **Saalbach Hinterglemm
Leogang Fieberbrunn** (Austria). Zermatt covers the whole
Zermatt – Cervinia area (Swiss 2 m model plus the Italian 10 m TINITALY model, INGV, CC BY 4.0).
Its Gornergrat railway and Sunnegga funicular, and the Les Arcs funicular, follow their real
track from the map data and are drawn as railways (bed, rails, sleepers, tunnels, trains). Very large resorts use a
wider terrain grid (16-23 m instead of 14 m) so they stay as light to draw as the others. Each resort is one folder
under `public/data/<id>/` and is downloaded and cached on the phone the first time it is opened.
History, saved tracks, closures and offline status are kept per resort.

Slow zones and terrain parks are only shown for Jay Peak so far; the others have not been checked
against their trail maps yet. Difficulty uses North American symbols everywhere, so a European blue
shows as a green circle, a red as a blue square and a black as a black diamond.

### Adding a resort

1. Write `tools/resorts/<id>.json`: `id`, `name`, `region`, `tz`, `area_name` (the name of the resort's
   `landuse=winter_sports` area in OpenStreetMap, used to keep neighbouring ski areas out), optional
   `slow_zone_trails`, `parks`, `parks_between`, `two_way_lifts`, `skip_pois`, `zones_source`, `rename`
   (name corrections), `base_link` (how far apart two lift bases may be and still be one base area),
   `isolated_lifts` (a village tow that really is not connected), `building_range`, `poi_range`
   (keep only places this close to the skiing, for resort towns), `dem_only` (drop what the
   elevation model does not cover), `extra_lifts` (railways and funiculars used as lifts: station `[lon, lat]` points,
   `kind` train/funicular and `rail: true` to follow the mapped track), `links` (hand-made joins: a summit tunnel between stations, a lift top to
   a trail, or `"trail:Name"` first for a run that stops short of a lift base), `cell` (terrain grid spacing; chosen automatically for very large resorts).
2. Download an OSM extract covering it (`api.openstreetmap.org/api/0.6/map?bbox=...`) and an elevation
   model: USGS 1 m DEM tiles (The National Map) in the USA, `tools/fetch_dem.py` for Switzerland, France
   and Japan. Any GeoTIFF in a metric projection works.
3. Run:
   ```
   python3 tools/build_data.py tools/resorts/<id>.json <osm file> public/data/<id> <dem.tif> [...]
   python3 tools/build_extras.py public/data/<id>      # surrounding terrain
   python3 tools/build_index.py public/data            # resort list for the picker
   python3 tools/build_globe.py public/data            # globe outlines (detail box follows the resorts)
   npm test                                            # every lift end must route to every other
   ```
   `build_data.py` prints a connectivity report; fix the config (or OSM) if trails are unreachable.

Resort data is uploaded as Cloudflare static assets by the GitHub deploy, so it is not bound by the
3 MB Worker limit (the eighteen resorts are about 22 MB on disk).

## Develop

```
npm install
npm test
npm run worker:dev     # build + run Worker locally on http://127.0.0.1:8787
npm run deploy         # build + wrangler deploy (needs a Cloudflare API token)
```

Everything runs on Cloudflare's free tier: one Worker (app files are bundled into it) and one
SQLite-backed Durable Object class. A group's shared locations are deleted when its creator closes
it or after 12 hours without activity.

## Deploying from GitHub

`.github/workflows/deploy.yml` runs the tests, builds, and deploys on every push to `main` or the
working branch. It uses `wrangler.assets.jsonc`, which uploads the app and map data as Cloudflare
static assets (so resort data is not bound by the 3 MB Worker limit) and leaves the Worker to serve
`/api/*` only. It needs two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

`npm run deploy` embeds the files in the Worker instead and only fits while the data stays under
3 MB compressed, which it no longer does: deploy by pushing.
