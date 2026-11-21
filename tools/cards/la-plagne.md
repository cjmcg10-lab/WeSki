# La Plagne (la-plagne)

Built 2026-11-21 by tools/pipeline.py. Terrain: ign.

**341 runs (162 named, 204.3 km), 87 lifts. 4 things to look at.**

- **LOOK**: 2 runs on the resort's list are not on the map  
  Croes, Jarsey (draw them, or explain them in the official json: same_as / not_runs / elsewhere)
- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: 8 shown runs rated by guess  
  (no name), Départ MMV, Retour Lagrange Vacances - Aspen, Retour MMV, Stade de slalom Belle Plagne, Stade de slalom Dahu, Stade de slalom Plan Leschaux
- **LOOK**: 1 runs climb more than 12 m  
  Charmettes 16 m
- info: 7 joins made automatically (look at the longest ones on the map)  
  None top ski 142 m; None bottom ski 44 m; Les Laines bottom ski 44 m; Retour Lagrange Vacances - Aspen bottom ski 131 m; None top ski 91 m; None bottom ski 86 m; Loup Garou ski 35 m
- info: 5 run pieces hidden (not on the resort's list and not a link)  
  (no name) (1192844355, 522 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (669189284, 483 m): OpenStreetMap: backcountry, no name (not a resort run); (no name) (1097038373, 48 m): unnamed piece, not on the resort's list, leads nowhere on it; (no name) (1019781477, 30 m): unnamed piece, not on the resort's list, not joined to it; (no name) (1019781481, 17 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 4 lifts flagged for review were already on the previous build (checked then)
- info: audit: flat black: 4, no rating: 12, run climbs: 3, stub: 1
- info: change from the previous build: runs 339 -> 341, lifts 85 -> 87, km 202.4 -> 204.3
- info: FOUND MORE: the resort reaches beyond its download box; the box was widened from [6.6, 45.46, 6.78, 45.6] to [6.6, 45.4483, 6.7829, 45.6]
- pass: ratings checked against the resort's own list  
  114 on the list, 181 matched, 0 corrected from OpenStreetMap
- pass: reachable from the base: 346 of 346 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
