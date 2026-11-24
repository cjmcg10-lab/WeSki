# The Highlands (boyne-highlands)

Built 2026-11-24 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**55 runs (54 named, 23.4 km), 7 lifts. 2 things to look at.**

- **LOOK**: 2 runs on the resort's list are not on the map  
  Molly's Way, Sugar & Spice (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 shown runs rated by guess  
  Amy's Terrain Park
- info: 5 joins made automatically (look at the longest ones on the map)  
  North Camelot top ski 45 m; Couloir bottom ski 63 m; Steins Chute Glade bottom ski 39 m; The Sound of Skiing ski 62 m; North Challenger ski 3 m
- info: audit: flat black: 1, no rating: 1
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  53 on the list, 86 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 6 of 6 on the map
- pass: reachable from the base: 55 of 55 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
