# Whitewater (whitewater)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**104 runs (95 named, 60.5 km), 5 lifts. 4 things to look at.**

- **LOOK**: 19 runs on the resort's list are not on the map  
  Air Puppy, Base Area Ski Way, Black Dog, Fall Line, Glory Ski Way, Gnarl Factor, Gold Pan, Gus Bus Gully, Hummingbird Trees, Monkey Trees, Nugget Trees, Pipeline, Planet Dano, Short Side, Shrine Ski Way, Sleeper, Sleeper Ski Way, Stanger Steeps, White Lightning (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: reachable from the base: 105 of 106 run pieces  
  not reachable: ['Trash Chutes']
- **LOOK**: 3 runs climb more than 12 m  
  Trash Chutes 24 m; Catch Basin 36 m; Catch Basin Ski Way 28 m
- **LOOK**: change from the previous build: runs 105 -> 104, named 96 -> 95, km 61.9 -> 60.5  
  fewer lifts or named runs than before: compare before pushing
- info: 18 joins made automatically (look at the longest ones on the map)  
  Catch Basin bottom ski 61 m; Trash Traverse top ski 66 m; Parking Lot Ski Way top ski 94 m; B Shaft top ski 93 m; A Shaft top ski 94 m; Goat's Corner top walk 51 m; Goat Trees top walk 86 m; Goat Trees bottom ski 52 m; Goat's top walk 117 m; None bottom ski 241 m; Jann's Gully top ski 94 m; Jann's Gully bottom ski 56 m; Goat Trees walk 197 m; Powder Keg Bowl walk 77 m; Jann's Gully ski 318 m; unnamed#104 ski 55 m; Faceplant ski 223 m; Trash Glades ski 137 m
- info: 2 run pieces hidden (not on the resort's list and not a link)  
  Trash Chutes (239618380, 1326 m): hidden by hand: not on the 2026-27 trail lists (the resort lists Trash Traverse and Trash Glades); its top is 77 m above the Glory Ridge top with no lift or bootpack to it (OpenStreetMap only); (no name) (1574321976, 930 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: audit: flat black: 4, no rating: 1, run climbs: 4
- pass: ratings checked against the resort's own list  
  121 on the list, 167 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 5 of 5 on the map
- pass: 0 shown runs rated by guess
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
