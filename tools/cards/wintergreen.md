# Wintergreen (wintergreen)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**24 runs (24 named, 10.4 km), 9 lifts. 1 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  Tequila (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: audit: flat black: 1, no rating: 1, run missing: 1, stub: 1
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  29 on the list, 33 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 5 of 5 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 24 of 24 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
