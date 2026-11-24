# Sierra-at-Tahoe (sierra-at-tahoe)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**52 runs (49 named, 32.7 km), 13 lifts. 3 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  Escape (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 52 of 53 run pieces  
  not reachable: ['Rerun']
- **LOOK**: change from the previous build: runs 53 -> 52, named 50 -> 49, km 33.3 -> 32.7  
  fewer lifts or named runs than before: compare before pushing
- info: 2 joins made automatically (look at the longest ones on the map)  
  Clipper bottom ski 54 m; Horsetail top ski 56 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  Chair Line (unofficial) (1479813116, 565 m): hidden by hand: named unofficial in OpenStreetMap and not on the resort's trail map
- info: audit: flat black: 1
- pass: ratings checked against the resort's own list  
  51 on the list, 59 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 12 of 13 on the map  
   Small lifts not on the map: Fuego Magic Carpet
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
