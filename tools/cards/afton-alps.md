# Afton Alps (afton-alps)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**50 runs (37 named, 12.9 km), 20 lifts. 3 things to look at.**

- **LOOK**: 2 runs on the resort's list are not on the map  
  Meadows Maze, Tucker's Trench (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- info: 3 run pieces hidden (not on the resort's list and not a link)  
  (no name) (543987731, 48 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (709782246, 25 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (709782245, 24 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: audit: no rating: 5, run missing: 1
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  32 on the list, 60 matched, 0 corrected from OpenStreetMap
- pass: reachable from the base: 53 of 53 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
