# Granite Peak (granite-peak)

Built 2026-11-24 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**60 runs (59 named, 21.8 km), 7 lifts. 2 things to look at.**

- **LOOK**: 9 runs on the resort's list are not on the map  
  Berg's Boundary, Eastern Escape, Enchanted Forest, Overlook, Prange's Glade, Robin Hood, Rock Pile Woods, Sherwood, Summit Trail (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 shown runs rated by guess  
  Buffett's Pass
- info: 4 joins made automatically (look at the longest ones on the map)  
  Elk Run top ski 43 m; Slalom top ski 43 m; Sundance top ski 43 m; Slalom ski 121 m
- info: audit: flat black: 1, no rating: 6
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  61 on the list, 79 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 6 on the map
- pass: reachable from the base: 60 of 60 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
