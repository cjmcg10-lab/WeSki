# WeSki

An installable web app for ski resorts: a low-poly 3D mountain built from real
LiDAR terrain, a one-tap 2D map, private friend groups with live GPS, directions that reroute as
people move, run stats with playback, and full offline use.

**Live app:** https://weski.cjmcg10.workers.dev

## What's in it

| Area | Details |
| --- | --- |
| Start | Spinning globe with a resort picker (search or scroll); picking a resort zooms the globe down to the ground and continues, without a cut or fade, into the 3D map; “Choose a different resort” (More) reverses it, with a save / don't-save choice. Four Vermont resorts have built maps. |
| Maps | 3D mountain from USGS 1 m LiDAR (14 m mesh), every mapped trail, lifts with moving chairs, gondola and tram cabins on real cable loops, buildings, places, plus ~10 km of coarse surrounding terrain. 2D view with the base at the bottom. |
| Overlays | Difficulty colours and symbols, glades dashed, slow zones (green ▽) and terrain parks (orange ⬣) painted onto the snow surface. |
| Groups | Up to 20 people join by 6-character code. Location sharing is opt-in, can be paused, and shows when each person last updated. |
| Directions | To a friend, a place, a dropped pin or the group meeting point. Uses trails downhill, lifts uphill and walking links; avoids closures you mark; keeps to your max difficulty where possible and warns when a route must go above it. |
| Weather | Summit and base conditions, ski-specific alerts, 12-hour strip and 7-day forecast (Open-Meteo). |
| My tracks | Optional dotted breadcrumb trail on the map along everything you have skied; works with or without stats tracking (location-only tracks are never added to History). |
| Appearance | Dark by default, light mode in More. |
| Stats | Current / average / top speed, runs, distance, vertical. Lift rides counted separately; GPS spikes filtered. |
| History | Sessions, runs and routes are stored on the phone (IndexedDB) and can be replayed on the map, offline. |

## Data sources (all free)

- **Terrain:** USGS 3DEP 1 m DEM, project `VT_Statewide_A23` (public domain).
- **Trails, lifts, buildings, places:** © OpenStreetMap contributors (ODbL).
- **Surrounding terrain:** Mapzen/AWS Terrain Tiles. **Globe:** Natural Earth 1:50m and 1:10m, US Census state lines. **Weather:** Open-Meteo (CC BY 4.0).
- **Slow zones and terrain parks:** read from Jay Peak's Winter 2025–26 trail map and terrain parks
  page, then attached to the matching OSM trails in `tools/build_data.py`.

Closures are whatever the user (or their group) marks as confirmed closed; there is no live resort feed.
This is not an official Jay Peak product.

## Layout

```
tools/build_data.py   LiDAR + OSM -> public/data/terrain.bin + resort.json (incl. routing graph)
tools/embed.mjs       copies the built app into the Worker bundle
src/                  the app (three.js map, routing, tracker, group client, storage)
worker/               Cloudflare Worker: serves the app + GroupRoom Durable Object (WebSockets)
tests/                unit tests (routing, tracker, group rules)
```

## Resorts

Built maps: **Jay Peak, Stowe, Smugglers' Notch, Sugarbush** (all Vermont). Each resort is one folder
under `public/data/<id>/` and is downloaded and cached on the phone the first time it is opened.
History, saved tracks, closures and offline status are kept per resort.

Slow zones and terrain parks are only shown for Jay Peak so far; the other three have not been
checked against their trail maps yet.

### Adding a resort

1. Write `tools/resorts/<id>.json`: `id`, `name`, `region`, `tz`, `area_name` (the name of the resort's
   `landuse=winter_sports` area in OpenStreetMap, used to keep neighbouring ski areas out), optional
   `slow_zone_trails`, `parks`, `parks_between`, `two_way_lifts`, `skip_pois`, `zones_source`.
2. Download an OSM extract covering it (`api.openstreetmap.org/api/0.6/map?bbox=...`) and the USGS 1 m
   DEM tiles that cover it (The National Map).
3. Run:
   ```
   python3 tools/build_data.py tools/resorts/<id>.json <osm file> public/data/<id> <dem.tif> [...]
   python3 tools/build_extras.py public/data/<id>      # surrounding terrain
   python3 tools/build_index.py public/data            # resort list for the picker
   python3 tools/build_globe.py public/data            # globe outlines (detail box follows the resorts)
   npm test                                            # every lift end must route to every other
   ```
   `build_data.py` prints a connectivity report; fix the config (or OSM) if trails are unreachable.

All resort data currently ships inside the Worker bundle (free limit 3 MB compressed; four resorts
use about 2.2 MB). Adding many more means moving `public/data/` to static asset hosting.

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
