# WeSki — Jay Peak

An installable web app for skiing Jay Peak Resort (Vermont): a low-poly 3D mountain built from real
LiDAR terrain, a one-tap 2D map, private friend groups with live GPS, directions that reroute as
people move, run stats with playback, and full offline use.

**Live app:** https://weski.cjmcg10.workers.dev

## What's in it

| Area | Details |
| --- | --- |
| Start | Spinning globe with a resort picker (search or scroll); picking a resort zooms the globe down to the ground and continues, without a cut or fade, into the 3D map; “Choose a different resort” (More) reverses it, with a save / don't-save choice. Only Jay Peak has a built map so far. |
| Maps | 3D mountain from USGS 1 m LiDAR (14 m mesh), all 107 mapped trail segments, 9 lifts with moving chairs and tram cabins, 99 buildings, places, plus ~10 km of coarse surrounding terrain. 2D top-down toggle. |
| Overlays | Difficulty colours and symbols, glades dashed, slow zones (green ▽) and terrain parks (orange ⬣) painted onto the snow surface. |
| Groups | Up to 20 people join by 6-character code. Location sharing is opt-in, can be paused, and shows when each person last updated. |
| Directions | To a friend, a place, a dropped pin or the group meeting point. Uses trails downhill, lifts uphill and walking links; avoids closures you mark; keeps to your max difficulty where possible and warns when a route must go above it. |
| Weather | Summit and base conditions, ski-specific alerts, 12-hour strip and 7-day forecast (Open-Meteo). |
| My tracks | Optional dotted breadcrumb trail on the map along everything you have skied (this session or all saved sessions). |
| Appearance | Dark by default, light mode in More. |
| Stats | Current / average / top speed, runs, distance, vertical. Lift rides counted separately; GPS spikes filtered. |
| History | Sessions, runs and routes are stored on the phone (IndexedDB) and can be replayed on the map, offline. |

## Data sources (all free)

- **Terrain:** USGS 3DEP 1 m DEM, project `VT_Statewide_A23` (public domain).
- **Trails, lifts, buildings, places:** © OpenStreetMap contributors (ODbL).
- **Surrounding terrain:** Mapzen/AWS Terrain Tiles. **Globe:** Natural Earth 1:110m. **Weather:** Open-Meteo (CC BY 4.0).
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

## Develop

```
npm install
npm test
npm run worker:dev     # build + run Worker locally on http://127.0.0.1:8787
npm run deploy         # build + wrangler deploy (needs a Cloudflare API token)
```

Rebuilding the map data (only needed if OSM or the zone lists change):

```
pip install rasterio pyproj shapely numpy
# DEM tiles: USGS_1M_18_x69y498_VT_Statewide_A23.tif and ..._x69y499_... from The National Map
# OSM: https://api.openstreetmap.org/api/0.6/map?bbox=-72.57,44.895,-72.46,44.975
python3 tools/build_data.py osm.xml public/data x69y498.tif x69y499.tif
python3 tools/build_extras.py public/data     # surrounding terrain + globe outlines
```

Everything runs on Cloudflare's free tier: one Worker (app files are bundled into it) and one
SQLite-backed Durable Object class. A group's shared locations are deleted when its creator closes
it or after 12 hours without activity.
