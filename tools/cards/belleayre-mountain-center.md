# Belleayre Mountain Ski Center (belleayre-mountain-center)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**90 runs (63 named, 41.3 km), 8 lifts. 2 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 4 shown runs rated by guess  
  (no name), Connector
- info: 6 joins made automatically (look at the longest ones on the map)  
  Glide top ski 43 m; Yahoo bottom ski 48 m; Chinook top ski 55 m; Delaware Local ski 97 m; Esopus ski 70 m; Big Indian ski 281 m
- info: 5 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1362769408, 326 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (1362769405, 275 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (1362769412, 242 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (1362769401, 155 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (1362769410, 98 m): OpenStreetMap: backcountry, no name (not a resort run)
- info: audit: dead end: 4, lift missing: 6, no rating: 5
- info: same counts as the previous build
- pass: reachable from the base: 95 of 95 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
