# Pajarito Mountain (pajarito-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**64 runs (42 named, 33.5 km), 6 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 10 shown runs rated by guess  
  (no name)
- **LOOK**: 1 runs climb more than 12 m  
  Evershine Ridge 12 m
- info: 2 joins made automatically (look at the longest ones on the map)  
  Redemption top ski 55 m; Dogpatch top ski 61 m
- info: audit: no rating: 14, run climbs: 1, steep green: 1
- info: same counts as the previous build
- info: the resort's outline relation/4646922 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: reachable from the base: 64 of 64 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
