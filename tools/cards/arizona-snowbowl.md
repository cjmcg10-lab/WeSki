# Arizona Snowbowl (arizona-snowbowl)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**56 runs (51 named, 23.1 km), 8 lifts. 1 things to look at.**

- **LOOK**: 8 runs on the resort's list are not on the map  
  Fort Valley Glades, Frontier, Jeep Trail, Larry's Line, Mo's Bowl, North Rim Glades, Round Up, Sunset Boulevard (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: 5 joins made automatically (look at the longest ones on the map)  
  Chipmunk Chase top ski 87 m; Upper Sundance top ski 88 m; Ship Rocks top ski 89 m; Big Bowl top walk 248 m; Ship Rocks ski 354 m
- info: same counts as the previous build
- info: the resort's outline relation/3187211 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  59 on the list, 76 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 6 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 56 of 56 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
