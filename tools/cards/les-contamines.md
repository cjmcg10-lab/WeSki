# Les Contamines (les-contamines)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**96 runs (46 named, 70.3 km), 27 lifts. 3 things to look at.**

- **LOOK**: no lift list from the resort: put the trail map's lift names in the official json as "lifts"  
  without it a missing chair or area cannot be noticed (map_read.py notes: lines "Lift: <name>")
- **LOOK**: reachable from the base: 95 of 97 run pieces  
  not reachable: ['Dahu', 'Morgiers']
- **LOOK**: 50 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)  
  Ruelle (base): no way back; Ruelle (top): no way back; Col du Joly (base): no way back; Col du Joly (top): no way back; Choton (base): no way back; Choton (top): no way back; Pierres Blanches (base): no way back; Pierres Blanches (top): no way back; Ruelle (base): no way back; Ruelle (top): no way back; Plans (base): no way back; Plans (top): no way back; Nant Rouge (base): no way back; Nant Rouge (top): no way back; Tierces (base): no way back; Tierces (top): no way back; Aiguille Croche (base) (a one-way lift that carries skiers both ways: two_way_lifts; a lift top with no run down: links; a private or club lift: isolated_lifts with a note)
- info: 2 joins made automatically (look at the longest ones on the map)  
  Retour Lay bottom ski 130 m; Liaison ski 100 m
- info: 1 run pieces hidden (not on the resort's list and not a link)  
  (no name) (759233989, 52 m): unnamed piece, not on the resort's list, leads nowhere on it
- info: 2 lifts flagged for review were already on the previous build (checked then)
- info: audit: flat black: 2, no rating: 1, run climbs: 1
- info: same counts as the previous build
- pass: ratings checked against the resort's own list  
  45 on the list, 67 matched, 0 corrected from OpenStreetMap
- pass: 0 shown runs rated by guess
- pass: 0 runs climb more than 12 m
