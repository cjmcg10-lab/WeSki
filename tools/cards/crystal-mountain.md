# Crystal Mountain (crystal-mountain)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**140 runs (137 named, 59.0 km), 11 lifts. 5 things to look at.**

- **LOOK**: 6 runs on the resort's list are not on the map  
  A-Basin, Campbell Basin, Powder Bowl, Silver King, The Throne, Three Way Peak (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: resort areas mostly missing from the map: 2  
  High Campbell (3 of 4 runs missing); South (3 of 4 runs missing)
- **LOOK**: 1 shown runs rated by guess  
  pickhandle ridge
- **LOOK**: reachable from the base: 139 of 141 run pieces  
  not reachable: ['Three Way Exit Chute', 'pickhandle ridge']
- **LOOK**: 2 runs climb more than 12 m  
  Northway 17 m; I-405 30 m
- info: 111 joins made automatically (look at the longest ones on the map)  
  Double Ought's Right top walk 182 m; Double Ought's Right bottom ski 120 m; Hamburger top ski 222 m; Hamburger bottom ski 72 m; Summit Chute bottom ski 65 m; Narnia top walk 219 m; Narnia bottom walk 225 m; Silver Basin bottom walk 306 m; Three Way Exit Chute bottom ski 186 m; Powder 8s top walk 99 m; Hourglass top ski 66 m; Appliance Store top walk 45 m; Appliance Store bottom ski 40 m; Watch Out for Livestock bottom walk 50 m; SE Right bottom ski 54 m; Boxcar bottom ski 150 m; Damn Fine Forest top ski 66 m; Damn Fine Forest bottom walk 211 m; Brain Damage top ski 48 m; Brain Damage bottom walk 57 m; Rolling Knolls bottom ski 39 m; Chappelle's bottom ski 40 m; Stump Farm top ski 43 m; Upper
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (992447124, 186 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 3 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 1, flat black: 2, no rating: 1, run climbs: 2, run missing: 1
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  87 on the list, 142 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 11 of 11 on the map
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
