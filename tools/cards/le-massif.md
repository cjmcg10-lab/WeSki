# Le Massif (le-massif)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**85 runs (59 named, 50.8 km), 9 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 12 shown runs rated by guess  
  (no name), Accès A, Accès B, Accès D, ClubMed Ski In
- **LOOK**: change from the previous build: runs 94 -> 85, named 66 -> 59, km 58.7 -> 50.8  
  fewer lifts or named runs than before: compare before pushing
- info: 6 joins made automatically (look at the longest ones on the map)  
  La Charlevoix (Haut) top walk 90 m; La Dominique Maltais top ski 150 m; ClubMed Ski In bottom ski 87 m; La Tremblay ski 132 m; unnamed#18 ski 16 m; Accès B ski 17 m
- info: audit: lift missing: 1, no rating: 18
- pass: reachable from the base: 85 of 85 run pieces
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
