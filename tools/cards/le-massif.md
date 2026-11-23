# Le Massif (le-massif)

Built 2026-11-23 by tools/pipeline.py. Terrain: reused from the work folder.

**94 runs (66 named, 58.7 km), 9 lifts. 3 things to look at.**

- **LOOK**: ratings NOT checked: not ready to go live  
  make tools/official/<id>.json (a feed if there is one, else the trail map: see docs/ADDING_MOUNTAINS.md)
- **LOOK**: 20 shown runs rated by guess  
  (no name), Accès A, Accès B, Accès D, ClubMed Ski In, Hors Piste, Hors-Piste Ski-Out, Hors-Piste Zone 1, Hors-Piste Zone 2, Hors-Piste Zone 3, Hors-Piste Zone 4, Hors-Piste Zone 5
- **LOOK**: reachable from the base: 85 of 94 run pieces  
  not reachable: ['Hors Piste', 'Hors-Piste Ski-Out', 'Hors-Piste Zone 1', 'Hors-Piste Zone 2', 'Hors-Piste Zone 3', 'Hors-Piste Zone 4', 'Hors-Piste Zone 5']
- info: 10 joins made automatically (look at the longest ones on the map)  
  La Charlevoix (Haut) top walk 90 m; La Dominique Maltais top ski 150 m; Hors-Piste Zone 1 top ski 54 m; Hors-Piste Zone 2 top ski 56 m; Hors-Piste Zone 3 top ski 58 m; Hors-Piste Zone 3 bottom walk 242 m; ClubMed Ski In bottom ski 87 m; La Tremblay ski 132 m; unnamed#18 ski 16 m; Accès B ski 17 m
- info: audit: dead end: 3, lift missing: 1, no rating: 26
- info: same counts as the previous build
- pass: 0 lift ends cannot be reached or cannot get back to the rest (the tests fail on this)
- pass: 0 runs climb more than 12 m
