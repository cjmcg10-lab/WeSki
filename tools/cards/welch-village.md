# Welch Village (welch-village)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**54 runs (48 named, 14.6 km), 10 lifts. 2 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Amazing Grace, Cannon Ball, Jon Jon, Ski Bob (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- info: 1 joins made automatically (look at the longest ones on the map)  
  unnamed#34 ski 4 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (889421049, 48 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 2 lifts flagged for review were already on the previous build (checked then)
- info: audit: no rating: 1
- info: change from the previous build: runs 57 -> 54, km 14.8 -> 14.6
- pass: ratings checked against the resort's own list  
  51 on the list, 85 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 9 of 10 on the map  
   Small lifts not on the map: Rope Tow
- pass: reachable from the base: 55 of 55 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
