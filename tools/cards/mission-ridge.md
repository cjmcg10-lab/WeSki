# Mission Ridge (mission-ridge)

Built 2026-11-24 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**70 runs (59 named, 39.8 km), 7 lifts. 3 things to look at.**

- **LOOK**: 11 runs on the resort's list are not on the map  
  Bathtub, Bear Scat, Bomber Chute, Hertz, Hour Glass, Lip Lip Face, No Name, Pyramid Park, Squirrel Chute, Strawberry Short Cut, Upper Upper Toke (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 2 shown runs rated by guess  
  (no name)
- **LOOK**: 1 runs climb more than 12 m  
  Jackson's 28 m
- info: 9 joins made automatically (look at the longest ones on the map)  
  Windy Ridge/Microwave Traverse bottom ski 219 m; Windy 5 bottom ski 53 m; Windy 2 bottom ski 51 m; Windy 4 bottom ski 50 m; Paradise Bowl ski 376 m; Jackson's ski 43 m; Castle Face ski 147 m; Windy 5 ski 107 m; Windy 4 ski 91 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (62226668, 51 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: audit: flat black: 1, no rating: 3, run climbs: 2
- info: change from the previous build: runs 71 -> 70, km 40.1 -> 39.8
- pass: ratings checked against the resort's own list  
  78 on the list, 86 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 4 of 4 on the map
- pass: reachable from the base: 71 of 71 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
