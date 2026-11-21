# Jackson Hole (jackson-hole)

Built 2026-11-21 by tools/pipeline.py. Terrain: USGS WY_GrandTetonNP_D22 (gaps filled from WY_North_Converse_2020_D20, WY GrandTetonElkRefuge 2014, 10 m national elevation model (1/3 arc-second)).

**195 runs (143 named, 113.5 km), 17 lifts. 2 things to look at.**

- **LOOK**: 6 runs on the resort's list are not on the map  
  Easiest Way, Fig's Cut, Headwall, Moran Face, Saratoga Bowl, Teewinot Face (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 187 of 196 run pieces  
  not reachable: ['Cody Bowl', 'Four Shadows', 'No Shadows', 'Powder 8', 'Pucker Face', 'Rock Springs Bowl', 'unnamed#122']
- info: 11 joins made automatically (look at the longest ones on the map)  
  Rock Springs Bowl top ski 112 m; Pucker Face top walk 217 m; Four Shadows top walk 151 m; Powder 8 top walk 186 m; No Shadows top walk 119 m; None top ski 190 m; Hoops Gap top ski 38 m; Headwall Traverse walk 222 m; Gannett ski 70 m; St John's ski 18 m; Upper Werner ski 10 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1293308186, 212 m): OpenStreetMap: backcountry, no name (not a resort run)
- info: 1 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 1, flat black: 4, run climbs: 2
- info: change from the previous build: runs 185 -> 195, named 138 -> 143, km 101.0 -> 113.5
- info: FOUND MORE: the resort reaches beyond its download box; the box was widened from [-110.8872, 43.5707, -110.8067, 43.6232] to [-110.9016, 43.5707, -110.8067, 43.6232]
- pass: ratings checked against the resort's own list  
  116 on the list, 185 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 13 of 13 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
