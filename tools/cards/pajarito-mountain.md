# Pajarito Mountain (pajarito-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**64 runs (42 named, 33.5 km), 6 lifts. 3 things to look at.**

- **LOOK**: 8 runs on the resort's list are not on the map  
  Bob's Bowl, Bread & Butter, East Road, Milt's Meadow, Mushroom, Oxbow Road, Porcupine Park, West Road (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 10 shown runs rated by guess  
  (no name)
- **LOOK**: 1 runs climb more than 12 m  
  Evershine Ridge 12 m
- info: 2 joins made automatically (look at the longest ones on the map)  
  Redemption top ski 55 m; Dogpatch top ski 61 m
- info: audit: no rating: 14, run climbs: 1, steep green: 1
- info: same counts as the previous build
- info: the resort's outline relation/4646922 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  50 on the list, 68 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 6 on the map
- pass: reachable from the base: 64 of 64 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
