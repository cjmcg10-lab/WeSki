# Brighton (brighton)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**87 runs (62 named, 47.0 km), 8 lifts. 4 things to look at.**

- **LOOK**: 23 runs on the resort's list are not on the map  
  Boll Weevil, Boundary Chute, Captain Hook, Chicken Out, Clark's Roost, Diagonal Chute, Elk Park Access, Great Western, JB's, Majestic Main, Mary Main, Old Western, Pick 'Em Up, Race Course, Randy's Chute, SS Traverse, Sawbuck, Scree Chute, Short Shot, Slalom Hill, Spaghetti, State Street, Waterfall (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 87 of 89 run pieces  
  not reachable: ["Barrett's Glade", 'Solbright']
- **LOOK**: 2 runs climb more than 12 m  
  Scree Slope 14 m; Krista's 13 m
- **LOOK**: change from the previous build: runs 88 -> 87, named 63 -> 62, km 47.5 -> 47.0  
  fewer lifts or named runs than before: compare before pushing
- info: 1 joins made automatically (look at the longest ones on the map)  
  Barrett's Glade top walk 151 m
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  Barrett's Glade (1024649983, 472 m): hidden by hand: not on the resort's 2025 trail map; OpenStreetMap draws it outside the boundary, on the way to Solitude; (no name) (1305318996, 52 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: audit: dead end: 1, run climbs: 2
- pass: ratings checked against the resort's own list  
  79 on the list, 90 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 8 of 8 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
