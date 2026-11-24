# Snow Valley Mountain (snow-valley-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**37 runs (28 named, 12.2 km), 13 lifts. 2 things to look at.**

- **LOOK**: 4 runs on the resort's list are not on the map  
  Bobcat Alley, Snake Run, The Edge, West Run (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- info: 3 joins made automatically (look at the longest ones on the map)  
  East Bowl top ski 73 m; Little Bowl top ski 55 m; unnamed#14 ski 285 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (661883702, 71 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 2 lifts flagged for review were already on the previous build (checked then)
- info: audit: flat black: 1, no rating: 2
- info: same counts as the previous build
- info: the resort's outline relation/10534510 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  30 on the list, 43 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 11 of 11 on the map
- pass: reachable from the base: 38 of 38 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
