# Aspen Mountain (aspen-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**176 runs (143 named, 71.6 km), 6 lifts. 4 things to look at.**

- **LOOK**: 3 runs on the resort's list are not on the map  
  Beattie Way, Gentlemen's Ridge, Tower 7 Road (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 2 shown runs rated by guess  
  America's Downhill
- **LOOK**: 1 runs climb more than 12 m  
  Lud's Lane 14 m
- **LOOK**: change from the previous build: runs 174 -> 176, named 144 -> 143  
  fewer lifts or named runs than before: compare before pushing
- info: 16 joins made automatically (look at the longest ones on the map)  
  Schuss Gully bottom ski 55 m; Franklin Dump bottom ski 40 m; Silver Rush top ski 64 m; Bonnie Bell top ski 73 m; Niagra bottom ski 74 m; Legal Tender bottom ski 58 m; Here's To... bottom ski 59 m; Lens Cap top ski 47 m; Copper Connector top ski 55 m; Bingo Glades bottom walk 75 m; Buckhorn ski 5 m; Sunrise/Sunset ski 66 m; Face of Bell ski 45 m; Face of Bell ski 41 m; Powerline ski 110 m; Rewrite ski 55 m
- info: audit: flat black: 1, no rating: 3, run climbs: 1, run missing: 2
- pass: ratings checked against the resort's own list  
  128 on the list, 218 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 6 on the map
- pass: reachable from the base: 176 of 176 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
