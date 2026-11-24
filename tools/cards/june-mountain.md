# June Mountain (june-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**35 runs (29 named, 25.5 km), 7 lifts. 1 things to look at.**

- **LOOK**: 11 runs on the resort's list are not on the map  
  Bodie, Bowling Alley, Bunker Hill, Comstock, Danny's, Gull Ridge, IQ, Slalom, Spike Camp Trail, Surprise, The Wall (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- info: 4 joins made automatically (look at the longest ones on the map)  
  Carson Cutoff bottom ski 57 m; Carson bottom ski 53 m; Carson walk 227 m; The Face ski 20 m
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: change from the previous build: km 25.6 -> 25.5
- info: the resort's outline relation/4639999 has no name or is not in the download: the build starts from the resort's lifts instead (include_ways)
- pass: ratings checked against the resort's own list  
  38 on the list, 38 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 7 on the map  
   Small lifts not on the map: Public Carpet
- pass: resort areas mostly missing from the map: 0
- pass: 0 shown runs rated by guess
- pass: reachable from the base: 35 of 35 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
- pass: audit: nothing flagged
