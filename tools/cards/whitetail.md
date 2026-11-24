# Whitetail (whitetail)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**22 runs (22 named, 10.9 km), 8 lifts. 1 things to look at.**

- **LOOK**: 1 runs on the resort's list are not on the map  
  101 (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: same counts as the previous build
- info: the resort's outline relation/13532756 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  21 on the list, 30 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 8 of 8 on the map
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 22 of 22 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
