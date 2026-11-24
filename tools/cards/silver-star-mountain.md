# Silver Star Mountain (silver-star-mountain)

Built 2026-11-24 by tools/pipeline.py. Terrain: reused from the work folder.

**193 runs (142 named, 110.1 km), 11 lifts. 3 things to look at.**

- **LOOK**: 3 runs on the resort's list are not on the map  
  Bronco's Pitch, Campbell's Loop, Jimmie's Home Run (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 1 shown runs rated by guess  
  (no name)
- **LOOK**: reachable from the base: 195 of 204 run pieces  
  not reachable: ['After Me', 'After You', 'Alder Point', 'Bear Claw', 'Cougar Run', 'Valhalla Ridge Access (Hike)']
- info: 11 joins made automatically (look at the longest ones on the map)  
  Busback bottom walk 87 m; Soreback bottom walk 77 m; Criss Cross top ski 123 m; Attridge Run Out bottom ski 52 m; Main Street Skiway bottom walk 74 m; Silverwoods Skiway bottom ski 50 m; Chalet Alley top ski 41 m; Face top ski 63 m; Snake Pit bottom ski 45 m; Cougar Run ski 163 m; Outback ski 144 m
- info: 11 run pieces hidden (not on the resort's list and not a link)  
  After You (66207980, 1236 m): hidden by hand: not on the resort's 2025 trail map (unnamed lines in the limited access area beyond Alder Point at most); no lift reaches them; Cougar Run (524276059, 1172 m): hidden by hand: not on the resort's 2025 trail map (unnamed lines in the limited access area beyond Alder Point at most); no lift reaches them; After Me (66207981, 1129 m): hidden by hand: not on the resort's 2025 trail map (unnamed lines in the limited access area beyond Alder Point at most);
- info: audit: dead end: 2, no rating: 6, run climbs: 1, stub: 2
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  130 on the list, 215 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 7 of 7 on the map
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
