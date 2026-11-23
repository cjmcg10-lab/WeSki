# Tignes – Val d'Isère (tignes-val-disere)

Built 2026-11-23 by tools/pipeline.py. Terrain: not rebuilt (--checks-only).

**397 runs (182 named, 254.3 km), 80 lifts. 4 things to look at.**

- **LOOK**: 2 runs on the resort's list are not on the map  
  Combe du Géant, Les Champions (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: 3 shown runs rated by guess  
  (no name), Chemin vers le Lavachet (piste non répertoriée), Stade de slalom Palafour
- **LOOK**: 4 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)  
  Termignon 1 (base): no way back; Termignon 1 (top): no way back; Termignon 2 (base): no way back; Termignon 2 (top): no way back (a one-way lift that carries skiers both ways: two_way_lifts; a lift top with no run down: links; a private or club lift: isolated_lifts with a note)
- **LOOK**: 3 runs climb more than 12 m  
  Pylônes 14 m; Triffollet 13 m; Col Pers 16 m
- info: 3 run pieces hidden (not on the resort's list and not a link)  
  (no name) (52876757, 1398 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (52876758, 512 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (210262360, 22 m): OpenStreetMap: private
- info: 8 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 6, lift missing: 4, no rating: 6, overlap: 1, run climbs: 5, steep green: 3
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  135 on the list, 205 matched, 0 corrected from OpenStreetMap
- pass: lifts on the resort's list: 67 of 67 on the map
