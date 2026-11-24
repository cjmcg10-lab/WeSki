# Northstar at Tahoe (northstar-at-tahoe)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**136 runs (92 named, 84.1 km), 20 lifts. 3 things to look at.**

- **LOOK**: 5 runs on the resort's list are not on the map  
  Bearly, Coyote Fork, Easy Street, Lookout Glade, Why Not (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 5 shown runs rated by guess  
  (no name)
- **LOOK**: change from the previous build: runs 147 -> 136, km 84.3 -> 84.1  
  fewer lifts or named runs than before: compare before pushing
- info: 9 joins made automatically (look at the longest ones on the map)  
  Home Run top ski 75 m; Sugar Pine glade top ski 45 m; Sugar Pine glade bottom ski 42 m; Camp Glade top ski 117 m; Camp Glade bottom ski 53 m; White Rabbit bottom ski 61 m; Home Run bottom ski 60 m; The Woods bottom ski 49 m; The Woods top ski 49 m
- info: 3 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1095504513, 94 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (1581741737, 30 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (1581741738, 15 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 2 lifts flagged for review were already on the previous build (checked then)
- info: audit: no rating: 28
- pass: ratings checked against the resort's own list  
  87 on the list, 125 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 14 of 14 on the map
- pass: reachable from the base: 139 of 139 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
