# Gunstock Recreation Area (gunstock-recreation)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**68 runs (51 named, 25.7 km), 6 lifts. 3 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  Penny's Playground (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 2 shown runs rated by guess  
  (no name)
- **LOOK**: change from the previous build: runs 76 -> 68, km 25.9 -> 25.7  
  fewer lifts or named runs than before: compare before pushing
- info: 1 joins made automatically (look at the longest ones on the map)  
  Upper Sidearm ski 3 m
- info: audit: no rating: 5
- pass: ratings checked against the resort's own list  
  48 on the list, 67 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 7 on the map  
   Small lifts not on the map: EZ Carpet
- pass: reachable from the base: 68 of 68 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
