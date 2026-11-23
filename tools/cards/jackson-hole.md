# Jackson Hole (jackson-hole)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**195 runs (143 named, 113.5 km), 17 lifts. 2 things to look at.**

- **LOOK**: 6 runs on the resort's list are not on the map  
  Easiest Way, Fig's Cut, Headwall, Moran Face, Saratoga Bowl, Teewinot Face (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 187 of 196 run pieces  
  not reachable: ['Cody Bowl', 'Four Shadows', 'No Shadows', 'Powder 8', 'Pucker Face', 'Rock Springs Bowl', 'unnamed#80']
- info: 11 joins made automatically (look at the longest ones on the map)  
  Pucker Face top walk 217 m; Four Shadows top walk 151 m; Powder 8 top walk 186 m; No Shadows top walk 119 m; Rock Springs Bowl top ski 112 m; Hoops Gap top ski 38 m; None top ski 190 m; Headwall Traverse walk 222 m; Gannett ski 70 m; St John's ski 18 m; Upper Werner ski 10 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1293308186, 212 m): OpenStreetMap: backcountry, no name (not a resort run)
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 1, flat black: 4, run climbs: 2
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  116 on the list, 185 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 13 of 13 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
