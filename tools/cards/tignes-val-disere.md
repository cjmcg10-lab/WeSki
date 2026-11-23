# Tignes – Val d'Isère (tignes-val-disere)

Built 2026-11-23 by tools/pipeline.py. Terrain: rebuilt from the existing map (no download).

**379 runs (181 named, 253.9 km), 78 lifts. 6 things to look at.**

- **LOOK**: 2 runs on the resort's list are not on the map  
  Combe du Géant, Les Champions (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: 3 shown runs rated by guess  
  (no name), Chemin vers le Lavachet (piste non répertoriée), Stade de slalom Palafour
- **LOOK**: reachable from the base: 380 of 383 run pieces  
  not reachable: ['Couloir de petite balme', 'Retour Lavachet', 'couloir de grande balme']
- **LOOK**: 4 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)  
  Termignon 1 (base): no way back; Termignon 1 (top): no way back; Termignon 2 (base): no way back; Termignon 2 (top): no way back (a one-way lift that carries skiers both ways: two_way_lifts; a lift top with no run down: links; a private or club lift: isolated_lifts with a note)
- **LOOK**: 3 runs climb more than 12 m  
  Pylônes 14 m; Triffollet 13 m; Col Pers 16 m
- info: 16 joins made automatically (look at the longest ones on the map)  
  couloir de grande balme top walk 41 m; None top ski 42 m; Couloir de petite balme bottom walk 126 m; None top ski 65 m; Chemin vers le Lavachet (piste non répertoriée) top ski 83 m; Digues bottom ski 60 m; Lavachet top ski 44 m; Chemin vers le Lavachet (piste non répertoriée) top ski 60 m; Couloir de la Table d'orientation top ski 67 m; Face de Bellevarde top walk 67 m; None top ski 64 m; Face de Bellevarde walk 194 m; Cafo ski 56 m; Arcosses ski 121 m; unnamed#193 ski 61 m; Liaison Myrtilles Pitots ski 49 m
- info: 4 run pieces hidden (not on the resort's list and not a link)  
  (no name) (52876757, 1398 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (52876758, 512 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (30769981, 69 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (30736407, 46 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 8 lifts flagged for review were already on the previous build (checked then)
- info: audit: dead end: 4, lift missing: 4, no rating: 6, overlap: 1, run climbs: 5, run missing: 1, steep green: 3, stub: 2
- info: change from the previous build: runs 378 -> 379, km 253.6 -> 253.9
- info: build_canopy.py did not finish: build_canopy.py failed:
- pass: ratings checked against the resort's own list  
  135 on the list, 204 matched, 0 corrected from OpenStreetMap
